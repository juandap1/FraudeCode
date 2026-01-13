import useFraudeStore from "../store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

export default async function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }
  if (query.startsWith("/")) {
  }
  updateOutput("command", query);
  useFraudeStore.setState({ status: 1 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  useFraudeStore.setState({ status: 0 }); // need to reset elapsedTime
}
