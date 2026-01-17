import log from "../utils/logger";
import { Box, useInput } from "ink";
import InputBox from "./input/InputBox";
import OutputRenderer from "./OutputRenderer";
import useFraudeStore from "../store/useFraudeStore";
import IntroComponent from "./IntroComponent";
import LoaderComponent from "./LoaderComponent";
export default function App() {
  const { status, started, updateOutput } = useFraudeStore();

  useInput((input, key) => {
    if (key.return && !started) {
      useFraudeStore.setState({ started: true });
      log("App Started...");
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
    <Box flexDirection="column">
      <OutputRenderer />
      {status === 0 && <InputBox />}
      {status === 1 && <LoaderComponent />}
    </Box>
  );
}
