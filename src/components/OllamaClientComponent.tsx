import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
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

  const handleConfirmationSelect = (value: string) => {
    // Parse the string value back to boolean
    useFraudeStore.getState().resolveConfirmation(value === "true");
  };

  const interaction = useInteraction(OllamaClient.interactionId);
  const promptInfo = useFraudeStore((state) => state.promptInfo);

  if (!interaction) {
    return null;
  }

  // Convert SelectItem[] to options format for @inkjs/ui Select
  // Must use string values for @inkjs/ui Select
  const selectOptions = (promptInfo?.options || confirmationItems).map(
    (item) => ({
      label: item.label,
      value: String(item.value), // Convert boolean to string
    })
  );

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
          <Select options={selectOptions} onChange={handleConfirmationSelect} />
        </Box>
      )}

      {interaction.status !== 0 &&
        interaction.status !== 4 &&
        !interaction.settingsInteraction && (
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
    </Box>
  );
};

export default OllamaClientComponent;
