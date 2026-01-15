import { Box, Text } from "ink";
import { memo } from "react";
import { type OutputItem } from "@/types/OutputItem";
import useFraudeStore from "../store/useFraudeStore";
import CommandView from "./output/CommandView";
import CommentView from "./output/CommentView";
import MarkdownView from "./output/MarkdownView";
import SettingsRenderer from "./SettingsRenderer";
import ErrorView from "./output/ErrorView";
import ReasoningView from "./output/ReasoningView";
import ToolCallView from "./output/ToolCallView";
import AgentTextView from "./output/AgentTextView";

function renderItem(item: OutputItem) {
  switch (item.type) {
    case "log":
      return <Text>{item.content}</Text>;
    case "checkpoint":
      return (
        <Text bold color="rgb(255, 105, 180)">
          {item.content}
        </Text>
      );
    case "error":
      return <ErrorView error={item.content} />;
    case "command":
      return <CommandView command={item.content} />;
    case "comment":
      return <CommentView comment={item.content} />;
    case "markdown":
      return <MarkdownView markdown={item.content} />;
    case "settings":
      return <SettingsRenderer item={item} />;
    case "reasoning":
      return <ReasoningView content={item.content} />;
    case "toolCall": {
      try {
        const data = JSON.parse(item.content);
        return (
          <ToolCallView
            toolName={data.toolName}
            args={data.args}
            result={data.result}
            duration={data.duration}
          />
        );
      } catch {
        return <Text dimColor>{item.content}</Text>;
      }
    }
    case "agentText":
      return <AgentTextView content={item.content} />;
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
