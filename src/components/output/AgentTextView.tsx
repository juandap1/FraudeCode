import MarkdownView from "./MarkdownView";

interface AgentTextViewProps {
  content: string;
}

export default function AgentTextView({ content }: AgentTextViewProps) {
  return <MarkdownView markdown={content} />;
}
