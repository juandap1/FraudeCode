import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useFraudeStore } from "../store/useFraudeStore";

const CommentComponent = () => {
  const [value, setValue] = useState("");

  const handleChanges = (v: string) => {
    setValue(v);
  };

  const processSubmit = (v: string) => {
    if (v.trim() === "") return;
    setValue("");
    useFraudeStore.getState().resolveComment(v);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type in your comment and press enter (esc to cancel):</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt;</Text>
        <Box paddingLeft={1}>
          <TextInput
            value={value}
            onChange={handleChanges}
            onSubmit={processSubmit}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default CommentComponent;
