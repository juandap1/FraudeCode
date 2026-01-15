import type { ModelMessage } from "ai";

class ContextManager {
  private context: ModelMessage[] = [];

  constructor(initialContext: ModelMessage[] = []) {
    this.context = initialContext;
  }

  getContext() {
    return this.context;
  }

  clearContext() {
    this.context = [];
  }

  addContext(query: string | ModelMessage | ModelMessage[]) {
    if (typeof query === "string") {
      this.context.push({ role: "user", content: query });
    } else if (Array.isArray(query)) {
      this.context.push(...query);
    } else {
      this.context.push(query);
    }
    return this.context;
  }

  estimateContextTokens() {
    return this.context.reduce(
      (total, message) => total + this.estimateMessageTokens(message),
      0
    );
  }

  estimateMessageTokens(message: ModelMessage) {
    const text = message.content as string;
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
