import { render, Box, Text } from "ink";

import Gradient from "ink-gradient";
import BigText from "ink-big-text";

const grad = [
  { r: 255, g: 105, b: 180 }, // pink
  { r: 255, g: 120, b: 160 },
  { r: 255, g: 135, b: 145 },
  { r: 255, g: 150, b: 130 },
  { r: 255, g: 165, b: 115 },
  { r: 255, g: 180, b: 100 },
  { r: 255, g: 195, b: 85 },
  { r: 255, g: 210, b: 70 },
  { r: 255, g: 225, b: 55 },
  { r: 255, g: 140, b: 0 }, // orange
];

export default function IntroComponent() {
  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor="rgb(255, 105, 180)"
        paddingX={2}
        width={"70%"}
      >
        <Text>
          <Text color="rgb(255, 105, 180)">*</Text> {" Welcome to "}
          <Text color="rgb(255, 105, 180)" bold>
            Fraude Code!
          </Text>
        </Text>
      </Box>
      <Gradient colors={grad}>
        <BigText text="Fraude" />
        <BigText text="Code" />
      </Gradient>
    </Box>
  );
}
