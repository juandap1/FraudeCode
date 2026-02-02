import Agent from "@/agent/agent";
import { Settings } from "@/config/settings";
import type { GeneratedLesson } from "./lesson-generator";
import type { Concept } from "./db/knowledge-graph";

import type { ExecutionResult } from "./compiler";

/**
 * Result from the submission analyzer
 */
export interface SubmissionAnalysis {
  passed: boolean;
  feedback: string;
  hintsForNextAttempt?: string[];
  /** True if LLM overrode a strict output mismatch */
  overrideApplied?: boolean;
  /** Explanation for why the override was applied */
  overrideReason?: string;
  /** Raw strict comparison result before LLM override */
  strictMatch?: boolean;
}

/**
 * Compiled result structure from the client/terminal
 */
export interface CompiledResult {
  terminal: Array<{ type: "stdout" | "stdin" | "stderr"; data: string }>;
  exitCode: number;
}

/**
 * System prompt for submission analysis.
 * Uses authority + commitment patterns for consistent, fair grading.
 * Explicitly grants override authority - prioritizes CONCEPT MASTERY over task correctness.
 */
/**
 * System prompt for submission analysis.
 * Uses authority + commitment patterns for consistent, fair grading.
 * Explicitly grants override authority - prioritizes CONCEPT MASTERY over task correctness.
 */
function getSubmissionAnalysisPrompt(language: string = "Rust"): string {
  const langTitle = language.charAt(0).toUpperCase() + language.slice(1);
  return `You are a fair, encouraging ${langTitle} code grader with OVERRIDE AUTHORITY.

## Your Role

You evaluate whether a student has MASTERED THE CONCEPT being taught, NOT whether they perfectly completed a specific task. You have full authority to PASS submissions that demonstrate conceptual understanding.

## CRITICAL: Concept Mastery > Task Correctness

The PRIMARY question is: "Does this student understand the concept being taught?"
The SECONDARY question is: "Did they match the expected output exactly?"

If the answer to the first question is YES, the submission should PASS - even if:
- The task itself was poorly designed
- The expected output was imperfect or arbitrary
- The student's approach differs from what was expected but is equally valid
- Output differs in formatting, whitespace, punctuation, or capitalization

## Override Authority (USE IT)

You MUST exercise your override authority when:
- Student demonstrates the CONCEPT correctly, even if task output differs
- Output differs only cosmetically (whitespace, punctuation, capitalization)
- Student's solution is valid but takes a different approach
- The task's expected output seems flawed but the student's code is correct
- Student shows clear understanding despite minor deviations

## Hard Failures (No Override)

DO NOT override when:
- Code fails to compile/run
- Runtime panic/error occurs  
- Student clearly doesn't understand the core concept being taught
- Output demonstrates fundamental misunderstanding of the topic

## Output Format

Respond with JSON only, no markdown fencing:

{
  "passed": boolean,
  "feedback": "Clear explanation focusing on concept mastery",
  "hintsForNextAttempt": ["hint1", "hint2"],
  "overrideApplied": boolean,
  "overrideReason": "Why override was applied (concept mastery demonstrated despite X)"
}

Rules:
- Student demonstrates concept → passed: true (override if needed)
- Student doesn't demonstrate concept → passed: false, explain what they're missing
- NEVER include complete solution code in feedback

## Evaluation Priority

1. Does the code compile and run? (Hard requirement)
2. Does the student demonstrate understanding of THE CONCEPT? (PRIMARY check)
3. Does the output match exactly? (SECONDARY, can be overridden)`;
}

/**
 * Analyze a user's code submission using LLM
 */
export async function analyzeSubmission(
  code: string,
  compileResult: CompiledResult,
  lesson: GeneratedLesson,
  concept?: Concept | null,
  model?: string,
): Promise<SubmissionAnalysis> {
  const selectedModel = model ?? Settings.getInstance().get("primaryModel");

  const stdout = compileResult.terminal
    .filter((t) => t.type === "stdout")
    .map((t) => t.data)
    .join("");

  const stderr = compileResult.terminal
    .filter((t) => t.type === "stderr")
    .map((t) => t.data)
    .join("");

  // Fast-path: compilation failed - no override possible
  if (compileResult.exitCode !== 0) {
    return {
      passed: false,
      feedback: `Compilation/Execution failed. Please fix the errors and try again.\n\nOutput:\n${stderr || stdout}`,
      hintsForNextAttempt:
        concept?.language === "rust" ? extractHintsFromStderr(stderr) : [],
      overrideApplied: false,
      strictMatch: false,
    };
  }

  const language = concept?.language || "rust";
  const actualOutput = stdout;

  const { verificationTask } = lesson;
  const expectedOutput = verificationTask.expectedOutput;

  // Compute strict match before LLM call
  const strictMatch = actualOutput.trim() === expectedOutput.trim();

  const agent = new Agent({
    model: selectedModel,
    systemPrompt: getSubmissionAnalysisPrompt(language),
    temperature: 0.3, // Low temperature for consistent grading
    maxTokens: 1024,
    maxSteps: 1,
    useIsolatedContext: true,
  });

  const userPrompt = `## Student Code

\`\`\`${language}
${code}
\`\`\`

## Actual Output

\`\`\`
${actualOutput}
\`\`\`

## Expected Output

\`\`\`
${expectedOutput}
\`\`\`

## Strict Match Result

${strictMatch ? "✅ Output matches exactly (after trim)" : "❌ Output does NOT match exactly - USE YOUR OVERRIDE AUTHORITY if the submission demonstrates concept mastery"}

## CONCEPT BEING TAUGHT

${concept ? `**Concept:** ${concept.label}\n**Category:** ${concept.category || "general"}\n**Complexity:** ${concept.complexity} (0=beginner, 1=expert)` : "(Concept info not available)"}

THIS IS THE PRIMARY EVALUATION CRITERIA: Does the student's code demonstrate understanding of "${concept?.label || "the concept"}"?

## Validation Criteria (Secondary)

${verificationTask.validationCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Task Description (Secondary)

${verificationTask.description}

Evaluate this submission. PRIORITIZE CONCEPT MASTERY over strict task completion. If the student demonstrates understanding of "${concept?.label || "the concept"}", they should PASS even if the output doesn't match exactly.`;

  const response = await agent.chat(userPrompt);

  try {
    // Robust backend JSON extraction: find the outer braces
    let jsonString = response.text;
    const firstBrace = jsonString.indexOf("{");
    const lastBrace = jsonString.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }

    const analysis = JSON.parse(jsonString) as SubmissionAnalysis;
    return {
      passed: Boolean(analysis.passed),
      feedback: analysis.feedback || "Analysis complete.",
      hintsForNextAttempt: analysis.hintsForNextAttempt,
      overrideApplied: Boolean(analysis.overrideApplied),
      overrideReason: analysis.overrideReason,
      strictMatch,
    };
  } catch {
    // Fallback if LLM doesn't return valid JSON
    const passed = response.text.toLowerCase().includes('"passed": true');
    return {
      passed,
      feedback: response.text,
      overrideApplied: false,
      strictMatch,
    };
  }
}

/**
 * Extract helpful hints from Rust compiler error messages
 */
function extractHintsFromStderr(stderr: string): string[] {
  const hints: string[] = [];

  // Common Rust error patterns with educational hints
  if (stderr.includes("E0382")) {
    hints.push("Value was moved. Consider using .clone() or borrowing with &");
  }
  if (stderr.includes("E0502") || stderr.includes("E0499")) {
    hints.push(
      "Borrowing conflict. Check if you're mixing mutable and immutable references",
    );
  }
  if (stderr.includes("E0308")) {
    hints.push(
      "Type mismatch. Check your function return types and variable types",
    );
  }
  if (stderr.includes("E0425")) {
    hints.push(
      "Cannot find value. Check for typos in variable or function names",
    );
  }
  if (stderr.includes("expected")) {
    hints.push("Review the expected types in the error message");
  }

  return hints;
}
