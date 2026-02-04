import type { z } from "zod";
import type { ModelMessage, ToolSet, TextStreamPart } from "ai";
import type { TokenUsage } from "./TokenUsage";

// ============================================================================
// Agent Configuration Types
// ============================================================================

/** Reasoning effort levels for reasoning models (e.g., OpenAI o-series, GPT-5) */
export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

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

  /**
   * Reasoning effort for reasoning models (OpenAI o-series, GPT-5, etc.)
   * - 'none': No reasoning (only GPT-5.1 models)
   * - 'minimal': Minimal reasoning
   * - 'low': Low reasoning effort
   * - 'medium': Medium reasoning effort (default)
   * - 'high': High reasoning effort
   * - 'xhigh': Extra high reasoning (only GPT-5.1-Codex-Max)
   */
  reasoningEffort?: ReasoningEffort;

  /** Callback for tool calls */
  onToolCall?: (toolCall: ToolCallInfo) => void;

  /** Callback for step completion */
  onStepComplete?: (step: StepInfo) => void;

  /** Callback for each raw stream chunk (for custom handling like usage tracking) */
  onStreamChunk?: (chunk: TextStreamPart<ToolSet>) => void | Promise<void>;

  /** Abort signal for cancelling the request */
  abortSignal?: AbortSignal;

  /**
   * Whether to use an isolated context manager instead of the shared global one.
   * Set to true for subagents to prevent context contamination with parent agents.
   * Default: false (uses shared context manager)
   */
  useIsolatedContext?: boolean;
}

// ============================================================================
// Tool-Related Types
// ============================================================================

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
}

export interface StepInfo {
  stepNumber: number;
  actions: string[];
  toolCalls: ToolCallInfo[];
  finishReason: string;
}

// ============================================================================
// Agent Response Types
// ============================================================================

export interface AgentResponse {
  /** The final text response */
  text: string;

  /** Token usage statistics */
  usage: TokenUsage;

  /** Finish reason for the generation */
  finishReason: string;

  /** All steps taken during generation (for multi-step tool use) */
  steps: StepInfo[];

  /** All tool calls (and results) made during the conversation */
  toolCalls: ToolCallInfo[];

  /** Raw response from the provider (for advanced use cases) */
  raw?: unknown;
}

export interface StructuredAgentResponse<T> {
  /** The structured object matching the provided schema */
  object: T;

  /** Token usage statistics */
  usage: TokenUsage;

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
