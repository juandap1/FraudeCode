# Plugins

This directory allows you to extend FraudeCode with custom commands.

## Structure

Each plugin should be in its own subdirectory. The entry point must be `index.ts`.

Example:

```
plugins/
  my-plugin/
    index.ts
    utils.ts
```

## Creating a Plugin

Your `index.ts` must export a `Command` object (default export).

`plugins/my-plugin/index.ts`:

```typescript
import type { Command } from "@/types/CommandDefinition";

const myCommand: Command = {
  name: "my-command",
  description: "Description of my command",
  usage: "/my-command <args>",
  action: (args: string[]) => {
    console.log("Command executed with args:", args);
  },
};

export default myCommand;
```

You can also export an array of commands if you want to bundle multiple commands in one plugin.

## Loading

Plugins are automatically loaded from the `plugins` directory at startup.
