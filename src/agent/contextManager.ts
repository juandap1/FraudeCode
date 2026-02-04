import type { ModelMessage, StepResult, ToolSet } from "ai";
import AgentCognition from "@/utils/agentCognition";
import log from "@/utils/logger";

class ContextManager {
  private longTermSummary: string = "";
  private history: ModelMessage[] = [];
  private primingContext: string = "";
  private cognition: AgentCognition;

  constructor(initialContext: ModelMessage[] = []) {
    this.history = initialContext;
    this.cognition = AgentCognition.getInstance();
  }

  getContext(): ModelMessage[] {
    // Prepend priming context if available
    if (this.primingContext) {
      const primingMessage: ModelMessage = {
        role: "system",
        content: `[Project Knowledge]\n${this.primingContext}`,
      };
      return [primingMessage, ...this.history];
    }
    return this.history;
  }

  clearContext() {
    this.history = [];
    this.longTermSummary = "";
    this.primingContext = "";
  }

  processStep = (step: StepResult<ToolSet>) => {
    if (step.response?.messages) {
      this.addHistory(step.response.messages);
    }
  };

  async addHistory(query: string | ModelMessage | ModelMessage[]) {
    if (typeof query === "string") {
      this.history.push({ role: "user", content: query });
    } else if (Array.isArray(query)) {
      this.history.push(...query);
    } else {
      this.history.push(query);
    }
    return this.history;
  }

  // Backward compatibility alias
  addContext(query: string | ModelMessage | ModelMessage[]) {
    return this.addHistory(query);
  }

  // Prime context with project knowledge at session start
  async primeWithKnowledge(): Promise<void> {
    try {
      await this.cognition.init();
      this.primingContext = await this.cognition.getPrimingContext();
    } catch (e) {
      // Fail silently - priming is optional
      this.primingContext = "";
    }
  }

  // Inject query-specific context
  async injectQueryContext(query: string): Promise<void> {
    try {
      await this.cognition.init();
      const relevantFacts = await this.cognition.retrieveRelevant(query, 3);
      if (relevantFacts.length > 0) {
        const context = relevantFacts.map((f) => `- ${f.content}`).join("\n");
        // Add as a system message before processing
        this.history.push({
          role: "system",
          content: `[Relevant Knowledge]\n${context}`,
        });
      }
    } catch (e) {
      // Fail silently - context injection is optional
    }
  }

  // Persist session learnings before closing
  async persistSession(): Promise<void> {
    log("Persisting session learnings");
    try {
      await this.cognition.init();
      // Extract and store facts from session
      const facts = await this.cognition.extractFromSession(this.history);
      for (const fact of facts) {
        await this.cognition.addFact(fact);
      }
      // Store session summary
      const summary = await this.cognition.summarizeSession(this.history);
      if (summary) {
        await this.cognition.addFact({
          type: "summary",
          content: summary,
          confidence: 0.8,
        });
      }
    } catch (e) {
      // Fail silently - persistence is optional
      log("Failed to persist session: " + e);
    }
  }

  estimateContextTokens() {
    return (
      this.getContext().reduce(
        (total, message) => total + this.estimateMessageTokens(message),
        0,
      ) + this.estimateMessageTokens(this.longTermSummary)
    );
  }

  estimateMessageTokens(message: ModelMessage | string) {
    const text =
      typeof message === "string" ? message : (message.content as string);
    if (/[\u4E00-\u9FFF]/.test(text)) {
      return Math.ceil(text.length / 2); // CJK safety
    }
    if (/[\p{Emoji}]/u.test(text)) {
      return Math.ceil(text.length); // worst-case
    }
    return Math.ceil(text.length / 4);
  }
}

export default ContextManager;
