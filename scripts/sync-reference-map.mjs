import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "fixtures/reference-map");
const JSON_URL = "https://roadmap.sh/data-engineer.json";
const FOOTER = /^(also visit|find the detailed)/i;

function slugify(title) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node"
  );
}

function uniqueId(title, used) {
  const base = slugify(title);
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function dist(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.hypot(dx, dy);
}

function cluster(nodes, maxDist) {
  const parent = nodes.map((_, index) => index);
  const find = (index) =>
    parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) {
      parent[pa] = pb;
    }
  };
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (dist(nodes[i], nodes[j]) <= maxDist) {
        union(i, j);
      }
    }
  }
  const groups = new Map();
  nodes.forEach((node, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(node);
    groups.set(root, list);
  });
  return [...groups.values()];
}

function centroid(nodes) {
  const x =
    nodes.reduce((sum, node) => sum + node.position.x, 0) / Math.max(1, nodes.length);
  const y =
    nodes.reduce((sum, node) => sum + node.position.y, 0) / Math.max(1, nodes.length);
  return { position: { x, y } };
}

function wouldCycle(parent, child, parentOf) {
  let cur = parent;
  const seen = new Set();
  while (cur) {
    if (cur === child) {
      return true;
    }
    if (seen.has(cur)) {
      return true;
    }
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

function setParent(parentOf, child, parent) {
  if (!parent || parent === child) {
    return;
  }
  if (wouldCycle(parent, child, parentOf)) {
    return;
  }
  parentOf.set(child, parent);
}

function isSemanticParent(from, to) {
  if (from.type === "title") {
    return to.type === "topic" || to.type === "subtopic" || to.type === "paragraph";
  }
  if (from.type === "paragraph") {
    return to.type === "topic" || to.type === "subtopic";
  }
  if (from.type === "topic" || from.type === "subtopic") {
    return to.type === "subtopic";
  }
  return false;
}

async function loadRoadmap() {
  const response = await fetch(JSON_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${JSON_URL}: ${response.status}`);
  }
  return response.json();
}

function buildTree(data) {
  const raw = data.nodes;
  const byId = new Map(raw.map((node) => [node.id, node]));
  const keep = raw.filter((node) => {
    const type = node.type;
    const label = String(node.data?.label ?? "").trim();
    if (type === "title") {
      return Boolean(label);
    }
    if (type === "topic" || type === "subtopic") {
      return Boolean(label);
    }
    if (type === "paragraph") {
      return Boolean(label) && !FOOTER.test(label);
    }
    return false;
  });

  const used = new Set();
  const idMap = new Map();
  for (const node of keep) {
    idMap.set(node.id, uniqueId(String(node.data.label), used));
  }

  const title = keep.find((node) => node.type === "title") ?? keep[0];
  const rootRemote = title.id;
  const parentOf = new Map();

  for (const edge of data.edges) {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to) {
      continue;
    }
    if (!idMap.has(from.id) || !idMap.has(to.id)) {
      continue;
    }
    if (to.id === rootRemote) {
      continue;
    }
    // Spine strokes on the source map join sibling topics; they are not parent edges.
    if (!isSemanticParent(from, to)) {
      continue;
    }
    if (!parentOf.has(to.id) || from.type === "topic") {
      setParent(parentOf, to.id, from.id);
    }
  }

  const topics = keep.filter((node) => node.type === "topic");
  const subtopics = keep.filter((node) => node.type === "subtopic");
  const paragraphs = keep.filter((node) => node.type === "paragraph");

  const orphans = subtopics.filter((node) => !parentOf.has(node.id));
  for (const group of cluster(orphans, 140)) {
    const point = centroid(group);
    let best = null;
    let bestD = 700;
    for (const topic of topics) {
      const d = dist(point, topic);
      if (d < bestD) {
        best = topic;
        bestD = d;
      }
    }
    if (best) {
      for (const sub of group) {
        setParent(parentOf, sub.id, best.id);
      }
    }
  }

  for (const topic of topics) {
    if (parentOf.has(topic.id) || topic.id === rootRemote) {
      continue;
    }
    // Section labels group leftover topics; parenting onto the topic above rebuilds the spine chain.
    const above = paragraphs
      .filter((node) => node.position.y < topic.position.y)
      .sort(
        (a, b) => topic.position.y - a.position.y - (topic.position.y - b.position.y),
      );
    setParent(parentOf, topic.id, (above[0] ?? title).id);
  }

  for (const paragraph of paragraphs) {
    if (parentOf.has(paragraph.id) || paragraph.id === rootRemote) {
      continue;
    }
    setParent(parentOf, paragraph.id, rootRemote);
  }

  const children = new Map();
  for (const node of keep) {
    children.set(node.id, []);
  }
  for (const [child, parent] of parentOf) {
    children.get(parent)?.push(child);
  }

  const reachable = new Set([rootRemote]);
  const stack = [rootRemote];
  while (stack.length > 0) {
    const id = stack.pop();
    for (const child of children.get(id) ?? []) {
      if (!reachable.has(child)) {
        reachable.add(child);
        stack.push(child);
      }
    }
  }

  const keptNodes = keep.filter((node) => reachable.has(node.id));
  const order = [];
  const visit = (id) => {
    order.push(id);
    const kids = (children.get(id) ?? []).slice().sort((a, b) => {
      const na = byId.get(a);
      const nb = byId.get(b);
      return na.position.y - nb.position.y || na.position.x - nb.position.x;
    });
    children.set(id, kids);
    for (const child of kids) {
      visit(child);
    }
  };
  visit(rootRemote);

  const nodes = order
    .filter((id) => keptNodes.some((node) => node.id === id))
    .map((id) => ({
      id: idMap.get(id),
      title: String(byId.get(id).data.label),
    }));

  const edges = [];
  for (const parent of order) {
    for (const child of children.get(parent) ?? []) {
      if (!idMap.has(child)) {
        continue;
      }
      edges.push({ from: idMap.get(parent), to: idMap.get(child) });
    }
  }

  return { name: String(title.data.label), nodes, edges };
}

async function main() {
  const data = await loadRoadmap();
  const tree = buildTree(data);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(path.join(fixtureDir, "nodes"), { recursive: true });

  await writeFile(
    path.join(fixtureDir, "project.json"),
    `${JSON.stringify(
      {
        version: 1,
        name: tree.name,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(fixtureDir, "plan.graph.json"),
    `${JSON.stringify({ version: 1, nodes: tree.nodes, edges: tree.edges }, null, 2)}\n`,
  );

  await writeFile(
    path.join(fixtureDir, "progress.json"),
    `${JSON.stringify({ version: 1, entries: {} }, null, 2)}\n`,
  );

  for (const node of tree.nodes) {
    await writeFile(
      path.join(fixtureDir, "nodes", `${node.id}.mdx`),
      `# ${node.title}\n\nStart your notes here.\n`,
    );
  }

  console.log(
    `Wrote ${path.relative(repoRoot, fixtureDir)} (${tree.nodes.length} nodes, ${tree.edges.length} edges)`,
  );
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
