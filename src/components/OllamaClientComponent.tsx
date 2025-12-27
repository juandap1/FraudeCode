import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { OllamaCLI } from "../utils/ollamacli";
import LoaderComponent from "./LoaderComponent";
import InputBoxComponent from "./InputBoxComponent";
import OutputRenderer from "./output/OutputRenderer";

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

  return (
    <Box flexDirection="column">
      {/* Render output items in order */}
      {OllamaClient.outputItems.map((item) => (
        <OutputRenderer key={item.id} item={item} />
      ))}

      {OllamaClient.pendingConfirmation && (
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
      {OllamaClient.status !== 0 && OllamaClient.status !== 3 && (
        <LoaderComponent
          status={OllamaClient.status}
          tokenUsage={OllamaClient.tokenUsage}
        />
      )}
      {OllamaClient.status === 0 && (
        <InputBoxComponent OllamaClient={OllamaClient} />
      )}
    </Box>
  );
};

export default OllamaClientComponent;
