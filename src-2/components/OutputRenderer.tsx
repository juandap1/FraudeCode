import { Box } from "ink";
import { memo } from "react";
import { type OutputItem } from "../store/useFraudeStore";
import useFraudeStore from "../store/useFraudeStore";
import CommandView from "./output/CommandView";

function renderItem(item: OutputItem) {
  switch (item.type) {
    case "command":
      return <CommandView command={item.content} />;
    default:
      return null;
  }
}

export default memo(function OutputRenderer() {
  const outputItems = useFraudeStore((state) => state.outputItems);
  return (
    <Box flexDirection="column">
      {outputItems.map((item: OutputItem) => (
        <Box key={item.id}>{renderItem(item)}</Box>
      ))}
    </Box>
  );
});
