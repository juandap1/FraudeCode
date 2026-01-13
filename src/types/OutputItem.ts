export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command"
  | "checkpoint"
  | "settings"
  | "comment"
  | "error";

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
}
