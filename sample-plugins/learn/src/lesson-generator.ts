import Agent from "@/agent/agent";
import type { Concept, RawGraphNode } from "./db/knowledge-graph";
import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { Settings } from "@/config/settings";

const LESSONS_DIR = join(dirname(import.meta.path), "..", "data", "lessons");

// Ensure lessons directory exists
if (!existsSync(LESSONS_DIR)) {
  mkdirSync(LESSONS_DIR, { recursive: true });
}

/**
 * Structured lesson format returned by the agent
 */
export interface GeneratedLesson {
  lessonId: string; // generated from conceptId + lessonNumber
  lessonNumber: number;
  conceptId: string;
  title: string;
  markdown: string;
  verificationTask: {
    description: string;
    expectedOutput: string;
    validationCriteria: string[];
    starterFiles: Array<{
      path: string;
      content: string;
    }>;
  };
  generatedAt: string;
}

export interface UserContext {
  recentErrors?: string[];
  masteryLevel?: number; // 0-1
  masteredConcepts?: Concept[]; // Concepts user has already learned
}

/**
 * System prompt for the lesson generation agent.
 */
function getLessonSystemPrompt(language: string = "Rust"): string {
  const langTitle = language.charAt(0).toUpperCase() + language.slice(1);
  const comment = {
    rust: "//",
    python: "#",
    javascript: "//",
    typescript: "//",
  };

  return `You are an expert ${langTitle} tutor. Your goal is to TEACH concepts through discovery, not to provide answers.

## Critical Rules
1. **NO SOLUTIONS**: Starter code must be scaffolding only (EXAMPLES OF ALLOWED CODE: main function, comments, pass [python], todo!() [rust]).
2. NOT EVEN LOGGING IS ALLOWED IN THE STARTER CODE.
3. **GUIDANCE OVER ANSWERS**: Explain the *why* and *how*, let the user implement the *what*.
4. **COMPILABLE**: Starter files must compile/run (use placeholders if needed).
5. **EXACT FORMAT**: You must strictly follow the output format below.
6. **CONCEPT SCOPE**: You MUST only use concepts from the "Already Learned" list + the current lesson's concept.
   - If you need a technique not yet taught: (a) include it in a demonstration example, and (b) explain it briefly inline.
   - NEVER assume prior knowledge of concepts not in the "Already Learned" list.
   - This is CRITICAL for proper pedagogical sequencing.

## Reference Example (Desired Structure)
---
# Console Output

## Learning Objectives
- Use the standard output function
- Understand string literals

## Concept Explanation
In ${langTitle}, we use \`...\` to print text.

## Code Examples
### Example 1: Printing
\`\`\`${language.toLowerCase()}
${comment} This prints a message
print("Hello World")
\`\`\`

## Verification Task
**YOUR MISSION:** Update the starter code to print your name.

**Starter Files:** (example is in rust, adjust for the language)
**file: main.rs**
\`\`\`rust
    todo!("User implements this")
\`\`\`

**Expected Output:**
\`\`\`
[expected output]
\`\`\`
---

## Output Format
Response must be a single markdown block with this structure:

---
# [Concept Title]

## Learning Objectives
- [Objective 1]
- [Objective 2]

## Concept Explanation
[Clear, concise explanation. Key terms, relevance, common pitfalls.]

## Code Examples

### Example 1: Basic
\`\`\`${language.toLowerCase()}
${comment} Simple example
\`\`\`

### Example 2: Applied
\`\`\`${language.toLowerCase()}
${comment} Real-world scenario
\`\`\`

## Verification Task

**YOUR MISSION:**
[Actionable task description]

**Starter Files:** (EXAMPLE IS IN RUST, ADJUST FOR THE LANGUAGE)
For each file (use exact format):

**file: [path]**
\`\`\`rust
fn example() {
    todo!("User implements this")
}
\`\`\`

**Hints:**
- [Hint 1]
- [Hint 2]

**Expected Output:**
\`\`\`
[Expected console output]
\`\`\`

**Success Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Common Mistakes
1. **[Mistake]**: [Fix/Prevention]

## Summary
[Key takeaways]
---

DOUBLE CHECK TO MAKE SURE ALL CRITICAL RULES ARE FOLLOWED. BREAKING ANY CRITICAL RULE WILL RESULT IN FAILURE
`;
}
/**
 * System prompt for generating new concepts (Knowledge Graph expansion)
 */
function getConceptGenerationSystemPrompt(language: string = "Rust"): string {
  const langTitle = language.charAt(0).toUpperCase() + language.slice(1);
  return `You are a curriculum designer for a ${langTitle} programming course.
Your goal is to generate the NEXT logical concepts for a student to learn, expanding the knowledge graph.

## Rules
1. **Dependent**: New concepts must build logically on what the user has ALREADY mastered.
2. **Granular**: Break topics down into small, learnable units (atomic concepts).
3. **Progressive**: If the user is a beginner, start with basics. (e.g. "Hello World", variables, etc.)
4. **Novel**: Do NOT generate concepts that already exist in the "All Known Concepts" list.
5. **JSON Format**: Output MUST be a valid JSON array of concept objects.

## Concept Object Structure
{
  "id": "unique.id.string", // e.g., "${language.toLowerCase()}.basics.variables"
  "label": "Human Readable Title",
  "category": "category_name", // e.g., "basics", "memory", "cli"
  "language": "${language.toLowerCase()}",
  "complexity": 0.0-1.0, // relative to existing concepts
  "dependencies": ["parent.concept.id"], // IDs of concepts that are prerequisites
  "project_context": "Optional short description of how this fits into a project"
}
`;
}

/**
 * Get the file path for a lesson with a sequence number
 * Format: 001_concept_id.json
 */
function getLessonPath(conceptId: string, lessonNumber: number): string {
  const safeId = conceptId.replace(/\./g, "_");
  // Pad number with zeros for sorting, e.g., 001, 002
  const paddedNumber = lessonNumber.toString().padStart(3, "0");
  const filename = `${paddedNumber}_${safeId}.json`;
  return join(LESSONS_DIR, filename);
}

/**
 * Get the next available lesson number for a specific language
 * by counting existing lessons for that language.
 */
export function getNextLessonNumber(language: string): number {
  const lessons = getLessonsForLanguage(language);
  if (lessons.length === 0) return 1;

  // Find the max lesson number among existing lessons for this language
  const maxNum = Math.max(...lessons.map((l) => l.lessonNumber), 0);
  return maxNum + 1;
}

/**
 * Find the latest lesson file for a specific concept
 */
export function getLatestLessonForConcept(
  conceptId: string,
): GeneratedLesson | null {
  if (!existsSync(LESSONS_DIR)) return null;

  const safeId = conceptId.replace(/\./g, "_");
  const files = require("fs").readdirSync(LESSONS_DIR);

  // Filter for files ending in _{safeId}.json
  // And Sort by the leading number descending
  const matchingFiles = files
    .filter((f: string) => f.includes(`_${safeId}.json`) && /^\d+_/.test(f))
    .sort((a: string, b: string) => {
      const partA = a.split("_")[0];
      const partB = b.split("_")[0];
      const numA = parseInt(partA || "0", 10);
      const numB = parseInt(partB || "0", 10);
      return numB - numA; // Descending
    });

  if (matchingFiles.length === 0) return null;

  const content = readFileSync(join(LESSONS_DIR, matchingFiles[0]), "utf-8");
  return JSON.parse(content);
}

/**
 * Save a lesson to disk
 */
function saveLesson(lesson: GeneratedLesson): void {
  const path = getLessonPath(lesson.conceptId, lesson.lessonNumber);
  writeFileSync(path, JSON.stringify(lesson, null, 2));
}

/**
 * Load a lesson from specific global number
 */
export function loadLesson(
  conceptId: string,
  lessonNumber: number,
): GeneratedLesson {
  const path = getLessonPath(conceptId, lessonNumber);
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content);
}

/**
 * Check if a specific lesson file exists
 */
export function lessonExists(conceptId: string, lessonNumber: number): boolean {
  return existsSync(getLessonPath(conceptId, lessonNumber));
}

/**
 * Load a lesson by its unique lessonId (e.g., "001_rust.basics")
 */
export function loadLessonById(lessonId: string): GeneratedLesson | null {
  // Filename strategy: dots in ID become underscores
  const safeName = lessonId.replace(/\./g, "_");
  const path = join(LESSONS_DIR, `${safeName}.json`);

  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Delete a specific lesson file
 */
export function deleteLesson(conceptId: string, lessonNumber: number): boolean {
  const path = getLessonPath(conceptId, lessonNumber);
  if (existsSync(path)) {
    const fs = require("fs");
    fs.unlinkSync(path);
    return true;
  }
  return false;
}

/**
 * Reset all cached lessons
 */
export function resetAllLessons(): void {
  const fs = require("fs");
  if (existsSync(LESSONS_DIR)) {
    const files = fs.readdirSync(LESSONS_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        fs.unlinkSync(join(LESSONS_DIR, file));
      }
    }
  }
}

/**
 * Get all lessons for a specific language
 * Lessons are identified by their conceptId prefix (e.g., "rust.basics.variables" -> language is "rust")
 * Returns lessons sorted by lesson number ascending
 */
export function getLessonsForLanguage(language: string): GeneratedLesson[] {
  if (!existsSync(LESSONS_DIR)) return [];

  const fs = require("fs");
  const files = fs.readdirSync(LESSONS_DIR);
  const lessons: GeneratedLesson[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = readFileSync(join(LESSONS_DIR, file), "utf-8");
      const lesson: GeneratedLesson = JSON.parse(content);

      // Check if the conceptId starts with the language
      // e.g., "rust.basics.variables" starts with "rust"
      if (lesson.conceptId.toLowerCase().startsWith(language.toLowerCase())) {
        lessons.push(lesson);
      }
    } catch {
      // Skip invalid JSON files
      continue;
    }
  }

  // Sort by lesson number ascending
  return lessons.sort((a, b) => a.lessonNumber - b.lessonNumber);
}

/**
 * Generate a lesson for a specific concept using the Agent
 */
export async function generateLesson(
  concept: Concept,
  model?: string,
  context?: UserContext,
  forcedLessonNumber?: number,
): Promise<GeneratedLesson> {
  // Use provided model, or fall back to user's primary model from settings
  const selectedModel = model ?? Settings.getInstance().get("primaryModel");
  const lessonNumber =
    forcedLessonNumber ?? getNextLessonNumber(concept.language || "rust");

  const agent = new Agent({
    model: selectedModel,
    systemPrompt: getLessonSystemPrompt(concept.language || "Rust"),
    temperature: 0.7,
    maxTokens: 4096,
    maxSteps: 1,
    useIsolatedContext: true,
  });

  const userPrompt = buildLessonPrompt(concept, context, lessonNumber);
  const response = await agent.chat(userPrompt);

  const lesson: GeneratedLesson = {
    lessonId: `${lessonNumber.toString().padStart(3, "0")}_${concept.id}`,
    lessonNumber,
    conceptId: concept.id,
    title: concept.label,
    markdown: response.text,
    verificationTask: extractVerificationTask(response.text),
    generatedAt: new Date().toISOString(),
  };

  // Save to disk
  saveLesson(lesson);

  return lesson;
}

/**
 * Generate NEW concepts to extend the knowledge graph
 */
export async function generateNewConcepts(
  masteredConcepts: Concept[],
  allConcepts: Concept[],
  language: string = "rust",
): Promise<RawGraphNode[]> {
  const model = Settings.getInstance().get("primaryModel");

  const agent = new Agent({
    model,
    systemPrompt: getConceptGenerationSystemPrompt(language),
    temperature: 0.8, // Slightly higher creativity for curriculum design
    maxTokens: 2000,
    maxSteps: 1,
    useIsolatedContext: true,
  });

  let userPrompt = "The user has completed all available lessons.\n";

  if (masteredConcepts.length > 0) {
    userPrompt += "## Already Mastered Concepts (Dependencies available):\n";
    for (const c of masteredConcepts) {
      userPrompt += `- ${c.label} (ID: ${c.id}, Complexity: ${c.complexity})\n`;
    }
  } else {
    userPrompt += "## User Status\n";
    userPrompt +=
      "The user has NO prior knowledge. Assume they are a complete beginner.\n";
  }

  userPrompt += "\n## Existing Concepts to Avoid (Already in Graph):\n";
  for (const c of allConcepts) {
    userPrompt += `- ${c.id}\n`;
  }

  userPrompt +=
    "\n\nBased on this, generate 2-3 NEW concepts for the user to learn next.";
  userPrompt += "\nReturn ONLY the JSON array.";

  try {
    const response = await agent.chat(userPrompt);
    // basic cleanup to extract JSON if wrapped in backticks
    let jsonStr = response.text.trim();
    const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(json)?/, "").replace(/```$/, "");
    }

    try {
      const newConcepts = JSON.parse(jsonStr) as RawGraphNode[];
      // Ensure language is set for all new concepts
      return newConcepts.map((c) => ({
        ...c,
        language: c.language || language,
      }));
    } catch (parseError) {
      console.error("Failed to parse generated concepts JSON:", jsonStr);
      return [];
    }
  } catch (e: any) {
    console.error("Failed to generate new concepts:", e.message);
    return [];
  }
}

/**
 * Build the user prompt for a specific concept
 */
function buildLessonPrompt(
  concept: Concept,
  context?: UserContext,
  lessonNumber: number = 1,
): string {
  const langTitle =
    (concept.language || "Rust").charAt(0).toUpperCase() +
    (concept.language || "Rust").slice(1);
  const parts: string[] = [
    `Create a lesson for the ${langTitle} concept: **${concept.label}** (ID: ${concept.id})`,
    "",
    `**Course Context:** This is **Lesson #${lessonNumber}** in the user's ${langTitle} learning journey.`,
    `**Concept Complexity:** ${concept.complexity} (0.0=beginner, 1.0=expert)`,
    `**Category:** ${concept.category || "general"}`,
  ];

  // Add the list of already-learned concepts (critical for proper scoping)
  parts.push("");
  parts.push("## Already Learned Concepts");
  if (context?.masteredConcepts && context.masteredConcepts.length > 0) {
    parts.push(
      "The user has ALREADY MASTERED these concepts. You may freely use them:",
    );
    for (const mastered of context.masteredConcepts) {
      parts.push(`- **${mastered.label}** (${mastered.id})`);
    }
  } else {
    parts.push(
      "This is the user's FIRST lesson. They have no prior knowledge.",
    );
    parts.push(
      "You must explain EVERYTHING from scratch, including basic syntax.",
    );
  }
  parts.push(
    `⚠️ CRITICAL: Do NOT use any ${langTitle} concepts NOT listed above without demonstrating and explaining them inline first.`,
  );

  // If the user has errors, this is a targeted remediation lesson
  if (context?.recentErrors && context.recentErrors.length > 0) {
    parts.push("");
    parts.push("## Adaptive Remediation");
    parts.push(
      `The user is struggling with these specific errors: ${context.recentErrors.join(", ")}.`,
    );
    parts.push(
      "You MUST focus the explanation and examples on resolving these misunderstandings.",
    );
    parts.push(
      "Provide a **fresh perspective** different from standard documentation.",
    );
  } else {
    // Standard progression
    parts.push("");
    parts.push(
      "The user is progressing through the course. Keep the tone encouraging and focused on mastery.",
    );
  }

  if (concept.metadata?.project_context) {
    parts.push("");
    parts.push(`**Project Context:** ${concept.metadata.project_context}`);
    parts.push(
      "Use this context to make the examples and verification task relevant.",
    );
  }

  parts.push("");
  parts.push(
    "Generate a complete lesson following the EXACT format specified in the system prompt.",
  );

  return parts.join("\n");
}

/**
 * Extract verification task data from generated markdown
 */
function extractVerificationTask(
  markdown: string,
): GeneratedLesson["verificationTask"] {
  // Extract task description
  const missionMatch = markdown.match(
    /\*\*YOUR MISSION:\*\*\s*\n([\s\S]*?)(?=\n\*\*)/i,
  );
  const description =
    missionMatch?.[1]?.trim() || "Complete the implementation";

  // Extract starter files
  const starterFiles: Array<{ path: string; content: string }> = [];
  const fileRegex = /\*\*file: ([\w\.\/-]+)\*\*\s*\n```\w*\n([\s\S]*?)\n```/gi;
  let fileMatch;
  while ((fileMatch = fileRegex.exec(markdown)) !== null) {
    if (fileMatch[1] && fileMatch[2]) {
      starterFiles.push({
        path: fileMatch[1],
        content: fileMatch[2].trim(),
      });
    }
  }

  // Extract expected output
  const outputMatch = markdown.match(
    /\*\*Expected Output:\*\*\s*\n```\s*\n([\s\S]*?)\n```/i,
  );
  const expectedOutput = outputMatch?.[1]?.trim() || "";

  // Extract success criteria
  const criteriaMatch = markdown.match(
    /\*\*Success Criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*Verification Command)/i,
  );
  const criteriaText = criteriaMatch?.[1] || "";
  const validationCriteria = criteriaText
    .split("\n")
    .filter((line) => line.includes("[ ]"))
    .map((line) => line.replace(/^-\s*\[\s*\]\s*/, "").trim());

  return {
    description,
    expectedOutput,
    validationCriteria:
      validationCriteria.length > 0
        ? validationCriteria
        : ["Code compiles successfully", "Expected output matches"],
    starterFiles,
  };
}
