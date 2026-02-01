// We can use a JSDoc type import if we don't want to set up tsconfig
// or just use 'any' if we are lazy.
// For a real plugin, you'd copy the type definition or install a package.

export default async (context) => {
  const { log, ui } = context;

  return {
    name: "context-demo",
    description: "Demonstrates dependency injection",
    usage: "/context-demo",
    action: async (args) => {
      log("Context demo running!");
      ui.updateOutput(
        "markdown",
        "# Hello from Context Plugin!\n\nThis plugin does not use fragile imports.",
      );
    },
  };
};
