import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { TokenUsage } from "../store/useFraudeStore";

const LoaderComponent = ({
  status,
  tokenUsage,
}: {
  status: number;
  tokenUsage: TokenUsage;
}) => {
  const [i, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [interval, editInterval] = useState<NodeJS.Timeout | null>(null);
  const frames = [`·  Pondering.  `, `•  Pondering.. `, `●  Pondering...`];

  useEffect(() => {
    if (status === 1) {
      editInterval(
        setInterval(() => {
          setFrame((prevIndex) => (prevIndex + 1) % frames.length);
          setElapsed((prev) => prev + 1);
        }, 100)
      );
    } else {
      if (interval != null) clearInterval(interval);
      editInterval(null);
    }
  }, [status]);

  return (
    <Box marginY={1}>
      {status === 1 && (
        <Text>
          <Text color="rgb(255, 105, 180)">{frames[i]}</Text>
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
      {status === -1 && (
        <Text dimColor>Interrupted ({(elapsed / 10).toFixed(1)}s)</Text>
      )}
    </Box>
  );
};

export default LoaderComponent;
