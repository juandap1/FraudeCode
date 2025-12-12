import { createContext, useState, useCallback } from "react";
import InputBoxComponent from "./components/InputBoxComponent";
import IntroComponent from "./components/IntroComponent";
import { Box, Text } from "ink";
import OllamaCLI from "./utils/ollamacli";
import LoaderComponent from "./components/LoaderComponent";

export default function App() {
  const [streamedText, setStreamedText] = useState("");
  const [working, setWorking] = useState(false);

  const handleChunk = useCallback((chunk: string) => {
    setStreamedText((prev) => prev + chunk);
  }, []);
  const OllamaClient = new OllamaCLI(
    "tinyllama:latest",
    handleChunk,
    setWorking
  );

  return (
    <Box flexDirection="column">
      <IntroComponent />
      <Text>{streamedText}</Text>
      {working ? (
        <LoaderComponent active={working} />
      ) : (
        <InputBoxComponent OllamaClient={OllamaClient} />
      )}
    </Box>
  );
}
