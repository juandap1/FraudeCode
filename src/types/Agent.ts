import type { z } from "zod";
import type {
  Tool,
  ModelMessage,
  ToolSet,
  AsyncIterableStream,
  TextStreamPart,
} from "ai";

// ============================================================================
// Agent Configuration Types
// ============================================================================

export interface AgentConfig {
  /** Model identifier (e.g., "llama3.1:latest", "gpt-4", etc.) */
  model: string;

  /** System prompt that defines agent behavior */
  systemPrompt?: string;

  /** Temperature for response generation (0.0 - 2.0) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Tools available to the agent */
  tools?: ToolSet;

  /** Maximum number of tool execution steps (default: 5) */
  maxSteps?: number;

  /** Optional name for the agent instance */
  name?: string;

  /** Whether to automatically execute tools (default: true) */
  autoExecuteTools?: boolean;

  /** Callback for streaming text chunks */
  onTextChunk?: (chunk: string) => void;

  /** Callback for tool calls */
  onToolCall?: (toolCall: ToolCallInfo) => void;

  /** Callback for tool results */
  onToolResult?: (result: ToolResultInfo) => void;

  /** Callback for step completion */
  onStepComplete?: (step: StepInfo) => void;

  /** Abort signal for cancelling the request */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Tool-Related Types
// ============================================================================

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolResultInfo {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export interface StepInfo {
  stepNumber: number;
  text: string;
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
  finishReason: string;
}

// ============================================================================
// Agent Response Types
// ============================================================================

export interface AgentUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentResponse {
  /** The final text response */
  text: string;

  /** Token usage statistics */
  usage: AgentUsage;

  /** Finish reason for the generation */
  finishReason: string;

  /** All steps taken during generation (for multi-step tool use) */
  steps: StepInfo[];

  /** All tool calls made during the conversation */
  toolCalls: ToolCallInfo[];

  /** All tool results from the conversation */
  toolResults: ToolResultInfo[];

  /** Raw response from the provider (for advanced use cases) */
  raw?: unknown;
}

export interface StreamingAgentResponse {
  /** Async iterator for text chunks */
  stream: AsyncIterable<string> | AsyncIterableStream<TextStreamPart<ToolSet>>;

  /** Promise that resolves to the full response when streaming completes */
  response: Promise<AgentResponse>;
}

export interface StructuredAgentResponse<T> {
  /** The structured object matching the provided schema */
  object: T;

  /** Token usage statistics */
  usage: AgentUsage;

  /** Finish reason for the generation */
  finishReason: string;

  /** Raw response from the provider */
  raw?: unknown;
}

// ============================================================================
// Message Types (Unified format)
// ============================================================================

export type AgentMessage = ModelMessage;

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface SimpleMessage {
  role: MessageRole;
  content: string;
}

// ============================================================================
// Schema Types for Structured Generation
// ============================================================================

export type StructuredSchema<T> = z.ZodType<T>;
