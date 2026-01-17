import {
  generateText,
  streamText,
  Output,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { getModel } from "@/providers/providers";
import type {
  AgentConfig,
  AgentResponse,
  StreamingAgentResponse,
  StructuredAgentResponse,
  StructuredSchema,
  ToolCallInfo,
  ToolResultInfo,
  StepInfo,
  AgentUsage,
} from "@/types/Agent";
import log from "@/utils/logger";
import useFraudeStore from "@/store/useFraudeStore";

// ============================================================================
// Helper to extract usage from SDK response
// ============================================================================

function extractUsage(usage: unknown): AgentUsage {
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    return {
      promptTokens: typeof u.inputTokens === "number" ? u.inputTokens : 0,
      completionTokens: typeof u.outputTokens === "number" ? u.outputTokens : 0,
      totalTokens:
        (typeof u.inputTokens === "number" ? u.inputTokens : 0) +
        (typeof u.outputTokens === "number" ? u.outputTokens : 0),
    };
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * A provider-agnostic Agent class that provides a unified interface for
 * interacting with various LLM providers (Groq, Ollama, OpenRouter, etc.)
 */
export default class Agent {
  private config: AgentConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;

  constructor(config: AgentConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      maxSteps: 5,
      autoExecuteTools: true,
      ...config,
    };
    this.model = getModel(config.model);
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  /**
   * Send a message and get a complete response.
   * Supports both simple string input and full message history.
   */
  async chat(
    input: string,
    options?: Partial<AgentConfig>
  ): Promise<AgentResponse> {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await generateText({
      model: this.model as Parameters<typeof generateText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    // Update conversation history
    contextManager.addContext(result.response.messages);

    return this.mapResponse(result);
  }

  /**
   * Stream a response in real-time.
   * Returns an async iterable for text chunks and a promise for the full response.
   */
  stream(
    input: string,
    options?: Partial<AgentConfig>
  ): StreamingAgentResponse {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = streamText({
      model: this.model as Parameters<typeof streamText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      abortSignal: mergedConfig.abortSignal,
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && mergedConfig.onTextChunk) {
          mergedConfig.onTextChunk(chunk.text);
        }
      },
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    return {
      stream: result.fullStream,
      response: this.buildStreamingResponse(result, messages),
    };
  }

  /**
   * Generate a structured object that conforms to a Zod schema.
   * Useful for extracting data, function calling, or typed responses.
   *
   * @example
   * ```typescript
   * const schema = z.object({
   *   name: z.string(),
   *   age: z.number(),
   * });
   *
   * const result = await agent.generate("John is 25 years old", schema);
   * console.log(result.object); // { name: "John", age: 25 }
   * ```
   */
  async generate<T>(
    input: string,
    schema: StructuredSchema<T>,
    options?: Partial<AgentConfig> & {
      schemaName?: string;
      schemaDescription?: string;
    }
  ): Promise<StructuredAgentResponse<T>> {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await generateText({
      model: this.model as Parameters<typeof generateText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      output: Output.object({
        schema,
        name: options?.schemaName,
        description: options?.schemaDescription,
      }),
    });

    return {
      object: result.output as T,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      raw: result,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update the agent's configuration
   */
  configure(options: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...options };

    // If model changed, update the model instance
    if (options.model) {
      this.model = getModel(options.model);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Switch to a different model
   */
  setModel(modelName: string): void {
    this.config.model = modelName;
    this.model = getModel(modelName);
  }

  /**
   * Update the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
  }

  /**
   * Register tools for the agent to use
   */
  setTools(tools: AgentConfig["tools"]): void {
    this.config.tools = tools;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapResponse(
    result: Awaited<ReturnType<typeof generateText>>
  ): AgentResponse {
    const steps: StepInfo[] =
      result.steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 })
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];
    const toolResults: ToolResultInfo[] = [];

    // Aggregate all tool calls/results from steps
    for (const step of steps) {
      toolCalls.push(...step.toolCalls);
      toolResults.push(...step.toolResults);
    }

    return {
      text: result.text,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      steps,
      toolCalls,
      toolResults,
      raw: result,
    };
  }

  private mapStepInfo(step: Record<string, unknown>): StepInfo {
    const toolCalls = step.toolCalls as
      | Array<Record<string, unknown>>
      | undefined;
    const toolResults = step.toolResults as
      | Array<Record<string, unknown>>
      | undefined;

    log(`Step ${step.stepNumber}: ${JSON.stringify(step, null, 2)}`);

    return {
      stepNumber: (step.stepNumber as number) ?? 0,
      text: (step.text as string) ?? "",
      toolCalls:
        toolCalls?.map((tc) => ({
          toolCallId: tc.toolCallId as string,
          toolName: tc.toolName as string,
          args: tc.args,
        })) ?? [],
      toolResults:
        toolResults?.map((tr) => ({
          toolCallId: tr.toolCallId as string,
          toolName: tr.toolName as string,
          result: tr.result,
        })) ?? [],
      finishReason: (step.finishReason as string) ?? "unknown",
    };
  }

  private async buildStreamingResponse(
    result: ReturnType<typeof streamText>,
    messages: ModelMessage[]
  ): Promise<AgentResponse> {
    const contextManager = useFraudeStore.getState().contextManager;
    // Wait for the stream to complete
    const finalResult = await result;

    // Update conversation history
    const responseMessages = await result.response;
    contextManager.addContext(responseMessages.messages);

    const text = await result.text;
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const steps = await result.steps;

    const mappedSteps: StepInfo[] =
      steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 })
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];
    const toolResults: ToolResultInfo[] = [];

    for (const step of mappedSteps) {
      toolCalls.push(...step.toolCalls);
      toolResults.push(...step.toolResults);
    }

    return {
      text,
      usage: extractUsage(usage),
      finishReason: finishReason ?? "unknown",
      steps: mappedSteps,
      toolCalls,
      toolResults,
      raw: finalResult,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an agent with a specific role/persona
 */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
