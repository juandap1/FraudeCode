import { useState, useMemo, useCallback } from "react";
import { useApp, Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import { homedir } from "os";
import QueryHandler from "@/utils/queryHandler";
import useSettingsStore from "@/store/useSettingsStore";
import CommandCenter from "@/features/commands";
import { addHistory } from "@/config/settings";
import CommandSuggestions from "./CommandSuggestions";

const shortenPath = (path: string) => {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
};

const InputBoxComponent = () => {
  const { exit } = useApp();
  const [inputKey, setInputKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);

  const history = useSettingsStore((state) => state.history);
  const models = useSettingsStore((state) => state.models);
  const modelNames = useMemo(() => models.map((m) => m.name).sort(), [models]);

  const MAX_VISIBLE_SUGGESTIONS = 5;

  const suggestions = useMemo(() => {
    const allCommands = CommandCenter.getAllCommands();
    const suggestions = allCommands.map((s) => {
      if (s.usage.includes("<model-name>")) {
        const options = [];
        for (const modelName of modelNames) {
          const renderedUsage = s.usage.replace("<model-name>", modelName);
          options.push(renderedUsage);
        }
        return { ...s, renderedOptions: options };
      }
      return s;
    });
    return suggestions;
  }, [modelNames]);

  const dropdownSuggestions = useMemo(() => {
    if (!currentInput.startsWith("/")) return [];
    const filteredTemplates = suggestions
      .filter((s) => {
        if (s.renderedOptions && s.renderedOptions.length > 0) {
          const check = s.renderedOptions.find((option) => {
            return option.startsWith(currentInput);
          });
          return check != undefined;
        }
        return s.usage.startsWith(currentInput);
      })
      .slice(0, MAX_VISIBLE_SUGGESTIONS);
    return filteredTemplates;
  }, [suggestions, currentInput]);

  const dynamicSuggestions = useMemo(() => {
    const allSuggestions = suggestions.flatMap((s) => {
      if (s.renderedOptions && s.renderedOptions.length > 0) {
        return s.renderedOptions;
      }
      return s.usage;
    });

    const dropdownSuggestion = dropdownSuggestions[selectedIndex];
    if (dropdownSuggestion) {
      // Put the dropdown suggestion first so it shows as ghost text
      const renderedSuggestion =
        dropdownSuggestion.renderedOptions &&
        dropdownSuggestion.renderedOptions.length > 0
          ? dropdownSuggestion.renderedOptions.find((option) =>
              option.startsWith(currentInput)
            )
          : dropdownSuggestion.usage;
      if (renderedSuggestion) {
        return [
          renderedSuggestion,
          ...allSuggestions.filter((s) => s !== renderedSuggestion),
        ];
      }
    }
    return allSuggestions;
  }, [suggestions, dropdownSuggestions, selectedIndex, currentInput]);

  // Calculate what ghost text the TextInput is ACTUALLY showing
  // This mirrors TextInput's internal logic: first suggestion that starts with input
  const actualGhostTextSuggestion = useMemo(() => {
    if (currentInput.length === 0) return null;
    const match = dynamicSuggestions.find((s) => s.startsWith(currentInput));
    if (!match) return null;
    return match.replace(/<[^>]+>.*$/, "");
  }, [currentInput, dynamicSuggestions]);

  useInput((input, key) => {
    if (key.tab && actualGhostTextSuggestion) {
      setCurrentInput(actualGhostTextSuggestion);
      setInputKey((k) => k + 1);
      setHistoryIndex(-1);
      return;
    }

    // If input starts with "/" and there are multiple suggestions, use arrow keys for command dropdown
    if (currentInput.startsWith("/") && dropdownSuggestions.length > 1) {
      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : dropdownSuggestions.length - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < dropdownSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }
    }

    // // Otherwise, use arrow keys for history navigation
    // // Note: history[0] is the most recent item in useFraudeStore
    if (key.upArrow && history.length > 0) {
      const newIndex =
        historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      const historyItem = history[newIndex];
      if (historyItem) {
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
          setCurrentInput(historyItem);
          setInputKey((k) => k + 1);
        }
      } else {
        // Clear input when at the end of history or not in history
        setHistoryIndex(-1);
        setCurrentInput("");
        setInputKey((k) => k + 1);
      }
      return;
    }
  });

  const handleChange = useCallback((value: string) => {
    setCurrentInput(value);
    setSelectedIndex(0);
  }, []);

  const processSubmit = (v: string) => {
    if (v.trim().toLowerCase() === "exit") {
      exit();
      return;
    }
    if (v.trim() === "") return;
    addHistory(v);
    setCurrentInput("");
    setInputKey((k) => k + 1); // Clear input by remounting TextInput
    QueryHandler(v);
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
            onSubmit={processSubmit}
            onChange={handleChange}
            suggestions={dynamicSuggestions}
            defaultValue={currentInput}
          />
        </Box>
      </Box>
      {dropdownSuggestions.length > 0 && (
        <CommandSuggestions
          selectedIndex={selectedIndex}
          filteredTemplates={dropdownSuggestions}
        />
      )}

      {/* <Box width={70} justifyContent="space-between" paddingX={1}>
        <Text color="gray">{shortenPath(process.cwd())}</Text>
        <Text color="cyan">
          <Text bold>{useFraudeStore.getState().executionMode}</Text>
        </Text>
      </Box> */}
    </Box>
  );
};

export default InputBoxComponent;
