export interface CommandDefinition {
  name: string;
  description: string;
  subcommands?: CommandDefinition[];
  usage?: string;
  fullPath?: string; // Full command path for display (e.g., "/model list")
}
