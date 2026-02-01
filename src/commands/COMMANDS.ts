import type { Command } from "../types/CommandDefinition";
import modelCommands from "./model";
import openRouterCommands from "./openrouter";
import cerebrasCommands from "./cerebras";
import groqCommands from "./groq";
import googleCommands from "./google";
import mistralCommands from "./mistral";
import modelsCommands from "./models";
import ollamaCommand from "./ollama";
import sessionCommands from "./session";
import usageCommand from "./usage";
import serveCommand from "./serve";

const COMMANDS: Command[] = [
  usageCommand,
  serveCommand,
  sessionCommands,
  modelCommands, //starts with model
  modelsCommands, //starts with models
  ollamaCommand,
  openRouterCommands,
  cerebrasCommands,
  groqCommands,
  googleCommands,
  mistralCommands,
];

export default COMMANDS;
