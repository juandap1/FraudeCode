import { Compiler } from "./src/compiler";
import { getKnowledgeGraph } from "./src/db/knowledge-graph";
import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import {
  generateLesson,
  loadLesson,
  lessonExists,
  deleteLesson,
  resetAllLessons,
  getLatestLessonForConcept,
  getLessonsForLanguage,
  loadLessonById,
  generateNewConcepts,
  type GeneratedLesson,
  type UserContext, // Import UserContext
} from "./src/lesson-generator";
import {
  analyzeSubmission,
  type SubmissionAnalysis,
  type CompiledResult,
} from "./src/submission-analyzer";
import type { PluginContext, PluginInit } from "@/types/PluginContext";
import type { Command } from "@/types/CommandDefinition";

const DB_PATH = join(dirname(import.meta.path), "data", "learning.db");

const plugin: PluginInit = async (context: PluginContext): Promise<Command> => {
  const { Router, Agent, settings, log, ui } = context;
  const { updateOutput } = ui;

  const router = context.router;
  const kg = getKnowledgeGraph(DB_PATH);

  router.register("GET", "/learn/healthcheck", (req) => {
    return new Response("Learn plugin is healthy", {
      headers: { "Content-Type": "text/plain" },
    });
  });

  // Visualize knowledge graph as Mermaid diagram
  router.register("GET", "/visualize", (req) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || undefined;
    const language = url.searchParams.get("language") || "rust";
    const mermaid = kg.getMermaidGraph(userId, language);
    return new Response(mermaid, {
      headers: { "Content-Type": "text/plain" },
    });
  });

  // Get a specific lesson by lessonId
  router.register("GET", "/lesson/:lessonId", (req) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || undefined;
    const lessonId = req.params.lessonId!;

    if (!lessonId) {
      return new Response(JSON.stringify({ error: "lessonId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lesson = loadLessonById(lessonId);

    if (!lesson) {
      return new Response(JSON.stringify({ error: "Lesson not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let lastCode = null;
    if (userId) {
      const userMasteries = kg.getUserMastery(userId);
      const mastery = userMasteries.find(
        (m) => m.concept_id === lesson.conceptId,
      );
      lastCode = mastery?.last_code || null;
    }

    return new Response(JSON.stringify({ lesson, lastCode }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  // Get all concepts
  router.register("GET", "/concepts", (req) => {
    const concepts = kg.getAllConcepts();
    return new Response(JSON.stringify(concepts), {
      headers: { "Content-Type": "application/json" },
    });
  });

  // Get all existing lessons for a specific language
  router.register("GET", "/lessons/:language", (req) => {
    const url = new URL(req.url);
    const language = (req.params.language || "").toLowerCase();
    const userId = url.searchParams.get("userId") || undefined;

    if (!language) {
      return new Response(
        JSON.stringify({ error: "Language parameter is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const lessons = getLessonsForLanguage(language);

    // If userId provided, enrich lessons with mastery data
    let enrichedLessons = lessons;
    if (userId) {
      const userMastery = kg.getUserMastery(userId);
      const masteryMap = new Map(
        userMastery.map((m) => [m.concept_id, m.mastery_score]),
      );

      enrichedLessons = lessons.map((lesson) => ({
        ...lesson,
        mastery: masteryMap.get(lesson.conceptId) ?? 0,
        completed: (masteryMap.get(lesson.conceptId) ?? 0) >= 0.8,
      }));
    }

    // 1. Clean up lessons: remove markdown and verificationTask for the list view
    const leanLessons = enrichedLessons.map((l: any) => {
      const { markdown, verificationTask, ...rest } = l;
      return rest;
    });

    // 2. Prepend Introduction if available
    let intro: any = null;

    const introPath = join(
      dirname(import.meta.path),
      "assets",
      "introduction",
      `${language.toUpperCase()}_INSTRUCTION.md`,
    );

    if (existsSync(introPath)) {
      try {
        const introMarkdown = readFileSync(introPath, "utf-8");
        intro = {
          lessonId: `${language}_intro`,
          title: `Introduction to ${language.charAt(0).toUpperCase() + language.slice(1)}`,
          markdown: introMarkdown,
        };
      } catch (e) {
        log(`Failed to read intro for ${language}: ${e}`);
      }
    }

    const completedCount = userId
      ? enrichedLessons.filter((l: any) => l.completed).length
      : undefined;

    return new Response(
      JSON.stringify({
        language,
        intro,
        count: leanLessons.length,
        completedCount,
        lessons: leanLessons,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  router.register("POST", "/compile", async (req) => {
    try {
      const body = (await req.json()) as {
        language?: string;
        code?: string;
        inputs?: string;
      };
      const { language, code, inputs } = body;

      if (!language || !code) {
        return new Response(
          JSON.stringify({ error: "Language and code are required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      let compiler: Compiler;

      if (language.toLowerCase() === "rust") {
        // Use wasm32-wasip1 if wasm32-wasi is not supported by the toolchain
        const target = "wasm32-wasip1";
        compiler = new Compiler(language, code, {
          tool: "cargo",
          args: ["build", "--target", target],
          inputs,
        });
      } else if (
        language.toLowerCase() === "python" ||
        language.toLowerCase() === "python3"
      ) {
        compiler = new Compiler("python", code, { inputs });
      } else if (
        language.toLowerCase() === "javascript" ||
        language.toLowerCase() === "js"
      ) {
        compiler = new Compiler("javascript", code, { inputs });
      } else if (
        language.toLowerCase() === "typescript" ||
        language.toLowerCase() === "ts"
      ) {
        compiler = new Compiler("typescript", code, { inputs });
      } else {
        return new Response(
          JSON.stringify({ error: `Unsupported language: ${language}` }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const output = await compiler.execute();

      return new Response(JSON.stringify(output), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // WebSocket Interactive Compilation
  router.registerWebSocket("/compile/ws", {
    message: async (ws, message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === "init") {
          const { language, code } = data;
          if (!language || !code) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Missing language or code",
              }),
            );
            return;
          }

          const compiler = new Compiler(language, code);

          // Start interactive session
          try {
            const session = await compiler.executeInteractive(
              (stdout) =>
                ws.send(JSON.stringify({ type: "stdout", data: stdout })),
              (stderr) =>
                ws.send(JSON.stringify({ type: "stderr", data: stderr })),
            );

            // Store session in WS data
            ws.data = { ...ws.data, session };

            // Wait for exit
            session.exit.then((code) => {
              ws.send(JSON.stringify({ type: "exit", code }));
              ws.close();
            });
          } catch (e: any) {
            ws.send(JSON.stringify({ type: "error", error: e.message }));
            ws.close();
          }
        } else if (data.type === "stdin") {
          if (ws.data?.session?.write) {
            ws.data.session.write(data.data);
          }
        } else if (data.type === "kill") {
          if (ws.data?.session?.kill) {
            ws.data.session.kill();
          }
        }
      } catch (e) {
        log(`WS Error: ${e}`);
      }
    },
    close: (ws) => {
      if (ws.data?.session?.kill) {
        ws.data.session.kill();
      }
    },
  });

  // Get user progress
  router.register("GET", "/progress/:userId", (req) => {
    const userId = req.params.userId || "default_user";
    const progress = kg.getUserProgress(userId);
    return new Response(JSON.stringify(progress), {
      headers: { "Content-Type": "application/json" },
    });
  });

  // ==========================================================================
  // CHATBOT ENDPOINT
  // ==========================================================================

  router.register("POST", "/ask", async (req) => {
    try {
      const body = (await req.json()) as {
        userId: string;
        lessonId: string;
        question: string;
        code: string;
        lastOutput?: string;
      };
      const { userId, lessonId, question, code, lastOutput } = body;

      if (!userId || !lessonId || !question) {
        return new Response(
          JSON.stringify({
            error: "userId, lessonId, and question are required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Load exact lesson context
      const lesson = loadLessonById(lessonId);

      if (!lesson) {
        return new Response(JSON.stringify({ error: "Lesson not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const concept = kg.getConcept(lesson.conceptId);

      if (!concept) {
        return new Response(JSON.stringify({ error: "Concept not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Construct optimized prompt
      const systemPrompt = `You are a helpful programming tutor assistant. Your goal is to help the user understand the concept and complete the task without giving the direct solution code.
Guide them with hints, explanations, and small examples. Be concise and encouraging.`;

      let userPrompt = `User Question: "${question}"\n\n`;

      userPrompt += `Context:\n`;
      userPrompt += `- Concept: ${concept.label}\n`;

      if (lesson) {
        userPrompt += `- Task: ${lesson.verificationTask.description}\n`;
        userPrompt += `- Expected Output: ${lesson.verificationTask.expectedOutput}\n`;
      }

      userPrompt += `\nUser Code:\n\`\`\`rust\n${code}\n\`\`\`\n`;

      if (lastOutput) {
        userPrompt += `\nLast Compilation/Run Output:\n${lastOutput}\n`;
      }

      // Use Agent
      const model = settings.get("primaryModel");
      const agent = new Agent({
        model,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 1000,
        maxSteps: 1, // Single turn
        useIsolatedContext: true,
      });

      const response = await agent.chat(userPrompt);

      return new Response(JSON.stringify({ answer: response.text }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      log(`❌ Error in /ask: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // ==========================================================================
  // SUBMISSION ENDPOINT
  // ==========================================================================

  router.register("POST", "/submit", async (req) => {
    try {
      const body = (await req.json()) as {
        userId: string;
        conceptId: string;
        code: string;
        compiledResult: CompiledResult;
        lessonNumber?: number; // Optional: specify which lesson version
        timeSpent?: number;
      };

      const {
        userId,
        conceptId,
        code,
        compiledResult,
        lessonNumber,
        timeSpent,
      } = body;

      // Validate required fields
      if (!userId || !conceptId || !code || !compiledResult) {
        return new Response(
          JSON.stringify({
            error: "userId, conceptId, code, and compiledResult are required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Determine which lesson number to load
      let lesson: GeneratedLesson | null = null;
      let targetLessonNumber = lessonNumber;

      if (targetLessonNumber) {
        if (lessonExists(conceptId, targetLessonNumber)) {
          lesson = loadLesson(conceptId, targetLessonNumber);
        }
      } else {
        // Fallback to latest
        lesson = getLatestLessonForConcept(conceptId);
        targetLessonNumber = lesson?.lessonNumber;
      }

      if (!lesson) {
        return new Response(
          JSON.stringify({
            error: `Lesson not found for concept: ${conceptId}. Generate it first via GET /lesson/${conceptId}`,
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get current attempt count (computed from stored data)
      const previousAttempts = kg.getAttemptCount(userId, conceptId);
      const attemptNumber = previousAttempts + 1;

      // Determine language from concept or request
      const concept = kg.getConcept(conceptId);
      if (!concept) {
        return new Response(JSON.stringify({ error: "Concept not found" }), {
          status: 404,
        });
      }

      // Analyze the submission with LLM (prioritizes concept mastery over task correctness)
      const analysis = await analyzeSubmission(
        code,
        compiledResult,
        lesson,
        concept,
      );

      // Determine success based on analysis
      const success = analysis.passed && compiledResult.exitCode === 0;

      // Extract error code from stderr if present
      let errorCode: string | null = null;
      const stderr = compiledResult.terminal
        .filter((t) => t.type === "stderr")
        .map((t) => t.data)
        .join("");

      if (stderr) {
        const errorMatch = stderr.match(/error\[(E\d+)\]/);
        if (errorMatch) {
          errorCode = errorMatch[1] ?? null;
        }
      }

      // Process result and update mastery
      const masteryUpdate = kg.processLessonResult(userId, conceptId, {
        success,
        errorCode,
        attempts: attemptNumber,
        duration: timeSpent,
        code, // Store the code
      });

      log(
        `📝 Submission: user=${userId} concept=${conceptId} lesson=${targetLessonNumber} attempt=${attemptNumber} passed=${success}${analysis.overrideApplied ? " (LLM override applied)" : ""}`,
      );

      return new Response(
        JSON.stringify({
          passed: success,
          attemptNumber,
          lessonNumber: targetLessonNumber,
          compileResult: {
            exitCode: compiledResult.exitCode,
            terminal: compiledResult.terminal,
          },
          analysis,
          masteryUpdate,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e: any) {
      log(`❌ Submission error: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // ==========================================================================
  // LESSON GENERATION ENDPOINTS
  // ==========================================================================

  // Get the next lesson content (Generate if needed)
  router.register("POST", "/lesson/next", async (req) => {
    try {
      let body: any = {};
      try {
        body = (await req.json()) as {
          userId?: string;
          currentConceptId?: string;
        };
      } catch (e) {
        // Handle cases where no body is provided or it is not valid JSON
      }

      const userId = body.userId || "default_user";
      const currentConceptId = body.currentConceptId;
      const language = (body.language || "rust").toLowerCase();

      let nextConcept = kg.getNextLesson(userId, language);

      // If no existing lessons, try to generate new ones
      if (!nextConcept) {
        log("Frontier empty, attempting to generate new concepts...");
        try {
          const masteredConcepts = kg
            .getMasteredConcepts(userId)
            .filter((c) => c.language === language);
          const allConcepts = kg.getAllConcepts(language);

          const newConcepts = await generateNewConcepts(
            masteredConcepts,
            allConcepts,
            language,
          );

          if (newConcepts.length > 0) {
            log(
              `Adding ${newConcepts.length} new generated concepts to KG: ${newConcepts.map((c) => c.id).join(", ")}`,
            );
            for (const c of newConcepts) {
              kg.addConcept(c);
            }

            // Retry getting the next lesson
            nextConcept = kg.getNextLesson(userId, language);
          }
        } catch (genError: any) {
          log(`Failed to generate new concepts: ${genError.message}`);
        }
      }

      if (!nextConcept) {
        return new Response(
          JSON.stringify({
            message: "No available lessons! (Or you mastered everything!)",
            completed: true,
          }),
          {
            status: 200, // 200 OK, but with message
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const isRetry = !!currentConceptId && nextConcept.id === currentConceptId;

      // Check if we already have a generated lesson for this concept
      // ONLY check cache if it's NOT a retry.
      let lesson: GeneratedLesson | null = null;
      if (!isRetry) {
        lesson = getLatestLessonForConcept(nextConcept.id);
      }

      // If not found (or retry), generate one
      if (!lesson) {
        const recentErrors = kg.getRecentErrors(userId);
        lesson = await generateLesson(nextConcept, undefined, {
          recentErrors,
          masteredConcepts: kg.getConceptPrerequisites(nextConcept.id),
        });
      }

      return new Response(
        JSON.stringify({
          lesson,
          cached: !isRetry && !!getLatestLessonForConcept(nextConcept.id),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e: any) {
      log(`Error getting next lesson: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // Force regenerate a lesson (useful for updating content)
  router.register("POST", "/lesson/generate", async (req) => {
    try {
      const body = (await req.json()) as {
        conceptId: string;
        model?: string;
        force?: boolean;
        userId?: string;
        lessonNumber?: number;
      };

      const {
        conceptId,
        model,
        force = false,
        userId = "default_user",
        lessonNumber,
      } = body;

      if (!conceptId) {
        return new Response(
          JSON.stringify({ error: "conceptId is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const concept = kg.getConcept(conceptId);
      if (!concept) {
        return new Response(
          JSON.stringify({ error: `Concept not found: ${conceptId}` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // If force is true AND lessonNumber is provided, we delete that specific one.
      // If force is true and NO lessonNumber, we create a NEW GLOBAL lesson?
      // Or do we regenerate the LATEST global lesson for this concept?
      // To allow "Regenerate Content" for the current view, we should look up the latest and delete it if force=true.

      let targetLessonNumber = lessonNumber;

      if (!targetLessonNumber && force) {
        // Find the latest lesson to overwrite
        const existing = getLatestLessonForConcept(conceptId);
        if (existing) {
          targetLessonNumber = existing.lessonNumber;
        }
      }

      if (force && targetLessonNumber) {
        if (lessonExists(conceptId, targetLessonNumber)) {
          deleteLesson(conceptId, targetLessonNumber);
        }
      }

      // If targetLessonNumber is still undefined, generateLesson will pick the next global number.
      const recentErrors = kg.getRecentErrors(userId);
      const lesson = await generateLesson(
        concept,
        model,
        {
          recentErrors,
          masteredConcepts: kg.getConceptPrerequisites(concept.id),
        },
        targetLessonNumber,
      );

      return new Response(JSON.stringify({ lesson, regenerated: force }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      log(`Error generating lesson: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // Reset everything for learning
  router.register("POST", "/reset", async (req) => {
    try {
      log("🔄 Resetting learning system...");

      // 1. Reset database (mastery, logs, etc.)
      kg.resetDatabase();

      // 2. Clear all cached lessons
      resetAllLessons();

      return new Response(
        JSON.stringify({
          message:
            "Learning system reset successfully. Database reinitialized and all cached lessons cleared.",
          success: true,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e: any) {
      log(`❌ Error resetting learning system: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // Reset user mastery only (keep lessons)
  router.register("POST", "/reset/mastery", async (req) => {
    try {
      let userId: string | undefined = undefined;
      try {
        const body = (await req.json()) as { userId?: string };
        userId = body.userId;
      } catch {
        // No body provided, will reset all users if intended or just treat as global reset if acceptable
        // checking query params just in case
        const url = new URL(req.url);
        userId = url.searchParams.get("userId") || undefined;
      }

      kg.resetUserProgress(userId);

      return new Response(
        JSON.stringify({
          message: userId
            ? `Progress reset for user: ${userId}`
            : "All user progress has been reset.",
          success: true,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e: any) {
      log(`❌ Error resetting mastery: ${e.message}`);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  updateOutput("log", "Learning platform loaded. Endpoints registered.");

  return {
    name: "learn",
    description: "Code Learning Platform",
    usage: "/learn",
    action: async () => {
      updateOutput(
        "log",
        "Learning platform is active. Endpoints are registered.",
      );
    },
  };
};

export default plugin;
