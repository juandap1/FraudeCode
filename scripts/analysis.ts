import * as fs from "fs";
import path from "path";
import { QdrantCli } from "../src/services/qdrant";
import { Neo4jClient } from "../src/services/neo4j";
import type { GitRepo, Chunk } from "../src/types/analysis";
import { walkRepo } from "../src/utils/FileScanner";
import { analyzeCode } from "../src/core/analysis/CodeAnalyzer";

async function indexAllFiles(
  repo: GitRepo,
  client: QdrantCli,
  neo4jClient: Neo4jClient
) {
  await walkRepo(repo, async (filePath, absPath) => {
    if (!filePath.endsWith(".py")) return;

    // Create File Node
    await neo4jClient.addFileNode(filePath);

    const analysis = await analyzeCode(absPath, filePath);

    console.log(
      `Processing ${filePath}: ${analysis.definitions.length} defs, ${analysis.calls.length} calls`
    );

    // Add Definitions (Functions/Classes)
    for (const def of analysis.definitions) {
      if (def.type === "function") {
        await neo4jClient.addFunctionNode(
          def.name,
          filePath,
          def.startLine,
          def.parentName
        );
      } else {
        await neo4jClient.addClassNode(
          def.name,
          filePath,
          def.startLine,
          def.parentName
        );
      }
    }

    // Add Imports
    for (const imp of analysis.imports) {
      await neo4jClient.addImportRelationship(filePath, imp.module);
    }

    // Add Calls
    for (const call of analysis.calls) {
      const parts = call.functionName.split(".");
      let targetFunc = call.functionName;
      let possibleFiles: string[] = [];

      if (parts.length > 1) {
        const prefix = parts[0];
        const lastPart = parts[parts.length - 1];
        if (lastPart) targetFunc = lastPart;

        if (prefix) {
          const imp = analysis.imports.find(
            (i) => i.alias === prefix || i.module === prefix
          );
          if (imp) {
            const currentDir = path.dirname(absPath);
            const candidateStr = imp.module.replace(/\./g, "/");
            const candidateSibling = path.join(
              currentDir,
              candidateStr + ".py"
            );
            if (fs.existsSync(candidateSibling)) {
              possibleFiles.push(path.relative(repo.path, candidateSibling));
            } else {
              possibleFiles.push(imp.module);
            }
          }
        }
      }

      await neo4jClient.addCallRelationship(
        filePath,
        call.sourceContext,
        targetFunc,
        possibleFiles
      );
    }

    // Add Chunks to Qdrant
    let chunks = analysis.chunks;
    while (chunks.length > 0) {
      chunks = await addBatch(client, repo.name, chunks);
    }
  });
}

async function addBatch(
  qdrantCli: QdrantCli,
  collectionName: string,
  chunks: Chunk[],
  batchSize: number = 100
) {
  console.log("Adding batch to Qdrant");
  const batch = chunks.slice(0, batchSize);
  const points = await Promise.all(
    batch.map(async (chunk) => {
      const { id, document, ...metadata } = chunk;
      const denseVector = await qdrantCli.embed(document);
      const sparseVector = qdrantCli.getSparseVector(document);
      return {
        id,
        vector: {
          "arctic-dense": denseVector,
          "code-sparse": sparseVector,
        },
        payload: { ...metadata, rawDocument: document },
      };
    })
  );
  await qdrantCli.upsertCollections(collectionName, points);
  return chunks.slice(batchSize);
}

(async () => {
  let repo = {
    path: "/Users/mbranni03/Documents/GitHub/FraudeCode/sample",
    name: "sample",
  };
  let client = new QdrantCli();
  let neo4jClient = new Neo4jClient();
  await neo4jClient.healthCheck();
  await client.init();
  await client.getOrCreateCollection(repo.name);
  await indexAllFiles(repo, client, neo4jClient);
  console.log("Indexing finished.");
})();
