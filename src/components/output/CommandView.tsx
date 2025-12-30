import { Box, Text } from "ink";

const CommandView = ({ command }: { command: string }) => {
  return (
    <Box paddingY={1}>
      <Text color="rgb(255, 105, 180)">&gt;</Text>
      <Box paddingLeft={1}>
        <Text dimColor>{command}</Text>
      </Box>
    </Box>
  );
};

export default CommandView;
