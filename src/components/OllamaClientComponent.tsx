import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { OllamaCLI } from "../hooks/useOllamaClient";
import LoaderComponent from "./LoaderComponent";
import OutputRenderer from "./output/OutputRenderer";
import { useInteraction } from "../store/useFraudeStore";
import InputBoxComponent from "./InputBoxComponent";

type SelectItem = {
  label: string;
  value: boolean;
};

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
    OllamaClient.confirmModification(item.value);
  };

  const interaction = useInteraction(OllamaClient.interactionId);

  if (!interaction) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {/* Render output items in order */}
      {interaction.outputItems.map((item) => (
        <OutputRenderer key={item.id} item={item} />
      ))}

      {interaction.pendingConfirmation && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            Do you want to save these changes?
          </Text>
          <SelectInput
            items={confirmationItems}
            onSelect={handleConfirmationSelect}
          />
        </Box>
      )}

      {interaction.status !== 0 && interaction.status !== 3 && (
        <LoaderComponent
          status={interaction.status}
          tokenUsage={interaction.tokenUsage}
          statusText={interaction.statusText}
        />
      )}
      {interaction.status === 0 && (
        <InputBoxComponent OllamaClient={OllamaClient} />
      )}
    </Box>
  );
};

export default OllamaClientComponent;
