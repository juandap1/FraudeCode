import { Box, Text } from "ink";

const ErrorView = ({ error }: { error: string }) => {
  return (
    <Box paddingX={1} borderStyle="round" borderColor="red">
      <Text color="red" bold>
        [Error] {error}
      </Text>
    </Box>
  );
};

export default ErrorView;
