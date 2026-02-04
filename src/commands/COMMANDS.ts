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
import logCommand from "./log";
import rememberCommand from "./remember";
import knowledgeCommand from "./knowledge";
import resetCommand from "./reset";

const COMMANDS: Command[] = [
  usageCommand,
  logCommand,
  serveCommand,
  sessionCommands,
  rememberCommand,
  knowledgeCommand,
  resetCommand,
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
