import { Box, Text } from "ink";
import { Select, TextInput } from "@inkjs/ui";
import React, { useState, useMemo } from "react";
import pendingChanges from "@/agent/pendingChanges";
import DiffView from "./DiffView";
import QueryHandler from "@/utils/queryHandler";
import { projectPath } from "@/utils";
import { type PendingChange } from "@/agent/pendingChanges";

import useFraudeStore from "@/store/useFraudeStore";

export default function ConfirmationView() {
  const [status, setStatus] = useState<
    "pending" | "applied" | "rejected" | "viewing_file" | "revising"
  >("pending");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Get grouped changes directly from manager
  const groupedChanges = useMemo(
    () => pendingChanges.getAllChangesGrouped(),
    [],
  );
  const filePaths = Object.keys(groupedChanges);

  const handleMainSelect = (value: string) => {
    if (value === "apply_all") {
      pendingChanges.applyAll().then(() => {
        setStatus("applied");
        useFraudeStore.setState({ status: 0, statusText: "" });
      });
    } else if (value === "reject_all") {
      pendingChanges.rejectAll();
      setStatus("rejected");
      useFraudeStore.setState({ status: 0, statusText: "" });
    } else if (value.startsWith("view_")) {
      const path = value.replace("view_", "");
      setSelectedFile(path);
      setStatus("viewing_file");
    }
  };

  const handleFileAction = (value: string) => {
    if (value === "back") {
      setSelectedFile(null);
      setStatus("pending");
    }
  };

  if (status === "applied") {
    return (
      <Box borderStyle="round" borderColor="green" paddingX={1}>
        <Text color="green">✓ All changes applied successfully</Text>
      </Box>
    );
  }

  if (status === "rejected") {
    return (
      <Box borderStyle="round" borderColor="red" paddingX={1}>
        <Text color="red">✗ All changes rejected</Text>
      </Box>
    );
  }

  // View specific file details
  if (status === "viewing_file" && selectedFile) {
    const changes = groupedChanges[selectedFile];
    // Combine diffs if multiple changes to same file (though unlikely with current tool design, good specifically)
    // For now, just show the last one effectively, or map them.
    // Usually one pending change per file per batch unless we support multi-edit accumulation nicely.
    // Let's assume one major change per file for simplicity of view, or stack them.

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        padding={1}
      >
        <Text bold underline>
          {projectPath(selectedFile)}
        </Text>
        <Box flexDirection="column" marginY={1}>
          {changes?.map((change) => (
            <Box key={change.id} flexDirection="column" marginBottom={1}>
              <Text dimColor>Type: {change.type}</Text>
              <DiffView diff={change.diff} />
            </Box>
          ))}
        </Box>
        <Select
          options={[{ label: "← Back to Summary", value: "back" }]}
          onChange={handleFileAction}
        />
      </Box>
    );
  }

  // Handle revision feedback
  if (status === "revising") {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        padding={1}
      >
        <Text bold>Request Revision</Text>
        <Text>
          Enter your feedback to guide the agent (Press Enter to submit):
        </Text>
        <TextInput
          onSubmit={(value) => {
            if (!value.trim()) return;
            // Reset status for agent run
            useFraudeStore.setState({
              status: 1,
              statusText: "Revising changes...",
            });
            // Clear pending changes as we are revising
            pendingChanges.clear();
            // Send feedback to agent
            QueryHandler(`Revising changes: ${value}`);
          }}
          placeholder="e.g. Please fix the syntax error in utils.ts..."
        />
        <Box marginTop={1}>
          <Text dimColor>
            Press Esc to cancel (not really, just reload for now or type
            'cancel')
          </Text>
        </Box>
      </Box>
    );
  }

  // Main Summary View
  const options = [
    { label: "✓ Apply All Changes", value: "apply_all" },
    { label: "✗ Reject All Changes", value: "reject_all" },
    { label: "📝 Request Revision", value: "revise_all" },
    // Add options to inspect specific files
    ...filePaths.map((path) => ({
      label: `👁 Review ${projectPath(path)}`,
      value: `view_${path}`,
    })),
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
    >
      <Text bold color="yellow">
        Pending Changes Summary
      </Text>
      <Box flexDirection="column" marginY={1}>
        {filePaths.map((path) => {
          const changes = groupedChanges[path];
          const type = changes?.[0]?.type || "unknown";
          // Combine diffs if multiple changes to same file
          const diffContent = changes?.map((c) => c.diff).join("\n") || "";

          return (
            <Box
              key={path}
              flexDirection="column"
              marginBottom={1}
              borderStyle="single"
              borderColor="gray"
              padding={1}
            >
              <Text bold>
                {projectPath(path)} <Text dimColor>({type})</Text>
              </Text>
              <DiffView diff={diffContent} />
            </Box>
          );
        })}
      </Box>
      <Text>Select an action:</Text>
      <Select
        options={options}
        onChange={(value) => {
          if (value === "revise_all") {
            setStatus("revising");
          } else {
            handleMainSelect(value);
          }
        }}
      />
    </Box>
  );
}
