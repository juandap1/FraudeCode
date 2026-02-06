import type { ModelMessage, StepResult, ToolSet } from "ai";
import { getKnowledgeOrchestrator } from "@/services/knowledgeOrchestrator";
import type KnowledgeOrchestrator from "@/services/knowledgeOrchestrator";
import AgentCognition from "@/utils/agentCognition";
import log from "@/utils/logger";

class ContextManager {
  // private longTermSummary: string = "";
  private history: ModelMessage[] = [];
  private primingContext: string = "";
  private currentQueryContext: string = "";
  // private hasPrimed: boolean = false;
  private cognition: AgentCognition;
  private orchestrator: KnowledgeOrchestrator;
  private sessionActions: { role: string; content: string }[] = [];

  constructor(initialContext: ModelMessage[] = []) {
    this.history = initialContext;
    this.cognition = AgentCognition.getInstance();
    this.orchestrator = getKnowledgeOrchestrator();
  }

  getContext(): ModelMessage[] {
    if (this.currentQueryContext) {
      // const primingMessage: ModelMessage = {
      //   role: "system",
      //   content: this.primingContext,
      // };
      const queryMessage: ModelMessage = {
        role: "system",
        content: this.currentQueryContext,
      };
      return [queryMessage, ...this.history]; //include primingContext if want to add previous session summaries
    }
    return this.history;
  }

  clearContext() {
    this.history = [];
    // this.longTermSummary = "";
    this.primingContext = "";
    this.currentQueryContext = "";
    // this.hasPrimed = false;
    this.clearSessionActions();
  }

  clearSessionActions() {
    this.sessionActions = [];
  }

  async addSessionActions(actions: { role: string; content: string }[]) {
    this.sessionActions.push(...actions);
    return this.sessionActions;
  }

  async addContext(query: string | ModelMessage | ModelMessage[]) {
    if (typeof query === "string") {
      this.history.push({ role: "user", content: query });
    } else if (Array.isArray(query)) {
      this.history.push(...query);
    } else {
      this.history.push(query);
    }
    return this.history;
  }

  // Prime context with project knowledge (once per session)
  // async primeWithKnowledge(): Promise<void> {
  //   if (this.hasPrimed) return;
  //   try {
  //     this.primingContext = await this.orchestrator.getPrimingContext();
  //     this.hasPrimed = true;
  //   } catch (e) {
  //     // Fail silently - priming is optional
  //     this.primingContext = "";
  //   }
  // }

  // Inject query-specific context using the orchestrator's formatted output
  async injectQueryContext(query: string): Promise<void> {
    try {
      const context = await this.orchestrator.getContextForQuery(query);
      if (context) {
        this.currentQueryContext = context;
      }
    } catch (e) {
      // Fail silently - context injection is optional
      this.currentQueryContext = "";
    }
  }

  // Persist session learnings before closing
  async persistSession(): Promise<void> {
    log("Persisting session learnings");
    try {
      await this.cognition.init();
      // Extract and store facts from session
      const facts = await this.cognition.extractFromSession(
        this.sessionActions,
      );
      for (const fact of facts) {
        await this.cognition.addFact(fact);
      }
      // Store session summary
      // const summary = await this.cognition.summarizeSession(
      //   this.sessionActions,
      // );
      // if (summary) {
      //   await this.cognition.addFact({
      //     type: "summary",
      //     content: summary,
      //     confidence: 0.8,
      //   });
      // }
    } catch (e) {
      // Fail silently - persistence is optional
      log("Failed to persist session: " + e);
    }
  }

  estimateContextTokens() {
    return this.getContext().reduce(
      (total, message) => total + this.estimateMessageTokens(message),
      0,
    ); // + this.estimateMessageTokens(this.longTermSummary)
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
