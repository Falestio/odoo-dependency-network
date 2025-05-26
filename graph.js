let graph = { nodes: [], links: [] };
let simulation;
let svg;
let width, height;
let allModules = new Set();
let moduleDependencies = {};
let externalModules = new Set();
let highlightedModule = "";
let depthLimit = null;
let circularDependencies = new Set();
let circularViewMode = false;

function initGraph() {
  width = window.innerWidth - 300;
  height = window.innerHeight;

  svg = d3
    .select("#graph-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(
      d3.zoom().on("zoom", function (event) {
        svg.attr("transform", event.transform);
      })
    )
    .append("g");

  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#888");

  simulation = d3
    .forceSimulation()
    .force(
      "link",
      d3
        .forceLink()
        .id((d) => d.id)
        .distance(150)
    )
    .force("charge", d3.forceManyBody().strength(-800))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(50));

  setupEventListeners();
}

function setupEventListeners() {
  document
    .getElementById("highlight-button")
    .addEventListener("click", applyHighlighting);
  document.getElementById("reset-button").addEventListener("click", resetGraph);
  document
    .getElementById("migration-order-button")
    .addEventListener("click", generateMigrationOrder);
  document
    .getElementById("highlight-circular-btn")
    .addEventListener("click", highlightCircularDependencies);

  window.addEventListener("resize", function () {
    width = window.innerWidth - 300;
    height = window.innerHeight;
    d3.select("#graph-container svg")
      .attr("width", width)
      .attr("height", height);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.3).restart();
  });

  const modal = document.getElementById("migration-modal");
  const span = document.getElementsByClassName("close")[0];

  span.onclick = function () {
    modal.style.display = "none";
  };

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };
}

async function loadModuleData() {
  try {
    const response = await fetch("module_dependencies.json");
    const data = await response.json();
    processModuleData(data);
    renderGraph();
  } catch (error) {
    console.error("Error loading module data:", error);
    document.getElementById(
      "graph-container"
    ).innerHTML = `<div class="error-message">Error loading module data. Make sure the JSON file exists.</div>`;
  }
}

function processModuleData(data) {
  moduleDependencies = data;
  allModules = new Set();
  externalModules = new Set();

  Object.keys(moduleDependencies).forEach((module) => {
    allModules.add(module);
  });

  Object.keys(moduleDependencies).forEach((module) => {
    moduleDependencies[module].forEach((dep) => {
      allModules.add(dep);

      if (!moduleDependencies[dep]) {
        moduleDependencies[dep] = [];
        externalModules.add(dep);
      }
    });
  });

  updateGraphData();
}

function updateGraphData() {
  graph.nodes = [];
  graph.links = [];

  let modulesToRender = new Set(allModules);

  if (highlightedModule && allModules.has(highlightedModule)) {
    if (depthLimit !== null) {
      modulesToRender = getModulesInDepth(highlightedModule, depthLimit);
    }
  }

  modulesToRender.forEach((module) => {
    const isExternalModule = externalModules.has(module);
    let nodeColor = isExternalModule ? "#a5d6a7" : "#97c2fc";
    let borderWidth = 1;

    if (highlightedModule === module) {
      nodeColor = "#ff5722";
      borderWidth = 3;
    } else if (
      highlightedModule &&
      moduleDependencies[highlightedModule] &&
      moduleDependencies[highlightedModule].includes(module)
    ) {
      nodeColor = isExternalModule ? "#4caf50" : "#2196f3";
      borderWidth = 2;
    } else if (highlightedModule && isDependentOf(module, highlightedModule)) {
      nodeColor = "#9c27b0";
      borderWidth = 2;
    }

    graph.nodes.push({
      id: module,
      color: nodeColor,
      borderWidth: borderWidth,
      isExternalModule: isExternalModule,
    });
  });

  Object.keys(moduleDependencies).forEach((source) => {
    if (modulesToRender.has(source)) {
      moduleDependencies[source].forEach((target) => {
        if (modulesToRender.has(target)) {
          let linkWidth = 1;
          let linkColor = "#848484";

          const isCircular = circularDependencies.has(`${source}|${target}`);

          if (isCircular && circularViewMode) {
            linkColor = "#ff0000";
            linkWidth = 2;
          } else if (
            highlightedModule &&
            (source === highlightedModule || target === highlightedModule)
          ) {
            linkWidth = 2;
            linkColor = "#ffc107";
          }

          graph.links.push({
            source: source,
            target: target,
            width: linkWidth,
            color: linkColor,
            isCircular: isCircular,
          });
        }
      });
    }
  });
}

function renderGraph() {
  svg.selectAll("*").remove();

  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#888");

  const link = svg
    .append("g")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke-width", (d) => d.width)
    .attr("stroke", (d) => d.color)
    .attr("marker-end", "url(#arrowhead)");

  const node = svg
    .append("g")
    .selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("g")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    );

  node
    .append("circle")
    .attr("r", (d) => {
      let connectionCount = 0;

      graph.links.forEach((link) => {
        if (link.target.id === d.id) connectionCount++;
      });

      if (moduleDependencies[d.id]) {
        connectionCount += moduleDependencies[d.id].length;
      }

      return Math.max(6, Math.min(15, 5 + connectionCount * 0.5));
    })
    .attr("fill", (d) => d.color)
    .attr("stroke", (d) => d.color)
    .attr("stroke-width", (d) => d.borderWidth);

  node
    .append("text")
    .attr("dx", 18)
    .attr("dy", ".35em")
    .attr("font-size", "12px")
    .attr("fill", "#333")
    .text((d) => d.id)
    .attr("stroke", "white")
    .attr("stroke-width", 0.3)
    .attr("paint-order", "stroke");

  node.append("title").text((d) => d.id);

  simulation.nodes(graph.nodes).on("tick", ticked);
  simulation.force("link").links(graph.links);
  simulation.alpha(1).restart();

  function ticked() {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }
}

function dragstarted(event) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  event.subject.fx = event.subject.x;
  event.subject.fy = event.subject.y;
}

function dragged(event) {
  event.subject.fx = event.x;
  event.subject.fy = event.y;
}

function dragended(event) {
  if (!event.active) simulation.alphaTarget(0);
  event.subject.fx = null;
  event.subject.fy = null;
}

function applyHighlighting() {
  highlightedModule = document.getElementById("module-search").value.trim();

  if (highlightedModule && !allModules.has(highlightedModule)) {
    alert(`Module "${highlightedModule}" not found in the graph.`);
    return;
  }

  const depthInput = document.getElementById("depth-input").value.trim();
  if (depthInput) {
    depthLimit = parseInt(depthInput);
    if (isNaN(depthLimit) || depthLimit < 0) {
      alert("Depth must be a non-negative number.");
      return;
    }
  } else {
    depthLimit = null;
  }

  updateGraphData();
  renderGraph();
}

function resetGraph() {
  highlightedModule = "";
  depthLimit = null;
  circularViewMode = false;
  document.getElementById("module-search").value = "";
  document.getElementById("depth-input").value = "";

  updateGraphData();
  renderGraph();
}

function highlightCircularDependencies() {
  highlightedModule = "";
  depthLimit = null;
  document.getElementById("module-search").value = "";
  document.getElementById("depth-input").value = "";

  detectCircularDependencies();

  if (circularDependencies.size === 0) {
    alert("No circular dependencies found");
    return;
  }

  circularViewMode = true;

  const circularModules = new Set();
  circularDependencies.forEach((pair) => {
    const [source, target] = pair.split("|");
    circularModules.add(source);
    circularModules.add(target);
  });

  graph.nodes = [];
  graph.links = [];

  circularModules.forEach((module) => {
    const isExternalModule = externalModules.has(module);
    graph.nodes.push({
      id: module,
      color: "#ff4444",
      borderWidth: 2,
      isExternalModule: isExternalModule,
    });
  });

  circularModules.forEach((source) => {
    if (moduleDependencies[source]) {
      moduleDependencies[source].forEach((target) => {
        if (circularModules.has(target)) {
          const isCircular = circularDependencies.has(`${source}|${target}`);
          graph.links.push({
            source: source,
            target: target,
            width: isCircular ? 2 : 1,
            color: isCircular ? "#ff0000" : "#848484",
            isCircular: isCircular,
          });
        }
      });
    }
  });

  renderGraph();
}

function generateMigrationOrder() {
  detectCircularDependencies();
  const dependencyLevels = buildDependencyLevels(true);

  let tableHTML = '<table class="migration-table">';
  tableHTML +=
    "<thead><tr><th>Level</th><th>Type</th><th>Module</th><th>Dependencies</th><th>Dependency Count</th><th>Circular</th></tr></thead><tbody>";

  dependencyLevels.forEach((modules, level) => {
    const modulesByDeps = {};
    const externalMods = modules.filter((mod) => externalModules.has(mod));
    const localMods = modules.filter((mod) => !externalModules.has(mod));

    [...localMods, ...externalMods].forEach((mod) => {
      const deps = moduleDependencies[mod] || [];
      const depStr = deps.sort().join(",");

      if (!modulesByDeps[depStr]) {
        modulesByDeps[depStr] = [];
      }
      modulesByDeps[depStr].push(mod);
    });

    const sortedDepGroups = Object.keys(modulesByDeps).sort((a, b) => {
      const countA = a ? a.split(",").filter(Boolean).length : 0;
      const countB = b ? b.split(",").filter(Boolean).length : 0;

      if (countA !== countB) {
        return countA - countB;
      }
      return a.localeCompare(b);
    });

    sortedDepGroups.forEach((depStr) => {
      const depCount = depStr ? depStr.split(",").filter(Boolean).length : 0;
      const depModules = modulesByDeps[depStr];
      depModules.sort();

      const externalModsInGroup = depModules.filter((mod) =>
        externalModules.has(mod)
      );
      if (externalModsInGroup.length > 0) {
        externalModsInGroup.forEach((mod) => {
          const hasCircular = Array.from(circularDependencies).some(
            (pair) => pair.startsWith(`${mod}|`) || pair.endsWith(`|${mod}`)
          );

          tableHTML += `<tr>
            <td>${level}</td>
            <td>External</td>
            <td>${mod}</td>
            <td>${depStr || "<none>"}</td>
            <td>${depCount}</td>
            <td>${hasCircular ? "Yes" : "No"}</td>
          </tr>`;
        });
      }

      const localModsInGroup = depModules.filter(
        (mod) => !externalModules.has(mod)
      );
      if (localModsInGroup.length > 0) {
        localModsInGroup.forEach((mod) => {
          const hasCircular = Array.from(circularDependencies).some(
            (pair) => pair.startsWith(`${mod}|`) || pair.endsWith(`|${mod}`)
          );

          tableHTML += `<tr>
            <td>${level}</td>
            <td>Local</td>
            <td>${mod}</td>
            <td>${depStr || "<none>"}</td>
            <td>${depCount}</td>
            <td>${hasCircular ? "Yes" : "No"}</td>
          </tr>`;
        });
      }
    });
  });

  tableHTML += "</tbody></table>";

  document.getElementById("migration-content").innerHTML = tableHTML;
  document.getElementById("migration-modal").style.display = "block";

  document.getElementById("download-migration-btn").onclick = function () {
    downloadMigrationTable();
  };
}

function buildDependencyLevels() {
  circularDependencies = new Set();
  const dependenciesToProcess = {};

  Object.keys(moduleDependencies).forEach((mod) => {
    dependenciesToProcess[mod] = [...moduleDependencies[mod]];
  });

  externalModules.forEach((mod) => {
    if (!dependenciesToProcess[mod]) {
      dependenciesToProcess[mod] = [];
    }
  });

  const processedModules = new Set();
  const levels = [];
  let currentLevel = 0;

  while (Object.keys(dependenciesToProcess).length > 0) {
    const currentLevelModules = [];

    Object.keys(dependenciesToProcess).forEach((mod) => {
      if (dependenciesToProcess[mod].length === 0) {
        currentLevelModules.push(mod);
      }
    });

    if (
      currentLevelModules.length === 0 &&
      Object.keys(dependenciesToProcess).length > 0
    ) {
      let minDeps = Number.MAX_SAFE_INTEGER;
      let moduleWithMinDeps = null;

      Object.keys(dependenciesToProcess).forEach((mod) => {
        if (dependenciesToProcess[mod].length < minDeps) {
          minDeps = dependenciesToProcess[mod].length;
          moduleWithMinDeps = mod;
        }
      });

      if (moduleWithMinDeps) {
        dependenciesToProcess[moduleWithMinDeps].forEach((dep) => {
          if (dependenciesToProcess[dep]) {
            circularDependencies.add(`${moduleWithMinDeps}|${dep}`);
          }
        });

        currentLevelModules.push(moduleWithMinDeps);
      }
    }

    levels[currentLevel] = currentLevelModules;

    currentLevelModules.forEach((mod) => {
      processedModules.add(mod);
      delete dependenciesToProcess[mod];
    });

    Object.keys(dependenciesToProcess).forEach((mod) => {
      dependenciesToProcess[mod] = dependenciesToProcess[mod].filter(
        (dep) => !processedModules.has(dep)
      );
    });

    currentLevel++;
  }

  return levels;
}

function detectCircularDependencies() {
  function checkCycle(
    module,
    visited = new Set(),
    recStack = new Set(),
    path = []
  ) {
    visited.add(module);
    recStack.add(module);
    path.push(module);

    const deps = moduleDependencies[module] || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (checkCycle(dep, visited, recStack, [...path])) {
          return true;
        }
      } else if (recStack.has(dep)) {
        const cycleStart = path.indexOf(dep);
        const cycle = path.slice(cycleStart);
        cycle.push(dep);

        for (let i = 0; i < cycle.length - 1; i++) {
          circularDependencies.add(`${cycle[i]}|${cycle[i + 1]}`);
        }
        return true;
      }
    }

    recStack.delete(module);
    return false;
  }

  circularDependencies = new Set();
  for (const module of Object.keys(moduleDependencies)) {
    checkCycle(module, new Set(), new Set(), []);
  }
}

function isDependentOf(potentialDependent, module) {
  return (
    moduleDependencies[potentialDependent] &&
    moduleDependencies[potentialDependent].includes(module)
  );
}

function getModulesInDepth(module, depth) {
  let modulesInDepth = new Set([module]);

  let currentDeps = new Set([module]);
  for (let i = 0; i < depth; i++) {
    let nextLevel = new Set();
    currentDeps.forEach((mod) => {
      if (moduleDependencies[mod]) {
        moduleDependencies[mod].forEach((dep) => {
          nextLevel.add(dep);
        });
      }
    });

    if (nextLevel.size === 0) break;
    nextLevel.forEach((mod) => modulesInDepth.add(mod));
    currentDeps = nextLevel;
  }

  currentDeps = new Set([module]);
  for (let i = 0; i < depth; i++) {
    let nextLevel = new Set();

    currentDeps.forEach((mod) => {
      Object.keys(moduleDependencies).forEach((potential) => {
        if (moduleDependencies[potential].includes(mod)) {
          nextLevel.add(potential);
        }
      });
    });

    if (nextLevel.size === 0) break;
    nextLevel.forEach((mod) => modulesInDepth.add(mod));
    currentDeps = nextLevel;
  }

  return modulesInDepth;
}

function downloadMigrationTable() {
  const table = document.querySelector(".migration-table");
  let csv = [];

  const headers = [];
  const headerCells = table.querySelectorAll("thead th");
  headerCells.forEach((cell) => {
    headers.push(cell.innerText);
  });
  csv.push(headers.join(","));

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    const rowData = [];
    const cells = row.querySelectorAll("td");
    cells.forEach((cell) => {
      let cellText = cell.innerText.replace(/"/g, '""');
      if (cellText.includes(",")) {
        cellText = `"${cellText}"`;
      }
      rowData.push(cellText);
    });
    csv.push(rowData.join(","));
  });

  const csvContent = csv.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "module_migration_order.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", function () {
  initGraph();
  loadModuleData();
});
