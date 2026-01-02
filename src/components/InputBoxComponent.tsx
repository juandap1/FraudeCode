import { useState, useEffect } from "react";
import { useApp, Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { OllamaCLI } from "../hooks/useOllamaClient";
import { useFraudeStore } from "../store/useFraudeStore";
import { homedir } from "os";

const shortenPath = (path: string) => {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
};

const InputBoxComponent = ({ OllamaClient }: { OllamaClient: OllamaCLI }) => {
  const [value, setValue] = useState("");
  const { exit } = useApp();
  const history = useFraudeStore((state) => state.history);
  const addToHistory = useFraudeStore((state) => state.addToHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputKey, setInputKey] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setValue(history[newIndex] ?? "");
        setInputKey((k) => k + 1);
      }
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setValue(history[newIndex] ?? "");
        setInputKey((k) => k + 1);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue("");
        setInputKey((k) => k + 1);
      }
    }

    if (key.tab) {
      const executionMode = useFraudeStore.getState().executionMode;
      const newMode = executionMode === "Fast" ? "Planning" : "Fast";
      useFraudeStore.setState({ executionMode: newMode });
    }
  });

  const handleChanges = (v: string) => {
    setValue(v);
    // Reset history index if user types something manual
    if (historyIndex !== -1 && v !== history[historyIndex]) {
      setHistoryIndex(-1);
    }
  };

  const processSubmit = (v: string) => {
    if (v.trim().toLowerCase() === "exit") {
      exit();
      return;
    }
    if (v.trim() === "") return;
    addToHistory(v);
    setValue("");
    setHistoryIndex(-1);
    OllamaClient.handleQuery(v);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type something and press enter or type "exit" to exit:</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt;</Text>
        <Box paddingLeft={1}>
          <TextInput
            key={inputKey}
            value={value}
            onChange={handleChanges}
            onSubmit={processSubmit}
          />
        </Box>
      </Box>
      <Box width={70} justifyContent="space-between" paddingX={1}>
        <Text color="gray">{shortenPath(process.cwd())}</Text>
        <Text color="cyan">
          <Text bold>{useFraudeStore.getState().executionMode}</Text> (Tab to
          toggle)
        </Text>
      </Box>
    </Box>
  );
};

export default InputBoxComponent;
