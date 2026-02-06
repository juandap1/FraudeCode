import { Box, Text } from "ink";
import { Badge, UnorderedList } from "@inkjs/ui";
import { THEME } from "@/theme";

// Knowledge type configuration - using simple ASCII symbols
const TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  decision: { icon: "*", label: "DEC", color: THEME.success },
  fact: { icon: "-", label: "FCT", color: THEME.info },
  concept: { icon: "+", label: "CON", color: "#cba6f7" }, // Mauve
  reference: { icon: ">", label: "REF", color: "#fab387" }, // Peach
};

interface KnowledgeItem {
  content: string;
  type: string;
}

interface KnowledgeSummaryData {
  decisions: KnowledgeItem[];
  facts: KnowledgeItem[];
  concepts: KnowledgeItem[];
  references: KnowledgeItem[];
  // summaries: KnowledgeItem[];
}

interface KnowledgeSearchData {
  query: string;
  results: KnowledgeItem[];
}

export type KnowledgeViewData =
  | { mode: "summary"; data: KnowledgeSummaryData }
  | { mode: "search"; data: KnowledgeSearchData }
  | { mode: "empty"; message?: string };

interface KnowledgeViewProps {
  data: KnowledgeViewData;
}

// Helper to truncate text
const truncate = (str: string, len: number): string => {
  const cleaned = str.replace(/\n/g, " ").trim();
  return cleaned.length > len ? `${cleaned.slice(0, len)}...` : cleaned;
};

// Section renderer for summary view
function KnowledgeSection({
  title,
  type,
  items,
  limit,
}: {
  title: string;
  type: string;
  items: KnowledgeItem[];
  limit: number;
}) {
  if (items.length === 0) return null;

  const config = TYPE_CONFIG[type] || {
    icon: "-",
    label: type.slice(0, 3).toUpperCase(),
    color: THEME.dim,
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={config.color}>{config.icon}</Text>
        <Text bold color={THEME.text}>
          {title}
        </Text>
        <Text color={THEME.dim}>-</Text>
        <Text color={THEME.dim}>{items.length}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        <UnorderedList>
          {items.slice(0, limit).map((item, i) => (
            <UnorderedList.Item key={i}>
              <Text color={THEME.text}>{truncate(item.content, 58)}</Text>
            </UnorderedList.Item>
          ))}
        </UnorderedList>
        {items.length > limit && (
          <Text color={THEME.dim} italic>
            {"    "}... {items.length - limit} more
          </Text>
        )}
      </Box>
    </Box>
  );
}

// Search result item
function SearchResultItem({ item }: { item: KnowledgeItem }) {
  const config = TYPE_CONFIG[item.type] || {
    icon: "-",
    label: item.type.slice(0, 3).toUpperCase(),
    color: THEME.dim,
  };

  return (
    <Box gap={1}>
      <Badge color={config.color}>{config.label}</Badge>
      <Text color={THEME.text}>{truncate(item.content, 52)}</Text>
    </Box>
  );
}

export default function KnowledgeView({ data }: KnowledgeViewProps) {
  if (data.mode === "empty") {
    return (
      <Box flexDirection="column">
        <Text bold color={THEME.primary}>
          Project Knowledge
        </Text>
        <Box paddingY={1}>
          <Text color={THEME.dim}>
            {data.message ||
              "No knowledge stored yet. Start a conversation to build context."}
          </Text>
        </Box>
        <Box>
          <Text color={THEME.dim}>Tip: Use </Text>
          <Text color={THEME.primary}>/knowledge {"<query>"}</Text>
          <Text color={THEME.dim}> to search</Text>
        </Box>
      </Box>
    );
  }

  if (data.mode === "search") {
    const { query, results } = data.data;

    if (results.length === 0) {
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold color={THEME.primary}>
              Search:
            </Text>
            <Text color={THEME.dim}>"{truncate(query, 40)}"</Text>
          </Box>
          <Box paddingY={1}>
            <Text color={THEME.dim}>No results found</Text>
          </Box>
          <Box>
            <Text color={THEME.dim}>Try a different query or use </Text>
            <Text color={THEME.primary}>/knowledge</Text>
            <Text color={THEME.dim}> to see all items</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box gap={1} marginBottom={1}>
          <Text bold color={THEME.primary}>
            Search:
          </Text>
          <Text color={THEME.dim}>
            "{truncate(query, 30)}" - {results.length} found
          </Text>
        </Box>
        <Box flexDirection="column" gap={1}>
          {results.map((item, i) => (
            <SearchResultItem key={i} item={item} />
          ))}
        </Box>
      </Box>
    );
  }

  // Summary view
  const { decisions, facts, concepts, references } = data.data;
  const total =
    decisions.length + facts.length + concepts.length + references.length;
  // + summaries.length;

  return (
    <Box flexDirection="column">
      <Box gap={1} marginBottom={1}>
        <Text bold color={THEME.primary}>
          Project Knowledge
        </Text>
        <Text color={THEME.dim}>- {total} items</Text>
      </Box>
      <Box flexDirection="column">
        <KnowledgeSection
          title="Decisions"
          type="decision"
          items={decisions}
          limit={4}
        />
        <KnowledgeSection title="Facts" type="fact" items={facts} limit={4} />
        <KnowledgeSection
          title="Concepts"
          type="concept"
          items={concepts}
          limit={3}
        />
        <KnowledgeSection
          title="References"
          type="reference"
          items={references}
          limit={3}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={THEME.dim}>Tip: Use </Text>
        <Text color={THEME.primary}>/knowledge {"<query>"}</Text>
        <Text color={THEME.dim}> to search</Text>
      </Box>
    </Box>
  );
}
