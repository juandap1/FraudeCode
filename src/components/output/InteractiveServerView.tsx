import { Box, Text, useInput } from "ink";
import { THEME } from "../../theme";
import { BunApiRouter } from "../../utils/router";
import { useState, useEffect } from "react";

interface InteractiveServerViewProps {
  routerId: string;
}

export default function InteractiveServerView({
  routerId,
}: InteractiveServerViewProps) {
  const [stopped, setStopped] = useState(false);

  // Retrieve the router instance to get details (like port)
  const router = BunApiRouter.getRouter(routerId);
  const port = router?.port || 3000;

  useEffect(() => {
    if (router) {
      router.onStop = () => {
        setStopped(true);
      };
    }
  }, [router]);

  useInput((input, key) => {
    if (stopped) return;

    if (input === "q") {
      BunApiRouter.stopRouter(routerId);
      setStopped(true);
    }
  });

  if (stopped) {
    return (
      <Box borderStyle="round" borderColor={THEME.dim} paddingX={1}>
        <Text color={THEME.dim}>● </Text>
        <Text color={THEME.dim}>Server stopped</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="white"
      paddingX={1}
    >
      <Box>
        <Text color={THEME.success}>● </Text>
        <Text bold color={THEME.text}>
          API Server Running{" "}
        </Text>
        <Text color={THEME.dim}>on </Text>
        <Text color={THEME.primary} underline>
          http://localhost:{port}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={THEME.dim} italic>
          Press 'q' to stop server
        </Text>
      </Box>
    </Box>
  );
}
