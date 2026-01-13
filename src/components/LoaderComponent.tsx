import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import useFraudeStore from "../store/useFraudeStore";
import type { TokenUsage } from "@/types/TokenUsage";

const LoaderComponent = () => {
  const [i, setFrame] = useState(0);
  const frames = (text: string) => [
    `·  ${text}.  `,
    `•  ${text}.. `,
    `●  ${text}...`,
  ];

  const { status, elapsedTime, statusText } = useFraudeStore();

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (status === 1) {
      timer = setInterval(() => {
        setFrame((prevIndex) => (prevIndex + 1) % 3);

        // Use getState() to avoid stale closure and get the most recent timeElapsed
        const currentElapsed = useFraudeStore.getState().elapsedTime;

        useFraudeStore.setState({
          elapsedTime: currentElapsed + 1,
        });
      }, 100);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [status]);

  const currentStatusText = statusText || "Pondering";
  const currentFrames = frames(currentStatusText);

  return (
    <Box marginY={1}>
      <Text>
        <Text color="rgb(255, 105, 180)">{currentFrames[i]} </Text>
        <Text>
          ({(elapsedTime / 10).toFixed(1)}s · <Text bold>esc</Text> to
          interrupt)
        </Text>
      </Text>
    </Box>
  );
};

//  {status === 2 && (
//     <Text dimColor>
//       Finished ({(elapsed / 10).toFixed(1)}s ※ {tokenUsage.total} tokens)
//     </Text>
//   )}
//   {status === 3 && (
//     <Text color="yellow">
//       ▶ Awaiting user confirmation... ({(elapsed / 10).toFixed(1)}s)
//     </Text>
//   )}
//   {status === -1 && (
//     <Text dimColor>Interrupted ({(elapsed / 10).toFixed(1)}s)</Text>
//   )}

export default LoaderComponent;
