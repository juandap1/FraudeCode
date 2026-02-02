import { tool } from "ai";
import { z } from "zod";
import path from "path";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/todo.txt" with { type: "text" };

const { updateOutput } = useFraudeStore.getState();

// Path configuration
const FRAUDE_DIR = path.join(process.cwd(), ".fraude");
const TODOS_FILE = path.join(FRAUDE_DIR, "todos.json");

// Context for worker agents
interface TaskContext {
  files: string[];
  instructions: string;
}

// Todo item schema
export interface TodoItem {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "reviewing" | "completed";
  context?: TaskContext;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

interface TodoState {
  todos: TodoItem[];
}

// Helper to read current todos
async function readTodos(): Promise<TodoState> {
  const file = Bun.file(TODOS_FILE);
  if (await file.exists()) {
    const text = await file.text();
    return JSON.parse(text);
  }
  return { todos: [] };
}

// Helper to write todos
async function writeTodos(state: TodoState): Promise<void> {
  await Bun.write(TODOS_FILE, JSON.stringify(state, null, 2));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const todoTool = tool({
  description: DESCRIPTION,
  strict: true,
  inputSchema: z.object({
    operation: z
      .enum(["add", "update", "complete", "list", "clear"])
      .describe("The operation to perform"),
    id: z
      .string()
      .optional()
      .describe("Task ID (required for update/complete)"),
    description: z
      .string()
      .optional()
      .describe("Task description (required for add)"),
    context: z
      .object({
        files: z.array(z.string()).describe("Relevant file paths"),
        instructions: z
          .string()
          .describe("Specific instructions for the worker"),
      })
      .optional()
      .describe("Pre-researched context for the worker (for add)"),
    status: z
      .enum(["pending", "in-progress", "reviewing", "completed"])
      .optional()
      .describe("New status (for update)"),
    note: z.string().optional().describe("Note to append"),
  }),

  execute: async ({ operation, id, description, context, status, note }) => {
    const state = await readTodos();
    const now = new Date().toISOString();

    switch (operation) {
      case "add": {
        if (!description) throw new Error("Description required");
        const newTodo: TodoItem = {
          id: generateId(),
          description,
          status: "pending",
          context,
          notes: note ? [note] : [],
          createdAt: now,
          updatedAt: now,
        };
        state.todos.push(newTodo);
        await writeTodos(state);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Added Task",
            details: description,
            result: newTodo.id,
          }),
          { dontOverride: true },
        );
        return { success: true, id: newTodo.id };
      }

      case "update": {
        if (!id) throw new Error("ID required");
        const todo = state.todos.find((t) => t.id === id);
        if (!todo) throw new Error(`Task not found: ${id}`);
        if (status) todo.status = status;
        if (note) todo.notes.push(note);
        todo.updatedAt = now;
        await writeTodos(state);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Updated Task",
            details: todo.description,
            result: status || "note added",
          }),
          { dontOverride: true },
        );
        return { success: true };
      }

      case "complete": {
        if (!id) throw new Error("ID required");
        const todo = state.todos.find((t) => t.id === id);
        if (!todo) throw new Error(`Task not found: ${id}`);
        todo.status = "completed";
        if (note) todo.notes.push(`[Done] ${note}`);
        todo.updatedAt = now;
        await writeTodos(state);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Completed Task",
            details: todo.description,
            result: "✓",
          }),
          { dontOverride: true },
        );
        return { success: true };
      }

      case "list": {
        const summary = {
          total: state.todos.length,
          pending: state.todos.filter((t) => t.status === "pending").length,
          inProgress: state.todos.filter((t) => t.status === "in-progress")
            .length,
          completed: state.todos.filter((t) => t.status === "completed").length,
        };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Listed Tasks",
            details: `${summary.pending} pending, ${summary.inProgress} in-progress`,
            result: `${summary.total} total`,
          }),
          { dontOverride: true },
        );
        return { todos: state.todos, summary };
      }

      case "clear": {
        const before = state.todos.length;
        state.todos = state.todos.filter((t) => t.status !== "completed");
        await writeTodos(state);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Cleared Completed",
            details: `Removed ${before - state.todos.length} tasks`,
            result: "✓",
          }),
          { dontOverride: true },
        );
        return { success: true, remaining: state.todos.length };
      }
    }
  },
});

export const getNextTodo = async () => {
  const state = await readTodos();
  const nextTodo = state.todos.find((t) => t.status === "pending");
  if (!nextTodo) {
    return { done: true, task: null };
  }
  // Mark as in-progress
  nextTodo.status = "in-progress";
  nextTodo.updatedAt = new Date().toISOString();
  await writeTodos(state);
  return {
    done: false,
    task: nextTodo,
  };
};

export const getTodoById = async (id: string) => {
  const state = await readTodos();
  return state.todos.find((t) => t.id === id);
};

/**
 * Check if there are any pending todos without modifying state.
 * Used to validate that the manager agent created tasks.
 */
export const hasPendingTodos = async (): Promise<boolean> => {
  const state = await readTodos();
  return state.todos.some((t) => t.status === "pending");
};

export default todoTool;
