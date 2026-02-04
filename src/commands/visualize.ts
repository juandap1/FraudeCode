import { BunApiRouter } from "@/utils/router";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";
import AgentCognition from "@/utils/agentCognition";
import { exec } from "child_process";

const VISUALIZATION_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Fraude Knowledge Graph</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style type="text/css">
    body, html {
      height: 100%;
      margin: 0;
      overflow: hidden;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #0d1117; /* Github Dark Dimmed-ish */
      background-image: 
        radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
        radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), 
        radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
      color: #e0e0e0;
    }
    #mynetwork {
      width: 100%;
      height: 100%;
      border: none;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px;
      padding: 20px 40px;
      background: rgba(13, 17, 23, 0.8);
      border: 1px solid #30363d;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      pointer-events: none;
      transition: opacity 0.5s ease;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      border-top-color: #58a6ff;
      animation: spin 1s ease-in-out infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .legend {
      position: absolute;
      bottom: 30px;
      right: 30px;
      background: rgba(22, 27, 34, 0.85);
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #30363d;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      backdrop-filter: blur(10px);
      font-size: 14px;
      z-index: 5;
    }
    .legend-title {
      font-weight: 600;
      margin-bottom: 15px;
      color: #8b949e;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .legend-item:hover {
      opacity: 1;
    }
    .color-dot {
      width: 12px;
      height: 12px;
      margin-right: 12px;
      border-radius: 50%;
      box-shadow: 0 0 8px currentColor;
    }
    
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #0d1117; 
    }
    ::-webkit-scrollbar-thumb {
      background: #30363d; 
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #58a6ff; 
    }
  </style>
</head>
<body>
<div id="loading">
  <div class="spinner"></div>
  <span id="loading-text">Connecting to Neural Matrix...</span>
</div>
<div id="mynetwork"></div>
<div class="legend">
  <div class="legend-title">Knowledge Types</div>
  <div class="legend-item" onclick="filterType('fact')">
    <div class="color-dot" style="background:#00f2ea; color: #00f2ea;"></div>Fact
  </div>
  <div class="legend-item" onclick="filterType('decision')">
    <div class="color-dot" style="background:#39ff14; color: #39ff14;"></div>Decision
  </div>
  <div class="legend-item" onclick="filterType('concept')">
    <div class="color-dot" style="background:#ff00ff; color: #ff00ff;"></div>Concept
  </div>
  <div class="legend-item" onclick="filterType('reference')">
    <div class="color-dot" style="background:#ffaa00; color: #ffaa00;"></div>Reference
  </div>
</div>

<script type="text/javascript">
  let network;
  let allNodes;
  let allEdges;

  async function fetchGraph() {
    try {
      const response = await fetch('/api/graph');
      const data = await response.json();
      allNodes = new vis.DataSet(data.nodes);
      allEdges = new vis.DataSet(data.edges);
      drawGraph(allNodes, allEdges);
      document.getElementById('loading').style.opacity = '0';
      setTimeout(() => document.getElementById('loading').style.display = 'none', 500);
    } catch (error) {
      document.getElementById('loading-text').textContent = 'Error loading data: ' + error.message;
      document.querySelector('.spinner').style.borderTopColor = '#ff5555';
    }
  }

  function drawGraph(nodes, edges) {
    var container = document.getElementById('mynetwork');
    var data = {
      nodes: nodes,
      edges: edges
    };
    var options = {
      nodes: {
        shape: 'dot',
        size: 20,
        font: {
          color: '#c9d1d9',
          size: 14,
          face: 'Segoe UI',
          strokeWidth: 0, 
          strokeColor: '#0d1117'
        },
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.5)',
          size: 10,
          x: 5,
          y: 5
        }
      },
      edges: {
        width: 1,
        color: { 
          color: '#30363d', 
          highlight: '#58a6ff',
          opacity: 0.6
        },
        smooth: {
          type: 'continuous',
          forceDirection: 'none'
        },
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 }
        },
        shadow: {
          enabled: false
        }
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -26,
          centralGravity: 0.005,
          springLength: 230,
          springConstant: 0.18,
          damping: 0.4
        },
        maxVelocity: 50,
        minVelocity: 0.1,
        solver: 'forceAtlas2Based',
        stabilization: {
          enabled: true,
          iterations: 200, // Pre-stabilize
          updateInterval: 50
        }
      },
      interaction: {
        tooltipDelay: 100,
        hover: true,
        hideEdgesOnDrag: true
      }
    };
    network = new vis.Network(container, data, options);
    
    // Add "Cluster Glow" effect
    network.on("beforeDrawing", function (ctx) {
      if (!allNodes) return;
      
      const groups = ["fact", "decision", "concept", "reference"];
      const groupColors = {
        "fact": "rgba(0, 242, 234, 0.15)", // Cyan
        "decision": "rgba(57, 255, 20, 0.15)", // Neon Green
        "concept": "rgba(255, 0, 255, 0.15)", // Magenta
        "reference": "rgba(255, 170, 0, 0.15)" // Orange
      };

      const nodePositions = network.getPositions();
      const groupNodes = {};
      
      // Group node positions
      allNodes.forEach(node => {
        if (!groupNodes[node.group]) groupNodes[node.group] = [];
        if (nodePositions[node.id]) {
          groupNodes[node.group].push(nodePositions[node.id]);
        }
      });

      // Draw glows
      groups.forEach(group => {
        const positions = groupNodes[group];
        if (!positions || positions.length === 0) return;

        // Calculate centroid
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;
        
        positions.forEach(pos => {
          sumX += pos.x;
          sumY += pos.y;
          if (pos.x < minX) minX = pos.x;
          if (pos.x > maxX) maxX = pos.x;
          if (pos.y < minY) minY = pos.y;
          if (pos.y > maxY) maxY = pos.y;
        });

        const centerX = sumX / positions.length;
        const centerY = sumY / positions.length;
        
        // Estimate formatting size based on spread
        const width = maxX - minX;
        const height = maxY - minY;
        const radius = Math.max(width, height) / 2 + 100; // Add padding

        // Draw Gradient
        const grd = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        grd.addColorStop(0, groupColors[group] || "rgba(255,255,255,0.05)");
        grd.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
      });
    });
    
    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        console.log("Clicked node:", params.nodes[0]);
        // Could add a detailed view here later
      }
    });
  }

  // Simple filtering (placeholder for now)
  function filterType(type) {
    console.log("Filtering by", type);
  }

  fetchGraph();
</script>
</body>
</html>
`;

const command: Command = {
  name: "visualize",
  description: "Opens a browser visualization of the knowledge graph",
  usage: "/visualize",
  action: async (args: string[]) => {
    const port = args[0] ? parseInt(args[0], 10) : 3001;
    const cognition = AgentCognition.getInstance();

    // Register API endpoint for graph data
    BunApiRouter.shared.register("GET", "/api/graph", async () => {
      try {
        // Fetch all nodes
        const nodesResult = await cognition.query(`
          MATCH (n:Fact)
          RETURN n.id as id, n.type as type, n.content as content
        `);

        // Fetch all relationships
        const edgesResult = await cognition.query(`
          MATCH (a:Fact)-[r:RELATED_TO]->(b:Fact)
          RETURN a.id as from, b.id as to, r.relation as label
        `);

        // Format for vis-network
        const nodes = nodesResult.map((row: any) => {
          let color = { background: "#97c2fc", border: "#2b7ce9" };
          let shape = "dot";

          switch (row.type) {
            case "fact":
              color = { background: "#00f2ea", border: "#00b3ad" }; // Cyan
              shape = "dot";
              break;
            case "decision":
              color = { background: "#39ff14", border: "#2ebd11" }; // Neon Green
              shape = "diamond";
              break;
            case "concept":
              color = { background: "#ff00ff", border: "#bd00bd" }; // Magenta
              shape = "hexagon";
              break;
            case "reference":
              color = { background: "#ffaa00", border: "#c48200" }; // Orange
              shape = "triangle";
              break;
          }

          return {
            id: row.id,
            label:
              row.content.length > 20
                ? row.content.substring(0, 20) + "..."
                : row.content,
            title: row.content, // Tooltip
            group: row.type,
            color: color,
            shape: shape,
          };
        });

        const edges = edgesResult.map((row: any) => ({
          from: row.from,
          to: row.to,
          label: row.label,
          font: {
            align: "middle",
            size: 10,
            strokeWidth: 0,
            color: "#8b949e",
            background: "transparent",
          },
        }));

        return new Response(JSON.stringify({ nodes, edges }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        log("Error fetching graph data:", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Register Visualization IO
    BunApiRouter.shared.register("GET", "/visualize", () => {
      return new Response(VISUALIZATION_HTML, {
        headers: { "Content-Type": "text/html" },
      });
    });

    log(`Starting visualization server on port ${port}...`);

    const url = `http://localhost:${port}/visualize`;
    log(`Opening ${url} ...`);

    exec(`open ${url}`, (err) => {
      if (err) log("Failed to open browser:", err);
    });

    try {
      await BunApiRouter.shared.serve(port);
    } catch (error) {
      log("Server error:", error);
    }
  },
};

export default command;
