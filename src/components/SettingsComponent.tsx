import { Box } from "ink";
import OllamaModelSettings from "./settings/OllamaModelSettings";

const SettingsComponent = ({ query }: { query: string }) => {
  return (
    <Box flexDirection="column">
      <OllamaModelSettings />
    </Box>
  );
};

export default SettingsComponent;
