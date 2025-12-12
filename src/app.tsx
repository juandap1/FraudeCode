import IntroComponent from "./components/IntroComponent";
import { Box } from "ink";
import useOllamaClient from "./utils/ollamacli";
import OllamaClientComponent from "./components/OllamaClientComponent";
import { useState, useEffect } from "react";
import { useInput } from "ink";

const Session = ({ onDone }: { onDone: () => void }) => {
  const OllamaClient = useOllamaClient("tinyllama:latest");

  useInput((input, key) => {
    if (key.escape || input === "\u001b") {
      OllamaClient.interrupt();
    }
  });

  useEffect(() => {
    if (OllamaClient.status === 2 || OllamaClient.status === -1) {
      onDone();
    }
  }, [OllamaClient.status, onDone]);

  return <OllamaClientComponent OllamaClient={OllamaClient} />;
};

export default function App() {
  const [sessions, setSessions] = useState([0]);

  const handleDone = (index: number) => {
    if (index === sessions.length - 1) {
      setSessions((prev) => [...prev, prev.length]);
    }
  };

  return (
    <Box flexDirection="column">
      <IntroComponent />
      {sessions.map((key, index) => (
        <Session key={key} onDone={() => handleDone(index)} />
      ))}
    </Box>
  );
}
