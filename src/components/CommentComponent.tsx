import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import { useFraudeStore } from "../store/useFraudeStore";

const CommentComponent = () => {
  const processSubmit = (v: string) => {
    if (v.trim() === "") return;
    useFraudeStore.getState().resolveComment(v);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type in your comment and press enter (esc to cancel):</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt; </Text>
        <Box flexGrow={1}>
          <TextInput
            placeholder="Enter your comment..."
            onSubmit={processSubmit}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default CommentComponent;
