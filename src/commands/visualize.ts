import { BunApiRouter } from "@/utils/router";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";
import AgentCognition from "@/utils/agentCognition";
import { exec } from "child_process";

const VISUALIZATION_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fraude | Neural Matrix</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #050510;
      --bg-panel: rgba(20, 20, 35, 0.7);
      --border-color: rgba(255, 255, 255, 0.1);
      --accent-primary: #00f2ea;
      --accent-secondary: #7c3aed;
      --text-main: #e0e0e0;
      --text-dim: #94a3b8;
      --glass-blur: blur(12px);
    }

    * { box-sizing: border-box; outline: none; }

    body, html {
      height: 100%;
      margin: 0;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(circle at 15% 50%, rgba(124, 58, 237, 0.08), transparent 25%), 
        radial-gradient(circle at 85% 30%, rgba(0, 242, 234, 0.08), transparent 25%);
      color: var(--text-main);
    }

    /* --- Canvas --- */
    #mynetwork {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
    }

    /* --- UI Layer --- */
    .ui-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none; /* Let clicks pass through to network */
      z-index: 10;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px;
    }

    .interactive { pointer-events: auto; }

    /* --- Header --- */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      backdrop-filter: var(--glass-blur);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
      max-width: 1200px;
      margin: 0 auto;
      width: 90%;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 1.1rem;
      color: #fff;
      text-shadow: 0 0 10px rgba(255,255,255,0.3);
    }

    .brand-dot {
      width: 10px;
      height: 10px;
      background: var(--accent-primary);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent-primary);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(0, 242, 234, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(0, 242, 234, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 242, 234, 0); }
    }

    /* --- Search Bar --- */
    .search-container {
      position: relative;
      width: 300px;
    }
    
    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 8px 16px 8px 36px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      transition: all 0.3s ease;
    }

    .search-input:focus {
      border-color: var(--accent-primary);
      background: rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 15px rgba(0, 242, 234, 0.1);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.5;
      width: 16px; 
      height: 16px;
      fill: currentColor;
    }

    /* --- Stats --- */
    .stats {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--text-dim);
      display: flex;
      gap: 16px;
    }
    .stat-item b { color: #fff; margin-left: 4px; }

    /* --- Side Panel --- */
    .side-panel {
      position: absolute;
      right: 20px;
      top: 90px;
      bottom: 20px;
      width: 350px;
      background: rgba(13, 17, 26, 0.85); /* Darker, more opaque */
      border-left: 1px solid var(--border-color);
      backdrop-filter: blur(20px);
      transform: translateX(120%);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 20;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: -10px 0 30px rgba(0,0,0,0.5);
    }

    .side-panel.open { transform: translateX(0); }

    .panel-header {
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
      background: rgba(255,255,255,0.02);
    }

    .panel-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin: 0 0 4px 0;
      color: #fff;
    }

    .panel-subtitle {
      font-size: 0.8rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .type-badge {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .panel-content {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .prop-row {
      margin-bottom: 16px;
    }

    .prop-label {
      display: block;
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-bottom: 4px;
    }

    .prop-value {
      color: var(--text-main);
      word-break: break-word;
      background: rgba(0,0,0,0.2);
      padding: 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .close-btn {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 1.2rem;
      transition: color 0.2s;
    }
    .close-btn:hover { color: #fff; }

    /* --- Dock (Legend/Filter) --- */
    .dock-container {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-panel);
      padding: 10px 20px;
      border-radius: 20px;
      border: 1px solid var(--border-color);
      backdrop-filter: var(--glass-blur);
      display: flex;
      gap: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      overflow-x: auto;
      max-width: 90%;
    }

    .dock-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .dock-item:hover {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.1);
    }

    .dock-item.active {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.15);
    }

    .dock-item.faded { opacity: 0.4; }

    .dock-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 5px currentColor; }

    /* --- Loading Screen --- */
    #loading {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: #050510;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: opacity 0.8s ease;
    }

    .loader-ring {
      width: 60px; height: 60px;
      border: 2px solid transparent;
      border-top-color: var(--accent-primary);
      border-right-color: var(--accent-secondary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }

    .loading-text {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent-primary);
      font-size: 0.9rem;
      letter-spacing: 2px;
      animation: blink 1.5s infinite;
    }

    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes blink { 50% { opacity: 0.5; } }

  </style>
</head>
<body>

  <!-- Loading Screen -->
  <div id="loading">
    <div class="loader-ring"></div>
    <div class="loading-text" id="loading-text">INITIALIZING NEURAL MATRIX...</div>
  </div>

  <!-- Network Container -->
  <div id="mynetwork"></div>

  <!-- UI Overlay -->
  <div class="ui-layer">
    
    <!-- Top Header -->
    <div class="header interactive">
      <div class="brand">
        <div class="brand-dot"></div>
        FRAUDE CODE
      </div>
      
      <div class="search-container">
        <svg class="search-icon" viewBox="0 0 24 24"><path d="M21.71 20.29L18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.42zM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/></svg>
        <input type="text" class="search-input" placeholder="Search function, file..." id="search-input" oninput="handleSearch(this.value)">
      </div>

      <div class="stats">
        <span class="stat-item">NODES<b id="node-count">0</b></span>
        <span class="stat-item">RELATIONS<b id="edge-count">0</b></span>
      </div>
    </div>

    <!-- Side Panel -->
    <div class="side-panel interactive" id="side-panel">
      <button class="close-btn" onclick="closePanel()">×</button>
      <div class="panel-header">
        <h2 class="panel-title" id="panel-title">Node Name</h2>
        <div class="panel-subtitle">
          <span class="type-badge" id="panel-color"></span>
          <span id="panel-type">Type</span>
        </div>
      </div>
      <div class="panel-content">
        <div class="prop-row">
          <span class="prop-label">Full Identifier</span>
          <div class="prop-value" id="panel-id">...</div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Context / Content</span>
          <div class="prop-value" id="panel-desc">...</div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Relationships</span>
          <div id="panel-rels"></div>
        </div>
      </div>
    </div>

    <!-- Bottom Dock -->
    <div class="dock-container interactive" id="filter-dock">
      <!-- Generated via JS -->
    </div>

  </div>

<script type="text/javascript">
  let network;
  let allNodes;
  let allEdges;
  let nodesDataSet;
  let edgesDataSet;
  const typeColors = {
    // Semantic
    fact: "#00f2ea",      // Cyan
    decision: "#39ff14",  // Neon Green
    concept: "#ff00ff",   // Magenta
    reference: "#ffaa00", // Orange
    // Code
    file: "#58a6ff",      // Blue
    module: "#7c3aed",    // Violet
    function: "#f97316",  // Orange
    class: "#ec4899",     // Pink
    interface: "#14b8a6", // Teal
    variable: "#a855f7",  // Purple
    symbol: "#94a3b8"     // Slate
  };

  async function fetchGraph() {
    try {
      const response = await fetch('/api/graph');
      const data = await response.json();
      
      // Update Stats
      document.getElementById('node-count').innerText = data.nodes.length;
      document.getElementById('edge-count').innerText = data.edges.length;

      initGraph(data.nodes, data.edges);
      generateDock(data.nodes);
    } catch (error) {
      document.getElementById('loading-text').textContent = 'SYSTEM FAILURE: ' + error.message;
      document.getElementById('loading-text').style.color = '#ff5555';
    }
  }

  function initGraph(nodes, edges) {
    var container = document.getElementById('mynetwork');
    
    nodesDataSet = new vis.DataSet(nodes);
    edgesDataSet = new vis.DataSet(edges);

    var data = { nodes: nodesDataSet, edges: edgesDataSet };
    
    var options = {
      nodes: {
        shape: 'dot',
        size: 20,
        font: {
          color: '#e0e0e0',
          size: 14,
          face: 'Inter',
          strokeWidth: 4, 
          strokeColor: '#050510',
          vadjust: -35 // Push label above node
        },
        borderWidth: 0,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.5)',
          size: 10,
          x: 0, y: 5
        }
      },
      edges: {
        width: 1,
        color: { 
          color: 'rgba(255,255,255,0.15)', 
          highlight: '#fff',
          hover: '#fff'
        },
        smooth: { type: 'continuous', roundness: 0.5 },
        selectionWidth: 2
      },
      physics: {
        stabilization: {
          enabled: true,
          iterations: 1000,
          updateInterval: 50
        },
        barnesHut: {
            gravitationalConstant: -10000, // Strong repulsion
            centralGravity: 0.3,
            springLength: 150,
            springConstant: 0.05,
            damping: 0.4
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        hideEdgesOnDrag: true
      }
    };

    network = new vis.Network(container, data, options);

    // Fade out loading screen when stabilized or after a timeout
    network.once("stabilizationIterationsDone", finishLoading);
    setTimeout(finishLoading, 4000); // Fallback

    // Click Event
    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesDataSet.get(nodeId);
        openPanel(node);
      } else {
        closePanel();
      }
    });

    // Hover Event (Glow effect)
    network.on("hoverNode", function (params) {
      container.style.cursor = 'pointer';
    });
    network.on("blurNode", function () {
      container.style.cursor = 'default';
    });
    
    // Custom Rendering for "Neon Glow"
    network.on("beforeDrawing", function(ctx) {
       // Optional: Add global glow or background effects here
    });
  }

  function finishLoading() {
      const el = document.getElementById('loading');
      if (el.style.opacity !== '0') {
          el.style.opacity = '0';
          setTimeout(() => el.style.display = 'none', 800);
          network.fit();
      }
  }

  // --- Search Logic ---
  function handleSearch(query) {
    if (!query) {
        // Reset view
        return;
    }
    const lower = query.toLowerCase();
    const matches = nodesDataSet.get({
        filter: function (item) {
            return (item.label && item.label.toLowerCase().includes(lower));
        }
    });

    if (matches.length > 0) {
        network.selectNodes(matches.map(n => n.id));
        if (matches.length === 1) {
            network.focus(matches[0].id, { scale: 1.5, animation: true });
            openPanel(matches[0]);
        }
    } else {
        network.unselectAll();
    }
  }

  // --- Side Panel Logic ---
  function openPanel(node) {
    const panel = document.getElementById('side-panel');
    document.getElementById('panel-title').textContent = node.label || 'Unknown Node';
    document.getElementById('panel-type').textContent = node.group;
    document.getElementById('panel-color').style.backgroundColor = node.color.background;
    document.getElementById('panel-id').textContent = node.id;
    document.getElementById('panel-desc').textContent = node.title || 'No details available.';

    // Find relationships
    const connectedEdges = edgesDataSet.get({
        filter: function (item) {
            return item.from === node.id || item.to === node.id;
        }
    });

    const relsHtml = connectedEdges.map(edge => {
        const isSource = edge.from === node.id;
        const otherId = isSource ? edge.to : edge.from;
        const otherNode = nodesDataSet.get(otherId);
        const direction = isSource ? "→" : "←";
        return \`<div style="margin-top:4px; font-size:0.8rem; border-left: 2px solid rgba(255,255,255,0.1); padding-left:8px;">
            <span style="color:var(--text-dim)">\${direction} [\${edge.label}]</span> 
            <span style="color:var(--accent-primary)">\${otherNode ? otherNode.label : otherId}</span>
        </div>\`;
    }).join('');

    document.getElementById('panel-rels').innerHTML = relsHtml || '<span style="color:var(--text-dim); font-size: 0.8rem">No connections</span>';

    panel.classList.add('open');
  }

  function closePanel() {
    document.getElementById('side-panel').classList.remove('open');
    network.unselectAll();
  }

  // --- Dock / Filter Logic ---
  function generateDock(nodes) {
      const types = [...new Set(nodes.map(n => n.group))];
      const dock = document.getElementById('filter-dock');
      dock.innerHTML = '';
      
      types.forEach(type => {
          const color = typeColors[type] || '#999';
          
          const item = document.createElement('div');
          item.className = 'dock-item active';
          item.innerHTML = \`<div class="dock-dot" style="background:\${color}; box-shadow: 0 0 8px \${color}"></div> \${type}\`;
          item.onclick = () => toggleFilter(type, item);
          dock.appendChild(item);
      });
  }

  const activeFilters = new Set();
  
  // Initialize with all active
  setTimeout(() => {
     const types = document.querySelectorAll('.dock-item');
     types.forEach(t => activeFilters.add(t.textContent.trim()));
  }, 1000);

  function toggleFilter(type, element) {
      // NOTE: For a real filter, we'd use a DataView or hide nodes.
      // For this simplified version, we'll just dim them or hide them.
      // Re-implementing visually:
      
      if (element.classList.contains('active')) {
          element.classList.remove('active');
          element.classList.add('faded');
          // Hide nodes
          const toHide = nodesDataSet.get({ filter: n => n.group === type });
          toHide.forEach(n => {
              nodesDataSet.update({id: n.id, hidden: true});
          });
      } else {
          element.classList.add('active');
          element.classList.remove('faded');
          // Show nodes
          const toShow = nodesDataSet.get({ filter: n => n.group === type });
          toShow.forEach(n => {
              nodesDataSet.update({id: n.id, hidden: false});
          });
      }
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
    const router = new BunApiRouter();

    // Register API endpoint for graph data
    router.register("GET", "/api/graph", async () => {
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
        const typeColors: Record<
          string,
          { background: string; border?: string; highlight?: object }
        > = {
          // Semantic types
          fact: { background: "#00f2ea" },
          decision: { background: "#39ff14" },
          concept: { background: "#ff00ff" },
          reference: { background: "#ffaa00" },
          // Code entity types
          file: { background: "#58a6ff" },
          module: { background: "#7c3aed" },
          function: { background: "#f97316" },
          class: { background: "#ec4899" },
          interface: { background: "#14b8a6" },
          variable: { background: "#a855f7" },
          symbol: { background: "#94a3b8" },
        };

        const nodes = nodesResult.map((row: any) => {
          const baseColor = typeColors[row.type]?.background || "#97c2fc";

          return {
            id: row.id,
            label:
              row.content.length > 25
                ? row.content.substring(0, 25) + "..."
                : row.content,
            title: row.content, // Tooltip content
            group: row.type,
            color: {
              background: baseColor,
              border: baseColor,
              highlight: {
                background: "#fff",
                border: "#fff",
              },
            },
            // Custom shadows for glow effect
            shadow: {
              enabled: true,
              color: baseColor,
              size: 10,
              x: 0,
              y: 0,
            },
          };
        });

        const edges = edgesResult.map((row: any) => ({
          from: row.from,
          to: row.to,
          label: row.label,
          color: { color: "rgba(255,255,255,0.1)" },
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
    router.register("GET", "/visualize", () => {
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
      await router.serve(port);
      log(`Visualization server on port ${port} stopped.`);
    } catch (error) {
      log("Server error:", error);
    }
  },
};

export default command;
