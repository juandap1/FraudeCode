import { Annotation } from "@langchain/langgraph";

export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
}

export const AgentState = Annotation.Root({
  id: Annotation<string>(),
  query: Annotation<string>(),
  repoPath: Annotation<string>(),
  repoName: Annotation<string>(),
  qdrantResults: Annotation<any[]>(),
  filePaths: Annotation<string[]>(),
  funcs: Annotation<string[]>(),
  structuralContext: Annotation<any[]>(),
  dependencies: Annotation<string>(),
  codeContext: Annotation<string>(),
  mappedContext: Annotation<Record<string, string>>(),
  thinkingProcess: Annotation<string>(),
  modifications: Annotation<string>(),
  diffs: Annotation<string>(),
  pendingChanges: Annotation<PendingChange[]>(),
  userConfirmed: Annotation<boolean>(),
  summary: Annotation<string>(),
  error: Annotation<string | undefined>(),
  status: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;
