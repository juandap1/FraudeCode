import { memo } from "react";
import type { OutputItem } from "../../store/useFraudeStore";
import CommandView from "./CommandView";
import CommentView from "./CommentView";
import { Box, Text } from "ink";
import Markdown from "@inkkit/ink-markdown";
import DiffViewer from "./DiffViewer";
import SettingsComponent from "../SettingsComponent";
import ErrorView from "./ErrorView";

// OutputRenderer component that renders each output item based on its type
const OutputRenderer = memo(({ item }: { item: OutputItem }) => {
  switch (item.type) {
    case "error":
      return <ErrorView error={item.content} />;
    case "settings":
      return <SettingsComponent query={item.content} />;
    case "command":
      return <CommandView command={item.content} />;
    case "comment":
      return <CommentView command={item.content} />;
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
    case "checkpoint":
      return (
        <Box flexDirection="column" marginBottom={1}>
          {item.content && (
            <Text bold color="rgb(255, 105, 180)">
              {item.content}
            </Text>
          )}
        </Box>
      );
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

export default OutputRenderer;
