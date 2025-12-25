import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Markdown from "@inkkit/ink-markdown";
import * as diff from "diff";
import type { OllamaCLI } from "../utils/ollamacli";
import LoaderComponent from "./LoaderComponent";
import InputBoxComponent from "./InputBoxComponent";
import type { PendingChange } from "../utils/actions/langgraph_modify";

type SelectItem = {
  label: string;
  value: boolean;
};

const DiffViewer = ({ changes }: { changes: PendingChange[] }) => {
  console.log(`[DiffViewer] Received ${changes?.length || 0} changes`);

  if (!changes || changes.length === 0) {
    return null;
  }

  // Group all changes by file path to ensure one box per file
  const consolidated = changes.reduce((acc, curr) => {
    acc[curr.filePath] = curr;
    return acc;
  }, {} as Record<string, PendingChange>);

  console.log(
    `[DiffViewer] Consolidated to ${Object.keys(consolidated).length} files`
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {Object.values(consolidated).map((change, fIndex) => {
        console.log(
          `[DiffViewer] File ${fIndex}: ${change.filePath}, oldLen=${change.oldContent?.length}, newLen=${change.newContent?.length}`
        );
        const diffLines = diff.diffLines(
          change.oldContent || "",
          change.newContent || ""
        );

        // Process diff lines into a unified list with metadata
        const processedLines: {
          type: "added" | "removed" | "context";
          lineNum: number;
          content: string;
        }[] = [];
        let newLineNum = 1;

        diffLines.forEach((part) => {
          const lines = part.value.split("\n");
          if (lines[lines.length - 1] === "") lines.pop();

          lines.forEach((lineContent) => {
            if (part.added) {
              processedLines.push({
                type: "added",
                lineNum: newLineNum++,
                content: lineContent,
              });
            } else if (part.removed) {
              processedLines.push({
                type: "removed",
                lineNum: -1,
                content: lineContent,
              });
            } else {
              processedLines.push({
                type: "context",
                lineNum: newLineNum++,
                content: lineContent,
              });
            }
          });
        });

        // Identify modified regions and apply 3-line context window
        const modifiedIndices = new Set<number>();
        processedLines.forEach((l, i) => {
          if (l.type !== "context") {
            for (
              let j = Math.max(0, i - 3);
              j <= Math.min(processedLines.length - 1, i + 3);
              j++
            ) {
              modifiedIndices.add(j);
            }
          }
        });

        return (
          <Box
            key={fIndex}
            flexDirection="column"
            borderStyle="round"
            paddingLeft={1}
            marginBottom={1}
            borderColor="dim"
          >
            <Box marginBottom={1}>
              <Text color="green" bold>
                ✓
              </Text>
              <Text bold> Edit {change.filePath}:</Text>
            </Box>
            {processedLines.map((line, i) => {
              if (!modifiedIndices.has(i)) {
                // Show divider if we just exited a modified region and there's more coming
                let hasMore = false;
                for (let j = i + 1; j < processedLines.length; j++) {
                  if (modifiedIndices.has(j)) {
                    hasMore = true;
                    break;
                  }
                }

                if (i > 0 && modifiedIndices.has(i - 1) && hasMore) {
                  return (
                    <Box
                      key={`divider-${i}`}
                      flexDirection="row"
                      alignItems="center"
                    >
                      <Text color="dim"> │ </Text>
                      <Box
                        flexGrow={1}
                        borderStyle="single"
                        borderTop={true}
                        borderBottom={false}
                        borderLeft={false}
                        borderRight={false}
                        borderColor="dim"
                      />
                      <Text color="dim"> │</Text>
                    </Box>
                  );
                }
                return null;
              }

              const lineNumPrefix =
                line.lineNum !== -1
                  ? line.lineNum.toString().padStart(4)
                  : "    ";

              if (line.type === "added") {
                return (
                  <Box key={i}>
                    <Text color="dim">{lineNumPrefix} </Text>
                    <Text color="green" bold>
                      +
                    </Text>
                    <Text backgroundColor="#1a331a" color="white">
                      {" "}
                      {line.content}{" "}
                    </Text>
                  </Box>
                );
              } else if (line.type === "removed") {
                return (
                  <Box key={i}>
                    <Text color="dim"> </Text>
                    <Text color="red" bold>
                      -
                    </Text>
                    <Text backgroundColor="#331a1a" color="white">
                      {" "}
                      {line.content}{" "}
                    </Text>
                  </Box>
                );
              } else {
                return (
                  <Box key={i}>
                    <Text color="dim">
                      {lineNumPrefix} {line.content}
                    </Text>
                  </Box>
                );
              }
            })}
          </Box>
        );
      })}
    </Box>
  );
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

  console.log(
    `[OllamaClientComponent] pendingChanges.length = ${
      OllamaClient.pendingChanges?.length || 0
    }`
  );

  return (
    <Box flexDirection="column">
      {OllamaClient.streamedText && (
        <Box marginBottom={1}>
          <Text>{OllamaClient.streamedText}</Text>
        </Box>
      )}

      {OllamaClient.implementationPlan && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="dim"
          paddingX={1}
          marginBottom={1}
        >
          <Text bold>Implementation Plan:</Text>
          <Box marginTop={1}>
            <Markdown>{OllamaClient.implementationPlan}</Markdown>
          </Box>
        </Box>
      )}

      {OllamaClient.implementationLogs && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="dim"
          paddingX={1}
          marginBottom={1}
        >
          <Text bold>Status:</Text>
          <Box marginTop={1}>
            <Text color="dim">{OllamaClient.implementationLogs}</Text>
          </Box>
        </Box>
      )}

      {OllamaClient.pendingChanges.length > 0 && (
        <DiffViewer changes={OllamaClient.pendingChanges} />
      )}

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
