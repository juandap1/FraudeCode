import { memo } from "react";
import { type OutputItem } from "@/types/OutputItem";
import ModelList from "./settings/ModelList";
import ContextUsage from "./output/ContextUsage";

export default memo(function SettingsRenderer({ item }: { item: OutputItem }) {
  switch (item.content) {
    case "/models":
      return <ModelList />;
    case "/context":
      return <ContextUsage />;
    default:
      return null;
  }
});
