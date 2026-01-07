import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { OllamaCLI } from "../hooks/useOllamaClient";
import LoaderComponent from "./LoaderComponent";
import OutputRenderer from "./output/OutputRenderer";
import {
  useInteraction,
  useFraudeStore,
  type SelectItem,
} from "../store/useFraudeStore";
import InputBoxComponent from "./InputBoxComponent";
import CommentComponent from "./CommentComponent";

const OllamaClientComponent = ({
  OllamaClient,
}: {
  OllamaClient: OllamaCLI;
}) => {
  const confirmationItems: SelectItem[] = [
    { label: "✅ Accept changes", value: true },
    { label: "❌ Reject changes", value: false },
  ];

  const handleConfirmationSelect = (item: SelectItem) => {
    useFraudeStore.getState().resolveConfirmation(item.value);
  };

  const interaction = useInteraction(OllamaClient.interactionId);
  const promptInfo = useFraudeStore((state) => state.promptInfo);

  if (!interaction) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {/* Render output items in order */}
      {interaction.outputItems.map((item) => (
        <OutputRenderer key={item.id} item={item} />
      ))}

      {interaction.status === 3 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            {promptInfo?.query || "Do you want to save these changes?"}
          </Text>
          <SelectInput
            items={promptInfo?.options || confirmationItems}
            onSelect={handleConfirmationSelect}
          />
        </Box>
      )}

      {interaction.status !== 0 &&
        interaction.status !== 4 &&
        interaction.elapsedTime > 0 && (
          <LoaderComponent
            id={interaction.interactionId}
            status={interaction.status}
            tokenUsage={interaction.tokenUsage}
            statusText={interaction.statusText}
          />
        )}
      {interaction.status === 4 && <CommentComponent />}
      {interaction.status === 0 && (
        <InputBoxComponent OllamaClient={OllamaClient} />
      )}
      {/* <Text>Status: {interaction.status}</Text> */}
    </Box>
  );
};

export default OllamaClientComponent;
