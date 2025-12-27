import Neo4jClient from "./src/utils/neo4jcli";

(async () => {
  const client = new Neo4jClient();
  await client.healthCheck();

  const session = client.driver.session();
  try {
    const args = process.argv.slice(2);
    if (args.includes("--clear")) {
      console.log("Cleaning database...");
      await session.run("MATCH (n) DETACH DELETE n");
      console.log("Database cleared.");
      return;
    }

    console.log("--- Nodes ---");
    const nodes = await session.run(
      "MATCH (n) RETURN labels(n) as labels, properties(n) as props LIMIT 50"
    );
    nodes.records.forEach((r) => {
      console.log(r.get("labels"), r.get("props"));
    });

    console.log("\n--- Relationships ---");
    const rels = await session.run(
      "MATCH (a)-[r]->(b) RETURN properties(a) as aProps, labels(a) as aLabels, type(r) as relType, properties(b) as bProps, labels(b) as bLabels LIMIT 50"
    );
    rels.records.forEach((r) => {
      const a = r.get("aProps");
      const b = r.get("bProps");
      const aLabel = r.get("aLabels")[0];
      const bLabel = r.get("bLabels")[0];
      const aName = a.name || a.path;
      const bName = b.name || b.path;
      console.log(
        `${aLabel}(${aName}) -[${r.get("relType")}]-> ${bLabel}(${bName})`
      );
    });
  } finally {
    await session.close();
    await client.driver.close();
  }
})();
