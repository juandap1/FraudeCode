import { Box, Text } from "ink";

interface ReasoningViewProps {
  content: string;
  duration?: string;
}

export default function ReasoningView({
  content,
  duration,
}: ReasoningViewProps) {
  return (
    <Box>
      <Text dimColor italic>
        {content}
        {duration && <Text dimColor> · {duration}</Text>}
      </Text>
    </Box>
  );
}
