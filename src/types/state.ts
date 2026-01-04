import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { type BaseMessage } from "@langchain/core/messages";
import type { GitRepo } from "./analysis";

export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
}

/**
 * State relevant to the code modification process.
 */
export const ModifierState = Annotation.Root({
  // Input fields
  id: Annotation<string>(),
  query: Annotation<string>(),
  repoName: Annotation<string>(),
  repoPath: Annotation<string>(),

  // Internal processing fields
  qdrantResults: Annotation<any[]>({
    reducer: (x, y) => (y ? y : x),
    default: () => [],
  }),
  structuralContext: Annotation<any[]>({
    reducer: (x, y) => (y ? y : x),
    default: () => [],
  }),
  dependencies: Annotation<string>(),
  codeContext: Annotation<string>(),
  mappedContext: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  thinkingProcess: Annotation<string>(),
  modifications: Annotation<string>(),

  // Output / Feedback fields
  diffs: Annotation<string>(),
  pendingChanges: Annotation<PendingChange[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userConfirmed: Annotation<boolean>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => false,
  }),
  changedFiles: Annotation<string[]>({
    reducer: (x, y) => Array.from(new Set([...x, ...y])),
    default: () => [],
  }),
  status: Annotation<string>(),
});

export type ModifierStateType = typeof ModifierState.State;

export const RouterState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type RouterStateType = typeof RouterState.State;

export const SummaryState = Annotation.Root({
  // Input fields
  id: Annotation<string>(),
  query: Annotation<string>(),
  repoName: Annotation<string>(),
  repoPath: Annotation<string>(),

  // Internal processing fields
  structuralContext: Annotation<string>(),
  summary: Annotation<string>(),
  qdrantResults: Annotation<any[]>({
    reducer: (x, y) => (y ? y : x),
    default: () => [],
  }),
  status: Annotation<string>(),
});

export type SummaryStateType = typeof SummaryState.State;
