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
import DiffView from "./output/DiffView";
import ConfirmationView from "./output/ConfirmationView";
import ModelSelectView from "./output/ModelSelectView";
import KnowledgeView, { type KnowledgeViewData } from "./output/KnowledgeView";
import { THEME } from "../theme";

import InteractiveServerView from "./output/InteractiveServerView";

function renderItem(item: OutputItem) {
  switch (item.type) {
    case "log":
      return <Text>{item.content}</Text>;
    case "interrupted":
      return <Text dimColor>Interrupted ({item.content}s)</Text>;
    case "done":
      return <Text color={THEME.primaryDim}>{item.content}</Text>;
    case "error":
      return <ErrorView error={item.content} />;
    case "command":
      return <CommandView command={item.content} />;
    case "comment":
      return <CommentView comment={item.content} />;
    case "agentText":
    case "markdown":
      return <MarkdownView markdown={item.content} />;
    case "settings":
      return <SettingsRenderer item={item} />;
    case "reasoning":
      return <ReasoningView content={item.content} duration={item.duration} />;
    case "toolCall": {
      try {
        const data = JSON.parse(item.content);
        return (
          <ToolCallView
            action={data.action}
            details={data.details}
            result={data.result}
            duration={data.duration}
          />
        );
      } catch {
        return <Text dimColor>{item.content}</Text>;
      }
    }
    case "diff":
      return <DiffView diff={item.content} />;
    case "confirmation":
      return <ConfirmationView />;
    case "modelSelect":
      return <ModelSelectView />;
    case "interactive-server":
      return <InteractiveServerView routerId={item.content} />;
    case "knowledge": {
      try {
        const data = JSON.parse(item.content) as KnowledgeViewData;
        return <KnowledgeView data={data} />;
      } catch {
        return <Text dimColor>{item.content}</Text>;
      }
    }
    default:
      return null;
  }
}

export default memo(function OutputRenderer() {
  const outputItems = useFraudeStore((state) => state.outputItems);
  return (
    <Box flexDirection="column">
      {outputItems.map((item: OutputItem) => (
        <Box key={item.id} marginBottom={1}>
          {renderItem(item)}
        </Box>
      ))}
    </Box>
  );
});
