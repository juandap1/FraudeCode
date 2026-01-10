import { useState, useMemo, useCallback } from "react";
import { useApp, Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import type { OllamaCLI } from "../hooks/useOllamaClient";
import { useFraudeStore } from "../store/useFraudeStore";
import { useSettingsStore } from "../store/settingsStore";
import { homedir } from "os";
import {
  getCommandTemplates,
  getSpecificModelPrefixes,
  templateExpectsModelName,
  type CommandTemplate,
} from "../core/commands";

const shortenPath = (path: string) => {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
};

const MAX_VISIBLE_SUGGESTIONS = 5;

// Cache these since they don't change at runtime
const COMMAND_TEMPLATES = getCommandTemplates();
const SPECIFIC_MODEL_PREFIXES = getSpecificModelPrefixes();

const InputBoxComponent = ({ OllamaClient }: { OllamaClient: OllamaCLI }) => {
  const { exit } = useApp();
  const history = useFraudeStore((state) => state.history);
  const addToHistory = useFraudeStore((state) => state.addToHistory);

  // Track current input for showing dropdown
  const [currentInput, setCurrentInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  // Key to force TextInput remount when we want to set a new value
  const [inputKey, setInputKey] = useState(0);
  const [defaultValue, setDefaultValue] = useState("");

  // Get models from settings store for ghost text autocomplete
  const models = useSettingsStore((state) => state.models);
  const modelNames = useMemo(() => models.map((m) => m.name), [models]);

  // Build full suggestions for ghost text (actual model names)
  // Model suggestions are separate from command suggestions
  const modelSuggestions = useMemo(() => {
    const suggestions: string[] = [];

    // Add model-specific commands for each model (for ghost text)
    for (const modelName of modelNames) {
      suggestions.push(`/model ${modelName}`);
      suggestions.push(`/model all ${modelName}`);
      suggestions.push(`/model reasoning ${modelName}`);
      suggestions.push(`/model general ${modelName}`);
      suggestions.push(`/model light ${modelName}`);
    }

    return suggestions;
  }, [modelNames]);

  // Base command suggestions (commands without model arguments)
  const baseSuggestions = useMemo(() => {
    return COMMAND_TEMPLATES.filter(
      (t) => !templateExpectsModelName(t.template)
    ).map((t) => t.template);
  }, []);

  // All suggestions combined for default ghost text
  const allSuggestions = useMemo(() => {
    return [...baseSuggestions, ...modelSuggestions];
  }, [baseSuggestions, modelSuggestions]);

  // Filter command templates for dropdown display (with <model-name> placeholders)
  const filteredTemplates = useMemo(() => {
    if (!currentInput || currentInput.length === 0) return [];

    const lowerInput = currentInput.toLowerCase();

    return COMMAND_TEMPLATES.filter((cmd) => {
      const lowerTemplate = cmd.template.toLowerCase();

      // Special case: hide generic "/model <model-name>" variants if user is typing a specific prefix
      if (cmd.template.startsWith("/model <model-name>")) {
        if (
          lowerInput.startsWith("/model ") &&
          SPECIFIC_MODEL_PREFIXES.some((p) =>
            lowerInput.startsWith(p.toLowerCase())
          )
        ) {
          return false;
        }
      }

      // Show if template starts with what user typed
      if (lowerTemplate.startsWith(lowerInput)) {
        return true;
      }

      // For commands with <model-name>, show if user is typing towards model name
      if (templateExpectsModelName(cmd.template)) {
        // Extract the prefix before <model-name>
        const modelNameIndex = cmd.template.indexOf("<model-name>");
        if (modelNameIndex > 0) {
          const templatePrefix = cmd.template
            .slice(0, modelNameIndex)
            .trim()
            .toLowerCase();
          if (lowerInput.startsWith(templatePrefix + " ")) {
            return true;
          }
        }
      }

      return false;
    }).slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [currentInput]);

  // Get the matching full suggestion for the selected template
  const getMatchingSuggestion = useCallback(
    (template: string): string | null => {
      // For templates without <model-name>, return the template itself
      if (!templateExpectsModelName(template)) {
        return template;
      }

      // For templates with <model-name>, find a matching model suggestion
      const modelNameIndex = template.indexOf("<model-name>");
      if (modelNameIndex <= 0) return null;

      const prefix = template.slice(0, modelNameIndex).trim();

      // Find first model suggestion that matches this prefix
      // Use modelSuggestions, not allSuggestions, to avoid "/model list" matching
      const match = modelSuggestions.find((s) => s.startsWith(prefix + " "));
      return match || null;
    },
    [modelSuggestions]
  );

  // Calculate the suggestion shown by dropdown hover
  const dropdownSuggestion = useMemo(() => {
    if (filteredTemplates.length > 0) {
      const selectedTemplate = filteredTemplates[selectedIndex];
      if (selectedTemplate) {
        return getMatchingSuggestion(selectedTemplate.template);
      }
    }
    return null;
  }, [filteredTemplates, selectedIndex, getMatchingSuggestion]);

  // Build dynamic suggestions for TextInput based on hovered template
  // This controls what ghost text the TextInput actually shows
  const dynamicSuggestions = useMemo(() => {
    if (dropdownSuggestion) {
      // Put the dropdown suggestion first so it shows as ghost text
      return [
        dropdownSuggestion,
        ...allSuggestions.filter((s) => s !== dropdownSuggestion),
      ];
    }
    return allSuggestions;
  }, [dropdownSuggestion, allSuggestions]);

  // Calculate what ghost text the TextInput is ACTUALLY showing
  // This mirrors TextInput's internal logic: first suggestion that starts with input
  const actualGhostTextSuggestion = useMemo(() => {
    if (currentInput.length === 0) return null;
    const match = dynamicSuggestions.find((s) => s.startsWith(currentInput));
    return match || null;
  }, [currentInput, dynamicSuggestions]);

  // Handle input changes to track for dropdown
  const handleChange = useCallback((value: string) => {
    setCurrentInput(value);
    setSelectedIndex(0);
  }, []);

  useInput((input, key) => {
    // Tab to accept ghost text suggestion - use the ACTUAL ghost text shown
    if (key.tab && actualGhostTextSuggestion) {
      setDefaultValue(actualGhostTextSuggestion);
      setCurrentInput(actualGhostTextSuggestion);
      setInputKey((k) => k + 1);
      setHistoryIndex(-1);
      return;
    }

    // If input starts with "/" and there are multiple suggestions, use arrow keys for command dropdown
    if (currentInput.startsWith("/") && filteredTemplates.length > 1) {
      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredTemplates.length - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < filteredTemplates.length - 1 ? prev + 1 : 0
        );
        return;
      }
    }

    // Otherwise, use arrow keys for history navigation
    // Note: history[0] is the most recent item in useFraudeStore
    if (key.upArrow && history.length > 0) {
      const newIndex =
        historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      const historyItem = history[newIndex];
      if (historyItem) {
        setDefaultValue(historyItem);
        setCurrentInput(historyItem);
        setInputKey((k) => k + 1);
      }
      return;
    }
    // Down arrow: go to newer history or clear input
    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const historyItem = history[newIndex];
        if (historyItem) {
          setDefaultValue(historyItem);
          setCurrentInput(historyItem);
          setInputKey((k) => k + 1);
        }
      } else {
        // Clear input when at the end of history or not in history
        setHistoryIndex(-1);
        setDefaultValue("");
        setCurrentInput("");
        setInputKey((k) => k + 1);
      }
      return;
    }
  });

  const processSubmit = (v: string) => {
    if (v.trim().toLowerCase() === "exit") {
      exit();
      return;
    }
    if (v.trim() === "") return;
    addToHistory(v);
    setCurrentInput("");
    setDefaultValue("");
    setHistoryIndex(-1);
    setInputKey((k) => k + 1);
    OllamaClient.handleQuery(v);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type something and press enter or type "exit" to exit:</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt; </Text>
        <Box flexGrow={1}>
          <TextInput
            key={inputKey}
            placeholder="Enter command or query..."
            defaultValue={defaultValue}
            onSubmit={processSubmit}
            onChange={handleChange}
            suggestions={dynamicSuggestions}
          />
        </Box>
      </Box>

      {/* Dropdown showing command templates with placeholders */}
      {filteredTemplates.length > 0 && (
        <Box
          flexDirection="column"
          paddingX={2}
          borderStyle="single"
          borderColor="gray"
          width={68}
          marginLeft={1}
        >
          <Text dimColor>Commands (Tab accepts ghost text):</Text>
          {filteredTemplates.map((cmd, i) => (
            <Box key={cmd.template}>
              <Text
                color={i === selectedIndex ? "cyan" : "gray"}
                bold={i === selectedIndex}
              >
                {i === selectedIndex ? "› " : "  "}
                {cmd.template}
              </Text>
              <Text color="gray"> - {cmd.description}</Text>
            </Box>
          ))}
          {/* Show role hint if selected command has [role] */}
          {filteredTemplates[selectedIndex]?.template.includes("[role]") && (
            <Text dimColor italic>
              {"  "}[role]: reasoning | general | light | all (or r|g|l|a)
            </Text>
          )}
        </Box>
      )}

      <Box width={70} justifyContent="space-between" paddingX={1}>
        <Text color="gray">{shortenPath(process.cwd())}</Text>
        <Text color="cyan">
          <Text bold>{useFraudeStore.getState().executionMode}</Text>
        </Text>
      </Box>
    </Box>
  );
};

export default InputBoxComponent;
