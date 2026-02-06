import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import log from "./logger";
import { resetStreamState } from "./streamHandler";
import pendingChanges from "@/agent/pendingChanges";
import { getManagerAgent } from "@/agent/subagents/managerAgent";
import {
  getNextTodo,
  getTodoById,
  hasPendingTodos,
} from "@/agent/tools/todoTool";
import { getWorkerSubAgent } from "@/agent/subagents/workerSubAgent";
import { getReviewerSubAgent } from "@/agent/subagents/reviewerSubAgent";
import type { TodoItem } from "@/agent/tools/todoTool";
import getFastAgent from "@/agent/subagents/fastAgent";
import getAskAgent from "@/agent/subagents/askAgent";

const { updateOutput } = useFraudeStore.getState();

const checkAbort = () => {
  const abortController = useFraudeStore.getState().abortController;
  if (abortController?.signal.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }
};

const getTaskContext = (task: TodoItem) => {
  const context = task.context;
  const notes = task.notes;

  return `Task: ${task.description}

  Task ID: ${task.id}

Context:
${context ? `Files: ${context.files.map((f) => "`" + f + "`").join(", ")} \nInstructions: ${context.instructions}` : "No pre-researched context provided."}

Notes:
${notes.length > 0 ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "None"}`;
};

const fastMode = async (query: string) => {
  const abortController = useFraudeStore.getState().abortController;
  if (!abortController) {
    throw new Error("No abort controller found");
  }
  const response = await getFastAgent().stream(query, {
    abortSignal: abortController.signal,
  });
  checkAbort();

  log("Fast Agent Response:");
  log(JSON.stringify(response, null, 2));
};

const planMode = async (query: string) => {
  const abortController = useFraudeStore.getState().abortController;
  if (!abortController) {
    throw new Error("No abort controller found");
  }
  const response = await getManagerAgent().stream(query, {
    abortSignal: abortController.signal,
  });
  checkAbort();

  log("Manager Response:");
  log(JSON.stringify(response, null, 2));

  let nextTask = await getNextTodo();
  while (!nextTask.done && nextTask.task) {
    checkAbort();

    let taskContext = getTaskContext(nextTask.task);
    updateOutput("log", "Working on task: " + nextTask.task.description);
    const response = await getWorkerSubAgent().stream(taskContext, {
      abortSignal: abortController.signal,
    });
    checkAbort();

    log("Worker Response:");
    log(JSON.stringify(response, null, 2));
    const taskAfterWorker = await getTodoById(nextTask.task.id);
    if (taskAfterWorker && taskAfterWorker.status === "in-progress") {
      log(
        "Worker finished but didn't update status. Auto-advancing to 'reviewing'.",
      );
    }

    const getUpdatedTask = await getTodoById(nextTask.task.id);
    if (!getUpdatedTask) {
      updateOutput("error", "Task not found");
      continue;
    }
    taskContext = getTaskContext(getUpdatedTask);
    updateOutput(
      "log",
      "Reviewing changes for task: " + nextTask.task.description,
    );
    const reviewResponse = await getReviewerSubAgent().stream(taskContext, {
      abortSignal: abortController.signal,
    });
    checkAbort();

    log("Review Response:");
    log(JSON.stringify(reviewResponse, null, 2));

    // SAFETY CHECK: Did the reviewer complete the task?
    const postReviewTask = await getTodoById(nextTask.task.id);
    if (
      postReviewTask &&
      postReviewTask.status !== "completed" &&
      postReviewTask.status !== "pending"
    ) {
      log(
        "Warning: Reviewer did not complete or reject task. Auto-completing to proceed.",
      );
      break;
    }

    nextTask = await getNextTodo();
  }
};

const askMode = async (query: string) => {
  const abortController = useFraudeStore.getState().abortController;
  if (!abortController) {
    throw new Error("No abort controller found");
  }
  const response = await getAskAgent().stream(query, {
    abortSignal: abortController.signal,
  });
  checkAbort();

  log("Ask Agent Response:");
  log(JSON.stringify(response, null, 2));
};

export default async function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }
  updateOutput("command", query);
  if (query.startsWith("/")) {
    useFraudeStore.setState({
      status: 2,
    });
    await CommandCenter.processCommand(query);
    useFraudeStore.setState({
      status: 0,
    });
    return;
  }
  log(`User Query: ${query}`);

  useFraudeStore.setState({
    status: 1,
    elapsedTime: 0,
    lastBreak: 0,
    abortController: new AbortController(),
    statusText: "Pondering",
  });
  resetStreamState();

  // Initialize cognition and inject relevant knowledge
  const contextManager = useFraudeStore.getState().contextManager;

  try {
    // Prime context with project knowledge (once per session)
    // await contextManager.primeWithKnowledge();

    // Inject query-specific context via orchestrator
    await contextManager.injectQueryContext(query);
  } catch (e) {
    log(`Knowledge injection failed (non-fatal): ${e}`);
  }

  try {
    useFraudeStore.setState({
      researchCache: {},
    });
    if (useFraudeStore.getState().executionMode == 0) {
      // Fast Mode
      await fastMode(query);
    } else if (useFraudeStore.getState().executionMode == 1) {
      // Planning Mode
      await planMode(query);
    } else if (useFraudeStore.getState().executionMode == 2) {
      // Ask Mode
      await askMode(query);
    }

    // Persist session learnings after successful completion
    try {
      await contextManager.persistSession();
    } catch (e) {
      log(`Session persistence failed (non-fatal): ${e}`);
    }

    if (pendingChanges.hasChanges()) {
      useFraudeStore.setState({ status: 3, statusText: "Reviewing Changes" });
      updateOutput("confirmation", "");
    } else {
      updateOutput(
        "done",
        `Task Completed in ${(useFraudeStore.getState().elapsedTime / 10).toFixed(1)}s`,
      );
    }
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.message === "Aborted") {
      log("Query aborted by user");
    } else {
      log(`Error in query handler: ${e?.message}`);
      throw e; // Re-throw non-abort errors
    }
  } finally {
    // Cleanup unless in reviewing mode
    if (useFraudeStore.getState().status !== 3) {
      useFraudeStore.setState({
        status: 0,
        abortController: null,
        statusText: "",
      });
    }
  }
}
