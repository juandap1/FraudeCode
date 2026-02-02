import { Box, Text } from "ink";
import path from "node:path";
import { THEME } from "@/theme";
import type { FileSuggestion } from "@/utils/fileSuggestions";

export default function FileSuggestions({
  selectedIndex,
  suggestions,
}: {
  selectedIndex: number;
  suggestions: FileSuggestion[];
}) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      borderStyle="round"
      borderColor={THEME.border} // Distinct color for files
      width={70}
    >
      <Text dimColor>Files (Tab to select):</Text>
      {suggestions.map((file, i) => {
        const fileName = path.basename(file.path);
        const dirName = path.dirname(file.path);

        let displayDir = "";
        if (dirName !== ".") {
          const fullDir = dirName + "/";
          const available = 58 - fileName.length;

          if (fullDir.length > available && available > 3) {
            displayDir = "..." + fullDir.slice(-(available - 3));
          } else if (fullDir.length <= available) {
            displayDir = fullDir;
          }
        }

        return (
          <Box key={file.path}>
            <Text wrap="truncate-end">
              <Text
                color={i === selectedIndex ? THEME.primaryLight : THEME.text}
                bold={i === selectedIndex}
              >
                {i === selectedIndex ? "› " : "  "}
                {fileName}
              </Text>
              {displayDir && <Text color={THEME.dim}> {displayDir}</Text>}
              {file.type === "dir" && file.childCount !== undefined ? (
                <Text color="gray">
                  {" "}
                  ({file.childCount} {file.childCount === 1 ? "file" : "files"})
                </Text>
              ) : null}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
