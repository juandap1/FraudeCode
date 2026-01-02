import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import {
  useFraudeStore,
  useInteraction,
  type TokenUsage,
} from "../store/useFraudeStore";
const { updateInteraction } = useFraudeStore.getState();

const LoaderComponent = ({
  id,
  status,
  tokenUsage,
  statusText,
}: {
  id: string;
  status: number;
  tokenUsage: TokenUsage;
  statusText?: string;
}) => {
  const [i, setFrame] = useState(0);
  const frames = (text: string) => [
    `·  ${text}.  `,
    `•  ${text}.. `,
    `●  ${text}...`,
  ];

  const interaction = useInteraction(id);
  const elapsed = interaction?.timeElapsed || 0;

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (status === 1) {
      timer = setInterval(() => {
        setFrame((prevIndex) => (prevIndex + 1) % 3);

        // Use getState() to avoid stale closure and get the most recent timeElapsed
        const currentInteraction = useFraudeStore.getState().interactions[id];
        const currentElapsed = currentInteraction?.timeElapsed || 0;

        updateInteraction(id, {
          timeElapsed: currentElapsed + 1,
        });
      }, 100);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [status, id]);

  const currentStatusText = statusText || "Pondering";
  const currentFrames = frames(currentStatusText);

  return (
    <Box marginY={1}>
      {status === 1 && (
        <Text>
          <Text color="rgb(255, 105, 180)">{currentFrames[i]} </Text>
          <Text>
            ({(elapsed / 10).toFixed(1)}s · <Text bold>esc</Text> to interrupt)
          </Text>
        </Text>
      )}
      {status === 2 && (
        <Text dimColor>
          Finished ({(elapsed / 10).toFixed(1)}s ※ {tokenUsage.total} tokens)
        </Text>
      )}
      {status === 3 && (
        <Text color="yellow">
          ▶ Awaiting user confirmation... ({(elapsed / 10).toFixed(1)}s)
        </Text>
      )}
      {status === -1 && (
        <Text dimColor>Interrupted ({(elapsed / 10).toFixed(1)}s)</Text>
      )}
    </Box>
  );
};

export default LoaderComponent;
