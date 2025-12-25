import React, { memo } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Markdown from "@inkkit/ink-markdown";
import type { OllamaCLI, OutputItem } from "../utils/ollamacli";
import LoaderComponent from "./LoaderComponent";
import InputBoxComponent from "./InputBoxComponent";
import DiffViewer from "./output/DiffViewer";

type SelectItem = {
  label: string;
  value: boolean;
};

// OutputRenderer component that renders each output item based on its type
const OutputRenderer = memo(({ item }: { item: OutputItem }) => {
  switch (item.type) {
    case "log":
      return item.content || item.title ? (
        <Box flexDirection="column" marginBottom={1}>
          {item.title && (
            <Text bold color="cyan">
              {item.title}:
            </Text>
          )}
          {item.content && <Text>{item.content}</Text>}
        </Box>
      ) : null;
    case "markdown":
      return (
        <Box marginLeft={1}>
          <Markdown>{item.content}</Markdown>
        </Box>
      );
    case "diff":
      return (
        <Box flexDirection="column" marginBottom={1}>
          {item.title && (
            <Text bold color="yellow">
              {item.title}:
            </Text>
          )}
          {item.changes && item.changes.length > 0 && (
            <DiffViewer changes={item.changes} />
          )}
        </Box>
      );
    default:
      return null;
  }
});

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
