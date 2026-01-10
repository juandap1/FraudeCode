import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import type { Model } from "../../utils/Settings";

// Theme colors
const COLORS = {
  active: "#FF8C00", // Orange for active models
  accent: "#FF69B4", // Pink for commands/highlights
  header: "#87CEEB", // Sky blue for headers
  muted: "gray",
  dim: "gray",
  text: "white",
};

// Role abbreviations for compact display
const ROLE_ABBREV: Record<string, { short: string; color: string }> = {
  Reasoning: { short: "R", color: "#9370DB" }, // Purple
  General: { short: "G", color: "#20B2AA" }, // Teal
  "Light-weight": { short: "L", color: "#FFD700" }, // Gold
};

const formatSize = (bytes: number) => {
  if (!bytes || bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[Math.min(i, sizes.length - 1)] || "";
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + size;
};

const formatContext = (contextLength: number | undefined) => {
  if (!contextLength) return "—";
  return `${(contextLength / 1000).toFixed(0)}k`;
};

interface RoleBadgesProps {
  roles: string[];
}

const RoleBadges = ({ roles }: RoleBadgesProps) => {
  if (roles.length === 0) {
    return null;
  }

  // Just show the active role letters, no brackets or dots
  return (
    <Box>
      {Object.entries(ROLE_ABBREV).map(([role, { short, color }]) =>
        roles.includes(role) ? (
          <Text key={role} color={color} bold>
            {short}
          </Text>
        ) : null
      )}
    </Box>
  );
};

interface ModelRowProps {
  model: Model;
  roles: string[];
  showSize: boolean;
  showContext: boolean;
}

const ModelRow = ({ model, roles, showSize, showContext }: ModelRowProps) => {
  const isActive = roles.length > 0;

  return (
    <Box flexDirection="row" gap={1}>
      {/* Status indicator */}
      <Text color={isActive ? COLORS.active : COLORS.dim}>
        {isActive ? "✦" : " "}
      </Text>

      {/* Model name */}
      <Box flexGrow={1} flexShrink={1}>
        <Text
          color={isActive ? COLORS.active : COLORS.text}
          bold={isActive}
          wrap="truncate-end"
        >
          {model.name}
        </Text>
      </Box>

      {/* Role badges - right of name */}
      <Box width={5} justifyContent="flex-start">
        <RoleBadges roles={roles} />
      </Box>

      {/* Size column */}
      {showSize && (
        <Box width={8} justifyContent="flex-end">
          <Text color={COLORS.muted}>{formatSize(model.size || 0)}</Text>
        </Box>
      )}

      {/* Context column */}
      {showContext && (
        <Box width={6} justifyContent="flex-end">
          <Text color={COLORS.muted}>
            {formatContext(model.details?.context_length)}
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface ModelTableProps {
  title: string;
  models: Model[];
  getModelRoles: (name: string) => string[];
  showSize: boolean;
  showContext: boolean;
  emptyMessage: string;
}

const ModelTable = ({
  title,
  models,
  getModelRoles,
  showSize,
  showContext,
  emptyMessage,
}: ModelTableProps) => {
  const hasModels = models.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Section header */}
      <Box marginBottom={0}>
        <Text color={COLORS.header} bold>
          {title}
        </Text>
        <Text color={COLORS.dim}> ({models.length})</Text>
      </Box>

      {/* Table container */}
      <Box
        borderStyle="round"
        borderColor={hasModels ? "white" : COLORS.dim}
        flexDirection="column"
        paddingX={1}
      >
        {!hasModels ? (
          <Text color={COLORS.dim} italic>
            {emptyMessage}
          </Text>
        ) : (
          <>
            {/* Column headers */}
            <Box flexDirection="row" gap={1} marginBottom={0}>
              <Text color={COLORS.dim}> </Text>
              <Box flexGrow={1}>
                <Text color={COLORS.dim}>Model</Text>
              </Box>
              <Box width={5}>
                <Text color={COLORS.dim}>Role</Text>
              </Box>
              {showSize && (
                <Box width={8} justifyContent="flex-end">
                  <Text color={COLORS.dim}>Size</Text>
                </Box>
              )}
              {showContext && (
                <Box width={6} justifyContent="flex-end">
                  <Text color={COLORS.dim}>Ctx</Text>
                </Box>
              )}
            </Box>

            {/* Separator */}
            <Text color={COLORS.dim}>{"─".repeat(50)}</Text>

            {/* Model rows */}
            {models.map((model) => {
              const roles = getModelRoles(model.name);
              return (
                <ModelRow
                  key={model.digest}
                  model={model}
                  roles={roles}
                  showSize={showSize}
                  showContext={showContext}
                />
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
};

const Legend = () => (
  <Box flexDirection="column" paddingX={1}>
    <Box flexDirection="row" gap={2}>
      <Text>
        <Text color={COLORS.active}>✦</Text>
        <Text color={COLORS.dim}>=In use</Text>
      </Text>
      {Object.entries(ROLE_ABBREV).map(([role, { short, color }]) => (
        <Text key={role}>
          <Text color={color} bold>
            {short}
          </Text>
          <Text color={COLORS.dim}>={role}</Text>
        </Text>
      ))}
    </Box>

    <Box marginTop={1}>
      <Text>
        To switch models, use:{" "}
        <Text color={COLORS.accent}>/model &lt;model-name&gt;</Text>
      </Text>
    </Box>
  </Box>
);

const ModelList = () => {
  const { thinkerModel, generalModel, scoutModel, models, syncWithSettings } =
    useSettingsStore();

  useEffect(() => {
    syncWithSettings();
  }, [syncWithSettings]);

  const getModelRoles = (name: string) => {
    const roles: string[] = [];
    if (name.includes(thinkerModel)) roles.push("Reasoning");
    if (name.includes(generalModel)) roles.push("General");
    if (name.includes(scoutModel)) roles.push("Light-weight");
    return roles;
  };

  // Split and sort models by type
  const { groqModels, openrouterModels, ollamaModels } = useMemo(() => {
    const groq = models.filter((m) => m.type === "groq");
    const openrouter = models.filter((m) => m.type === "openrouter");
    const ollama = models.filter((m) => {
      const isOllama = m.type === "ollama" || !m.type;
      if (!isOllama) return false;
      // Exclude embedding-only models
      const caps = m.capabilities || [];
      return !(caps.length === 1 && caps[0] === "embedding");
    });

    // Sort each group: active models first, then alphabetically
    const sortModels = (arr: Model[]) =>
      arr.sort((a, b) => {
        const aActive = getModelRoles(a.name).length > 0;
        const bActive = getModelRoles(b.name).length > 0;
        if (aActive !== bActive) return bActive ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

    return {
      groqModels: sortModels(groq),
      openrouterModels: sortModels(openrouter),
      ollamaModels: sortModels(ollama),
    };
  }, [models, thinkerModel, generalModel, scoutModel]);

  return (
    <Box flexDirection="column" padding={1}>
      <ModelTable
        title="Groq"
        models={groqModels}
        getModelRoles={getModelRoles}
        showSize={false}
        showContext={true}
        emptyMessage="No Groq models configured"
      />

      <ModelTable
        title="OpenRouter"
        models={openrouterModels}
        getModelRoles={getModelRoles}
        showSize={false}
        showContext={true}
        emptyMessage="No OpenRouter models configured"
      />

      <ModelTable
        title="Ollama (Local)"
        models={ollamaModels}
        getModelRoles={getModelRoles}
        showSize={true}
        showContext={true}
        emptyMessage="No local Ollama models found. Is Ollama running?"
      />

      <Legend />
    </Box>
  );
};

export default ModelList;
