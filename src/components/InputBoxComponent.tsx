import { useState } from "react";
import { useApp, Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { OllamaCLI } from "../utils/ollamacli";

const InputBoxComponent = ({ OllamaClient }: { OllamaClient: OllamaCLI }) => {
  const [value, setValue] = useState("");
  const { exit } = useApp();
  //   const [submitted, setSubmitted] = useState("");

  return (
    <Box flexDirection="column" padding={1}>
      {/* {submitted && <Text color="green">You submitted: {submitted}</Text>} */}

      <Text>Type something and press enter or type "exit" to exit:</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt;</Text>
        <Box paddingLeft={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={(v) => {
              if (v.trim().toLowerCase() === "exit") {
                exit();
                return;
              }
              setValue("");
              OllamaClient.handleQuery(v);
            }}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default InputBoxComponent;
