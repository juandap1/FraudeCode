import { Box, Text } from "ink";
import type { CommandDefinition } from "@/types/CommandDefinition";

export default function CommandSuggestions({
  selectedIndex,
  filteredTemplates,
}: {
  selectedIndex: number;
  filteredTemplates: CommandDefinition[];
}) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      borderStyle="single"
      borderColor="gray"
      width={68}
      marginLeft={1}
    >
      <Text dimColor>Commands (Tab accepts ghost text):</Text>
      {filteredTemplates.map((cmd, i) => (
        <Box key={cmd.usage}>
          <Text
            color={i === selectedIndex ? "cyan" : "gray"}
            bold={i === selectedIndex}
          >
            {i === selectedIndex ? "› " : "  "}
            {cmd.usage}
          </Text>
          <Text color="gray"> - {cmd.description}</Text>
        </Box>
      ))}
      {/* Show role hint if selected command has [role] */}
      {filteredTemplates[selectedIndex]?.usage.includes("[role]") && (
        <Text dimColor italic>
          {"  "}[role]: reasoning | general | light | all (or r|g|l|a)
        </Text>
      )}
    </Box>
  );
}
