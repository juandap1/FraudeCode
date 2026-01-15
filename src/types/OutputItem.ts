export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command"
  | "checkpoint"
  | "settings"
  | "comment"
  | "error"
  | "reasoning"
  | "toolCall"
  | "agentText";

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
}
