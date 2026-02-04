import { generateText, streamText, stepCountIs, type ModelMessage } from "ai";
import path from "path";
import fs from "fs";
import { getModel } from "@/providers/providers";
import type {
  AgentConfig,
  AgentResponse,
  ToolCallInfo,
  StepInfo,
} from "@/types/Agent";
import log from "@/utils/logger";
import useFraudeStore from "@/store/useFraudeStore";
import { incrementModelUsage } from "@/config/settings";
import type { TokenUsage } from "@/types/TokenUsage";
import { handleStreamChunk } from "@/utils/streamHandler";
import ContextManager from "@/agent/contextManager";

// ============================================================================
// Helper to extract usage from SDK response
// ============================================================================

function extractUsage(usage: unknown): TokenUsage {
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, number | undefined>;
    const promptTokens = u.promptTokens ?? u.inputTokens ?? 0;
    const completionTokens = u.completionTokens ?? u.outputTokens ?? 0;
    const totalTokens = u.totalTokens ?? promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function resolveFileReferences(input: string): string {
  // Replace @path/to/file with absolute path
  return input.replace(/@([^\s]+)/g, (match, ref) => {
    try {
      // Remove trailing punctuation that shouldn't be part of the path
      const matchPunct = ref.match(/([.,;?!:]+)$/);
      let possiblePath = ref;
      let suffix = "";

      if (matchPunct) {
        suffix = matchPunct[1];
        possiblePath = ref.substring(0, ref.length - suffix.length);
      }

      const fullPath = path.resolve(process.cwd(), possiblePath);
      if (fs.existsSync(fullPath)) {
        return fullPath + suffix;
      }

      // Fallback: check raw ref in case punctuation is part of filename
      const fullPathOriginal = path.resolve(process.cwd(), ref);
      if (fs.existsSync(fullPathOriginal)) {
        return fullPathOriginal;
      }
    } catch {
      // ignore
    }
    return match;
  });
}

async function experimental_repairToolCall(failed: any) {
  const lower = failed.toolCall.toolName.toLowerCase();
  if (lower !== failed.toolCall.toolName && failed.tools?.[lower]) {
    return {
      ...failed.toolCall,
      toolName: lower,
    };
  }
  return {
    ...failed.toolCall,
    input: JSON.stringify({
      tool: failed.toolCall.toolName,
      error: failed.error.message,
    }),
    toolName: "invalid",
  };
}

// ============================================================================
// Rate Limit Handling
// ============================================================================

const RATE_LIMIT_RETRY_DELAY_MS = 60000; // 60 seconds - wait for TPM limit to reset
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Check if an error is a rate limit error (429 or TPM limit)
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for 429 status or TPM limit messages
    if (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("tokens per minute") ||
      message.includes("tpm") ||
      message.includes("request too large") ||
      message.includes("too many requests")
    ) {
      return true;
    }
  }
  // Check if error has a status property (API response errors)
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with rate limit retry logic.
 * If all retries fail, prompts the user to select an alternative model.
 *
 * @param fn - The function to execute (should use currentModel from getModel callback)
 * @param currentModelName - The current model name for error reporting
 * @param onModelChange - Callback when user selects a new model (should update internal state and return new fn)
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  currentModelName: string,
  onModelChange?: (newModelName: string) => () => Promise<T>,
  retries = MAX_RATE_LIMIT_RETRIES,
): Promise<T> {
  let lastError: unknown;
  let currentFn = fn;
  let modelName = currentModelName;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await currentFn();
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error) && attempt < retries) {
        const waitTime = RATE_LIMIT_RETRY_DELAY_MS;
        log(
          `Rate limit hit. Waiting ${waitTime / 1000} seconds before retry ${attempt + 1}/${retries}...`,
        );
        useFraudeStore.setState({
          statusText: `Rate limited - waiting ${waitTime / 1000}s (retry ${attempt + 1}/${retries})`,
        });
        await sleep(waitTime);
        continue;
      }

      // If it's a rate limit error and we've exhausted retries, offer model selection
      if (isRateLimitError(error) && onModelChange) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log(
          `Rate limit retries exhausted. Prompting user for model selection...`,
        );

        const selectedModel = await useFraudeStore
          .getState()
          .requestModelSelection(modelName, errorMessage);

        if (selectedModel) {
          log(`User selected alternative model: ${selectedModel}`);
          // Get new function with updated model
          currentFn = onModelChange(selectedModel);
          modelName = selectedModel;
          // Reset retries for the new model
          attempt = -1; // Will become 0 after continue
          continue;
        } else {
          // User cancelled
          throw new Error(
            `Request cancelled by user after rate limit on model: ${modelName}`,
          );
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// ============================================================================
// Provider Options Builder
// ============================================================================

/**
 * Build provider options object for generateText/streamText calls.
 * Currently supports OpenAI-specific options like reasoningEffort.
 */
function buildProviderOptions(
  config: Partial<AgentConfig>,
): Record<string, Record<string, string | number | boolean>> | undefined {
  const openaiOptions: Record<string, string | number | boolean> = {};

  // Add reasoning effort if specified
  if (config.reasoningEffort) {
    openaiOptions.reasoningEffort = config.reasoningEffort;
  }

  // Only return providerOptions if we have something to set
  if (Object.keys(openaiOptions).length > 0) {
    return {
      openai: openaiOptions,
    };
  }

  return undefined;
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
  private rawModel: string;
  private isolatedContextManager: ContextManager | null = null;

  constructor(config: AgentConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      maxSteps: 5,
      autoExecuteTools: true,
      ...config,
    };
    this.model = getModel(config.model);
    this.rawModel = config.model;

    // Create isolated context manager if requested (for subagents)
    if (config.useIsolatedContext) {
      this.isolatedContextManager = new ContextManager();
    }
  }

  /**
   * Get the appropriate context manager for this agent.
   * Returns isolated context manager if configured, otherwise the global one.
   */
  private getContextManager(): ContextManager {
    return (
      this.isolatedContextManager ?? useFraudeStore.getState().contextManager
    );
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
    options?: Partial<AgentConfig>,
  ): Promise<AgentResponse> {
    const contextManager = this.getContextManager();
    const processedInput = resolveFileReferences(input);
    const messages = [...(await contextManager.addContext(processedInput))];
    const mergedConfig = { ...this.config, ...options };

    const result = await generateText({
      model: this.model as Parameters<typeof generateText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      providerOptions: buildProviderOptions(mergedConfig),
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      experimental_repairToolCall,
    });

    const response = this.mapResponse(result);
    await incrementModelUsage(this.rawModel, response.usage);
    return response;
  }

  /**
   * Stream a response in real-time.
   * Returns an async iterable for text chunks and a promise for the full response.
   */
  async stream(
    input: string,
    options?: Partial<AgentConfig>,
  ): Promise<AgentResponse> {
    const contextManager = this.getContextManager();
    const processedInput = resolveFileReferences(input);
    const messages = [...(await contextManager.addContext(processedInput))];
    const mergedConfig = { ...this.config, ...options };

    const result = streamText({
      model: this.model as Parameters<typeof streamText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      abortSignal: mergedConfig.abortSignal,
      providerOptions: buildProviderOptions(mergedConfig),
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      experimental_repairToolCall,
      onError: (error) => {
        log(`Stream error: ${JSON.stringify(error, null, 2)}`);
      },
    });

    return this.buildStreamingResponse(result, mergedConfig.abortSignal);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  getModel(): string {
    return this.rawModel;
  }

  /**
   * Switch to a different model (used internally by rate limit retry logic)
   */
  setModel(modelName: string): void {
    this.config.model = modelName;
    this.rawModel = modelName;
    this.model = getModel(modelName);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapResponse(
    result: Awaited<ReturnType<typeof generateText>>,
  ): AgentResponse {
    const steps: StepInfo[] =
      result.steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 }),
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];

    // Aggregate all tool calls/results from steps
    for (const step of steps) {
      toolCalls.push(...step.toolCalls);
    }

    return {
      text: result.text,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      steps,
      toolCalls,
      raw: result,
    };
  }

  private mapStepInfo(step: Record<string, unknown>): StepInfo {
    const actions = [];

    const toolMap = new Map<string, ToolCallInfo>();

    for (const event of step.content as any[]) {
      if (event.type === "tool-call") {
        toolMap.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.input,
        });
      } else if (event.type === "tool-result") {
        const toolCall = toolMap.get(event.toolCallId);
        if (toolCall) {
          toolCall.result = event.output;
          actions.push("Tool Call: " + JSON.stringify(toolCall, null, 2));
          this.getContextManager().addContext({
            role: "assistant",
            content: "Tool Call: " + JSON.stringify(toolCall, null, 2),
          });
        }
      } else if (event.text) {
        actions.push(event.text);
        this.getContextManager().addContext({
          role: "assistant",
          content: event.text,
        });
      }
    }

    return {
      stepNumber: (step.stepNumber as number) ?? 0,
      actions,
      toolCalls: Array.from(toolMap.values()),
      finishReason: (step.finishReason as string) ?? "unknown",
    };
  }

  private async buildStreamingResponse(
    result: ReturnType<typeof streamText>,
    abortSignal?: AbortSignal,
  ): Promise<AgentResponse> {
    log("Starting stream consumption...");

    try {
      for await (const chunk of result.fullStream) {
        if (abortSignal?.aborted) {
          log("Stream consumption aborted by user");
          const error = new Error("Aborted");
          error.name = "AbortError";
          throw error;
        }

        const usage: TokenUsage = handleStreamChunk(
          chunk as Record<string, unknown>,
        );
        await incrementModelUsage(this.rawModel, usage);
      }
      log("Stream consumption completed.");
    } catch (error) {
      log(`Error during stream consumption: ${error}`);
      if (error instanceof Error) {
        log(`Error details: ${error.message}\n${error.stack}`);
      }
      throw error;
    }
    const text = await result.text;
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const steps = await result.steps;

    const mappedSteps: StepInfo[] =
      steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 }),
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];

    for (const step of mappedSteps) {
      toolCalls.push(...step.toolCalls);
    }

    return {
      text,
      usage: extractUsage(usage),
      finishReason: finishReason ?? "unknown",
      steps: mappedSteps,
      toolCalls,
      raw: result,
    };
  }
}
