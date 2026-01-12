import useFraudeStore from "../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

export default function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }
  if (query.startsWith("/")) {
  }
  updateOutput("command", query);
  // useFraudeStore.setState({ status: 1 });
}
