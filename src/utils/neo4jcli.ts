import neo4j, { type Driver } from "neo4j-driver";

// Neo4j connection details
const uri = "bolt://localhost:7687";
const user = "neo4j";
const password = "password123"; // Match the password from docker-compose

class Neo4jClient {
  driver: Driver;
  constructor() {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async healthCheck() {
    const session = this.driver.session();
    try {
      const result: any = await session.run(
        'RETURN "Connected to Neo4j!" as message'
      );
      console.log(result.records[0].get("message"));
    } finally {
      await session.close();
    }
  }

  async addFileNode(filePath: string) {
    const session = this.driver.session();
    try {
      await session.run(
        `
        MERGE (f:File {path: $path})
        `,
        { path: filePath }
      );
    } catch (error) {
      console.error(`Error adding file node ${filePath}:`, error);
    } finally {
      await session.close();
    }
  }

  async addFunctionNode(
    name: string,
    filePath: string,
    startLine: number,
    parentName?: string
  ) {
    const session = this.driver.session();
    try {
      if (parentName) {
        // Link to parent (Class or Function)
        await session.run(
          `
          MATCH (parent {name: $parentName, filePath: $filePath})
          WHERE parent:Class OR parent:Function
          MERGE (fn:Function {name: $name, filePath: $filePath})
          ON CREATE SET fn.startLine = $startLine
          MERGE (parent)-[:DEFINES]->(fn)
          `,
          { name, filePath, startLine, parentName }
        );
      } else {
        // Link to File
        await session.run(
          `
          MATCH (f:File {path: $filePath})
          MERGE (fn:Function {name: $name, filePath: $filePath})
          ON CREATE SET fn.startLine = $startLine
          MERGE (f)-[:DEFINES]->(fn)
          `,
          { name, filePath, startLine }
        );
      }
    } catch (error) {
      console.error(`Error adding function node ${name}:`, error);
    } finally {
      await session.close();
    }
  }

  async addClassNode(
    name: string,
    filePath: string,
    startLine: number,
    parentName?: string
  ) {
    const session = this.driver.session();
    try {
      if (parentName) {
        await session.run(
          `
                MATCH (parent {name: $parentName, filePath: $filePath})
                WHERE parent:Class OR parent:Function
                MERGE (c:Class {name: $name, filePath: $filePath})
                ON CREATE SET c.startLine = $startLine
                MERGE (parent)-[:DEFINES]->(c)
                `,
          { name, filePath, startLine, parentName }
        );
      } else {
        await session.run(
          `
                MATCH (f:File {path: $filePath})
                MERGE (c:Class {name: $name, filePath: $filePath})
                ON CREATE SET c.startLine = $startLine
                MERGE (f)-[:DEFINES]->(c)
                `,
          { name, filePath, startLine }
        );
      }
    } catch (error) {
      console.error(`Error adding class node ${name}:`, error);
    } finally {
      await session.close();
    }
  }

  async addImportRelationship(fromFile: string, toModule: string) {
    const session = this.driver.session();
    try {
      await session.run(
        `
        MATCH (f:File {path: $fromFile})
        MERGE (m:Module {name: $toModule})
        MERGE (f)-[:IMPORTS]->(m)
        `,
        { fromFile, toModule }
      );
    } catch (error) {
      console.error(`Error adding import ${fromFile} -> ${toModule}:`, error);
    } finally {
      await session.close();
    }
  }

  async addCallRelationship(
    sourceFile: string,
    sourceContext: string | undefined, // function name or class method name
    targetFunction: string,
    possibleTargetFiles: string[] = [] // List of files where this function might be defined (from imports)
  ) {
    const session = this.driver.session();
    try {
      const params: any = {
        sourceFile,
        sourceContext: sourceContext || "TOP_LEVEL",
        targetFunction,
      };

      let sourceMatch = "";
      if (sourceContext) {
        sourceMatch = `MATCH (source {name: $sourceContext, filePath: $sourceFile}) WHERE source:Function OR source:Class`;
      } else {
        sourceMatch = `MATCH (source:File {path: $sourceFile})`;
      }

      let query = "";
      if (possibleTargetFiles.length > 0) {
        params.targetFiles = possibleTargetFiles;
        query = `
                    ${sourceMatch}
                    MATCH (target)
                    WHERE (target:Function OR target:Class) AND target.name = $targetFunction AND target.filePath IN $targetFiles
                    MERGE (source)-[:CALLS]->(target)
                 `;
      } else {
        // Assume same file
        query = `
                    ${sourceMatch}
                    MATCH (target)
                    WHERE (target:Function OR target:Class) AND target.name = $targetFunction AND target.filePath = $sourceFile
                    MERGE (source)-[:CALLS]->(target)
                 `;
      }

      const result = await session.run(query, params);

      // Fallback: If no target found and targetFunction might be an external module
      if (
        result.summary.counters.updates().relationshipsCreated === 0 &&
        possibleTargetFiles.length > 0
      ) {
        await session.run(
          `
              ${sourceMatch}
              MATCH (m:Module)
              WHERE m.name IN $targetFiles
              MERGE (source)-[:CALLS_MODULE]->(m)
           `,
          { ...params, targetFiles: possibleTargetFiles }
        );
      }
    } catch (error) {
      console.error(`Error adding call relationship:`, error);
    } finally {
      await session.close();
    }
  }

  async getContextBySymbol(symbolName: string) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (s {name: $symbolName})
        WHERE s:Function OR s:Class
        OPTIONAL MATCH (s)<-[:DEFINES]-(parent)
        OPTIONAL MATCH (s)-[:CALLS]->(target)
        RETURN s.name as name, s.filePath as filePath, s.startLine as startLine, labels(s)[0] as type, 
               parent.path as parentFile, labels(parent)[0] as parentType, parent.name as parentName,
               collect(target.name) as calls
        `,
        { symbolName }
      );
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }
}

export default Neo4jClient;
