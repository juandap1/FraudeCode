-- Knowledge Graph Schema for Rust Learning Platform
-- Version: 1.0

-- 1. The Knowledge Graph (Static)
CREATE TABLE IF NOT EXISTS concepts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT, -- e.g., 'cli', 'agentic', 'core', 'data', 'patterns', 'architecture', 'memory', 'concurrency', 'async'
    language TEXT DEFAULT 'rust', -- e.g. 'rust', 'python', 'javascript'
    complexity REAL DEFAULT 0.5,
    metadata JSON -- Store project ideas, keywords here
);

CREATE TABLE IF NOT EXISTS dependencies (
    child_id TEXT,
    parent_id TEXT,
    PRIMARY KEY (child_id, parent_id),
    FOREIGN KEY(child_id) REFERENCES concepts(id),
    FOREIGN KEY(parent_id) REFERENCES concepts(id)
);

-- 2. User Analytics & Mastery (Dynamic)
CREATE TABLE IF NOT EXISTS user_mastery (
    user_id TEXT,
    concept_id TEXT,
    mastery_score REAL DEFAULT 0.0, -- 0.0 to 1.0
    last_code TEXT, -- Store the user's last code submission
    last_practiced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, concept_id),
    FOREIGN KEY(concept_id) REFERENCES concepts(id)
);

CREATE TABLE IF NOT EXISTS session_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    concept_id TEXT,
    success BOOLEAN,
    error_code TEXT, -- e.g., 'E0382' (Borrow Checker Error)
    attempts INTEGER,
    duration_ms INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(concept_id) REFERENCES concepts(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_mastery_user ON user_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mastery_concept ON user_mastery(concept_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_user ON session_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_concept ON session_logs(concept_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_child ON dependencies(child_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_parent ON dependencies(parent_id);
