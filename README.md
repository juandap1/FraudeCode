# FraudeCode

FraudeCode is a learning project designed to imitate the core functionality of **Claude Code**. It provides a terminal-based interface (TUI) for analyzing, querying, and modifying codebases using local AI models.

## 🚀 Overview

The project leverages a combination of semantic search and structural analysis to assist in developer workflows:

- **Structural Analysis**: Uses **Neo4j** and **Tree-sitter** to map out function calls, class definitions, and file relationships.
- **Semantic Search**: Uses **Qdrant** and **Ollama** embeddings to locate relevant code blocks based on natural language queries.
- **Code Modification**: Implements a **LangGraph** workflow to plan and apply changes to files safely.

## 📁 Project Structure

```text
├── scripts/             # Entry points for indexing and manual verification
├── src/
│   ├── components/      # Terminal UI components (Ink + React)
│   ├── core/            # Core logic (Analysis, Modifications, LangGraph nodes)
│   ├── hooks/           # React hooks for managing state and AI interactions
│   ├── services/        # Service integrations (Neo4j, Qdrant, Ollama)
│   ├── types/           # TypeScript definitions and interfaces
│   └── utils/           # Shared utility functions
└── sample/              # Sample project used for testing analysis logic
```

## 🛠️ Getting Started

### Prerequisites

You need the following services running locally via Docker:

- **Neo4j**: Graph database for structural relationships.
- **Qdrant**: Vector database for semantic search.
- **Ollama**: LLM engine for embeddings and code generation.

You can start these using the provided `docker-compose.yml`:

```bash
docker-compose up -d
```

### Installation

1. Install dependencies using [Bun](https://bun.sh/):
   ```bash
   bun install
   ```
2. Configure environment variables:
   - Copy `.env.example` to `.env` and adjust settings as needed.

### Running

1. **Index your codebase**:
   ```bash
   bun run scripts/analysis.ts
   ```
2. **Launch the CLI**:
   ```bash
   bun run dev
   ```

### MODELS

| Model Name       | Size | Context Window | Speed (M2) | Notable Feature                    |
| :--------------- | :--- | :------------- | :--------- | :--------------------------------- |
| qwen2.5:0.5b     | 0.5B | 32K            | ~90 tok/s  | Lightning fast; edge-ready         |
| qwen2.5-coder:7b | 7B   | 128K           | ~25 tok/s  | Best performance-to-speed for code |
| llama3.1:latest  | 8B   | 128K           | ~18 tok/s  | Great balance of logic and utility |
| mistral:latest   | 7B   | 32K            | ~22 tok/s  | Efficient for shorter interactions |
| qwen3:8b         | 8B   | 128K           | ~15 tok/s  | Native thinking/reasoning mode     |
| phi4:latest      | 14B  | 16K            | ~10 tok/s  | High-tier reasoning; slower on M2  |

## 🧰 Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **UI**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
- **Workflows**: [LangGraph](https://github.com/langchain-ai/langgraphjs)
- **Databases**: [Neo4j](https://neo4j.com/), [Qdrant](https://qdrant.tech/)
- **AI Infrastructure**: [Ollama](https://ollama.com/)
- **Parsing**: [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
