import { Box, Text } from "ink";
import type { OutputItem } from "@/types/OutputItem";

const CheckpointView = ({ item }: { item: OutputItem }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {item.content && (
        <Text bold color="rgb(255, 105, 180)">
          {item.content}
        </Text>
      )}
    </Box>
  );
};

export default CheckpointView;
