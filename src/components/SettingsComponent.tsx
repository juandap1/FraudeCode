import { Box } from "ink";
import ModelList from "./settings/ModelList";

const SettingsComponent = ({ query }: { query: string }) => {
  switch (query) {
    case "/models":
      return (
        <Box>
          <ModelList />
        </Box>
      );
    default:
      return null;
  }
};

export default SettingsComponent;
