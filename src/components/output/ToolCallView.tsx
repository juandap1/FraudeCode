import { Box, Text } from "ink";

interface ToolCallViewProps {
  toolName: string;
  args?: string;
  result?: string;
  duration?: string;
}

export default function ToolCallView({
  toolName,
  args,
  result,
  duration,
}: ToolCallViewProps) {
  // Truncate result preview to 80 chars
  const resultPreview = result
    ? result.length > 80
      ? result.slice(0, 77) + "..."
      : result
    : null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray">[</Text>
        <Text color="cyan">tool</Text>
        <Text color="gray">]</Text>
        <Text> </Text>
        <Text bold>{toolName}</Text>
        {args && <Text dimColor>({args})</Text>}
        {duration && <Text dimColor> · {duration}</Text>}
      </Box>
      {resultPreview && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {resultPreview}</Text>
        </Box>
      )}
    </Box>
  );
}
