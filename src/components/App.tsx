import log from "../utils/logger";
import { useState } from "react";
import { Box, useInput, Text } from "ink";
import InputBox from "./input/InputBox";
import OutputRenderer from "./OutputRenderer";
import useFraudeStore from "../store/useFraudeStore";
import IntroComponent from "./IntroComponent";
import LoaderComponent from "./LoaderComponent";
import { THEME } from "../theme";

export default function App() {
  const { status, started, updateOutput } = useFraudeStore();
  const [exitPending, setExitPending] = useState(false);

  useInput((input, key) => {
    if (key.return && !started) {
      useFraudeStore.setState({ started: true });
      log("App Started...");
    }

    if (input === "c" && key.ctrl) {
      if (exitPending) {
        process.exit(0);
      } else {
        setExitPending(true);
        setTimeout(() => setExitPending(false), 2000);
      }
      return;
    }

    // Handle escape key to interrupt the agent
    if (key.escape && status === 1) {
      useFraudeStore.getState().interruptAgent();
      log("User pressed escape - interrupting agent");
      updateOutput(
        "interrupted",
        (useFraudeStore.getState().elapsedTime / 10).toFixed(1),
      );
    }
  });
  return !started ? (
    <IntroComponent />
  ) : (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <OutputRenderer />
      {status === 0 && <InputBox />}
      {status === 1 && <LoaderComponent />}
      {exitPending && (
        <Box marginTop={1}>
          <Text color={THEME.error}>Press Ctrl+C again to exit</Text>
        </Box>
      )}
    </Box>
  );
}
