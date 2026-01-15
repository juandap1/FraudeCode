import { Box, Text } from "ink";
import { useMemo } from "react";
import useFraudeStore from "@/store/useFraudeStore";
import useSettingsStore from "@/store/useSettingsStore";

const ContextUsage = () => {
  const { contextManager } = useFraudeStore();
  const { generalModel, models } = useSettingsStore();

  const { usedTokens, maxTokens, percentage, progressBar } = useMemo(() => {
    // Find the current model from the models list
    const currentModel = models.find((m) => m.name === generalModel);
    const contextLength = currentModel?.details?.context_length || 128000; // Default fallback

    const used = contextManager.estimateContextTokens();
    const pct = Math.min((used / contextLength) * 100, 100);

    // Create a simple visual progress bar
    const barWidth = 20;
    const filledWidth = Math.round((pct / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    return {
      usedTokens: used,
      maxTokens: contextLength,
      percentage: pct,
      progressBar: bar,
    };
  }, [contextManager, generalModel, models]);

  // Color based on usage percentage
  const getColor = () => {
    if (percentage >= 90) return "#FF4444"; // Red - critical
    if (percentage >= 70) return "#FFA500"; // Orange - warning
    if (percentage >= 50) return "#FFD700"; // Yellow - moderate
    return "#20B2AA"; // Teal - healthy
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color="rgb(255, 105, 180)">⛁</Text>
        <Text color={getColor()}>{progressBar}</Text>
        <Text>
          <Text color={getColor()} bold>
            {formatTokens(usedTokens)}
          </Text>
          <Text color="gray"> / {formatTokens(maxTokens)}</Text>
          <Text color={getColor()}> ({percentage.toFixed(1)}%)</Text>
        </Text>
      </Box>
    </Box>
  );
};

export default ContextUsage;
