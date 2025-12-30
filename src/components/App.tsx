import IntroComponent from "./IntroComponent";
import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import useOllamaClient from "../hooks/useOllamaClient";
import OllamaClientComponent from "./OllamaClientComponent";
import { useFraudeStore, useInteraction } from "../store/useFraudeStore";
import log from "../utils/logger";

const Session = ({
  interactionId,
  onDone,
  isLast,
}: {
  interactionId: string | null;
  onDone: () => void;
  isLast: boolean;
}) => {
  const OllamaClient = useOllamaClient(interactionId);
  const interaction = useInteraction(interactionId);

  useInput((input, key) => {
    if (isLast && (key.escape || input === "\u001b")) {
      OllamaClient.interrupt();
    }
  });

  useEffect(() => {
    if (isLast && (interaction?.status === 2 || interaction?.status === -1)) {
      onDone();
    }
  }, [interaction?.status, onDone, isLast]);

  return <OllamaClientComponent OllamaClient={OllamaClient} />;
};

export default function App() {
  const started = useFraudeStore((state) => state.started);
  const interactionOrder = useFraudeStore((state) => state.interactionOrder);
  const lastInteractionId = useFraudeStore(
    (state) => state.currentInteractionId
  );

  // log(`App rendering with ${interactions.length} interactions`);

  useInput((input, key) => {
    if (key.return && !started) {
      useFraudeStore.setState({ started: true });
      useFraudeStore.getState().addInteraction();
      log("App Started...");
    }
  });

  const onDone = useCallback(() => {
    const { addInteraction } = useFraudeStore.getState();
    addInteraction();
  }, []);

  return (
    <Box flexDirection="column">
      {!started && <IntroComponent />}
      {started && (
        <>
          {interactionOrder.map((id) => (
            <Session
              key={id}
              interactionId={id}
              isLast={id === lastInteractionId}
              onDone={onDone}
            />
          ))}
        </>
      )}
    </Box>
  );
}
