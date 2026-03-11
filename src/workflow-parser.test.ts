import { describe, it, expect } from "vitest";
import { validateWorkflow, flattenConnectionsRaw, getOutline, findNodes, getNodeConnections } from "./workflow-parser.js";
import type { Workflow, WorkflowNode, WorkflowConnections } from "./types.js";
import phonemoFixture from "./fixtures/phonemo-workflow.json";

const phonemo = phonemoFixture as unknown as Workflow;

function makeNode(
  name: string,
  type: string = "n8n-nodes-base.code",
): WorkflowNode {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
  };
}

function makeConnections(
  edges: { from: string; to: string; outputIndex?: number; inputIndex?: number }[],
): WorkflowConnections {
  const conns: WorkflowConnections = {};
  for (const edge of edges) {
    if (!conns[edge.from]) conns[edge.from] = {};
    if (!conns[edge.from].main) conns[edge.from].main = [];
    const outputIdx = edge.outputIndex ?? 0;
    while (conns[edge.from].main.length <= outputIdx) {
      conns[edge.from].main.push([]);
    }
    conns[edge.from].main[outputIdx].push({
      node: edge.to,
      type: "main",
      index: edge.inputIndex ?? 0,
    });
  }
  return conns;
}

// --- flattenConnectionsRaw ---

describe("flattenConnectionsRaw", () => {
  it("returns empty array for empty connections", () => {
    expect(flattenConnectionsRaw({})).toEqual([]);
  });

  it("returns empty array for null/undefined connections", () => {
    expect(flattenConnectionsRaw(null as unknown as WorkflowConnections)).toEqual([]);
    expect(flattenConnectionsRaw(undefined as unknown as WorkflowConnections)).toEqual([]);
  });

  it("flattens a simple A -> B connection", () => {
    const conns = makeConnections([{ from: "A", to: "B" }]);
    const edges = flattenConnectionsRaw(conns);
    expect(edges).toEqual([{ from: "A", to: "B" }]);
  });

  it("flattens multiple connections from the same source", () => {
    const conns = makeConnections([
      { from: "A", to: "B" },
      { from: "A", to: "C" },
    ]);
    const edges = flattenConnectionsRaw(conns);
    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({ from: "A", to: "B" });
    expect(edges).toContainEqual({ from: "A", to: "C" });
  });

  it("includes fromOutput for non-zero output indices", () => {
    const conns = makeConnections([
      { from: "IF", to: "True Branch", outputIndex: 0 },
      { from: "IF", to: "False Branch", outputIndex: 1 },
    ]);
    const edges = flattenConnectionsRaw(conns);
    expect(edges).toContainEqual({ from: "IF", to: "True Branch" });
    expect(edges).toContainEqual({ from: "IF", to: "False Branch", fromOutput: 1 });
  });

  it("includes toInput for non-zero input indices", () => {
    const conns = makeConnections([
      { from: "A", to: "Merge", inputIndex: 0 },
      { from: "B", to: "Merge", inputIndex: 1 },
    ]);
    const edges = flattenConnectionsRaw(conns);
    expect(edges).toContainEqual({ from: "A", to: "Merge" });
    expect(edges).toContainEqual({ from: "B", to: "Merge", toInput: 1 });
  });

  it("handles sparse output groups (null entries)", () => {
    const conns: WorkflowConnections = {
      A: { main: [null as unknown as [], [{ node: "B", type: "main", index: 0 }]] },
    };
    const edges = flattenConnectionsRaw(conns);
    expect(edges).toEqual([{ from: "A", to: "B", fromOutput: 1 }]);
  });
});

// --- validateWorkflow ---

describe("validateWorkflow", () => {
  describe("valid workflows", () => {
    it("passes a simple linear workflow", () => {
      const nodes = [
        makeNode("Trigger", "n8n-nodes-base.manualTrigger"),
        makeNode("Code"),
        makeNode("Output", "n8n-nodes-base.respondToWebhook"),
      ];
      const conns = makeConnections([
        { from: "Trigger", to: "Code" },
        { from: "Code", to: "Output" },
      ]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("passes a workflow with no connections", () => {
      const nodes = [makeNode("Trigger", "n8n-nodes-base.manualTrigger")];
      const result = validateWorkflow(nodes, {});
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      // Trigger nodes don't produce orphan warnings
      expect(result.warnings).toEqual([]);
    });

    it("passes an empty workflow", () => {
      const result = validateWorkflow([], {});
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("connection errors", () => {
    it("errors when connection source node is missing", () => {
      const nodes = [makeNode("B")];
      const conns = makeConnections([{ from: "A", to: "B" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("A");
      expect(result.errors[0]).toContain("source");
    });

    it("errors when connection target node is missing", () => {
      const nodes = [makeNode("A")];
      const conns = makeConnections([{ from: "A", to: "B" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("B");
      expect(result.errors[0]).toContain("target");
    });

    it("errors when both source and target are missing", () => {
      const nodes: WorkflowNode[] = [];
      const conns = makeConnections([{ from: "A", to: "B" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("reports multiple missing node errors", () => {
      const nodes = [makeNode("A")];
      const conns = makeConnections([
        { from: "A", to: "Missing1" },
        { from: "A", to: "Missing2" },
      ]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Missing1");
      expect(result.errors[1]).toContain("Missing2");
    });

    it("deduplicates correctly — same missing node referenced multiple times", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const conns = makeConnections([
        { from: "A", to: "Ghost" },
        { from: "B", to: "Ghost" },
      ]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      // Each edge generates its own error (no dedup in the implementation)
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.includes("Ghost"))).toBe(true);
    });
  });

  describe("orphaned node warnings", () => {
    it("warns about non-trigger nodes with no connections", () => {
      const nodes = [
        makeNode("Trigger", "n8n-nodes-base.manualTrigger"),
        makeNode("Connected"),
        makeNode("Orphan", "n8n-nodes-base.code"),
      ];
      const conns = makeConnections([{ from: "Trigger", to: "Connected" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Orphan");
    });

    it("does not warn about trigger nodes without connections", () => {
      const nodes = [
        makeNode("Manual Trigger", "n8n-nodes-base.manualTrigger"),
        makeNode("Webhook", "n8n-nodes-base.webhook"),
        makeNode("Schedule", "n8n-nodes-base.scheduleTrigger"),
      ];
      const result = validateWorkflow(nodes, {});
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("does not warn about nodes that appear in connections", () => {
      const nodes = [
        makeNode("A", "n8n-nodes-base.code"),
        makeNode("B", "n8n-nodes-base.code"),
      ];
      const conns = makeConnections([{ from: "A", to: "B" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("warns about multiple orphaned nodes", () => {
      const nodes = [
        makeNode("Orphan1", "n8n-nodes-base.code"),
        makeNode("Orphan2", "n8n-nodes-base.httpRequest"),
      ];
      const result = validateWorkflow(nodes, {});
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe("mixed errors and warnings", () => {
    it("returns both errors and warnings when both are present", () => {
      const nodes = [
        makeNode("A", "n8n-nodes-base.code"),
        makeNode("Orphan", "n8n-nodes-base.code"),
      ];
      const conns = makeConnections([{ from: "A", to: "Missing" }]);
      const result = validateWorkflow(nodes, conns);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Missing");
      expect(result.warnings[0]).toContain("Orphan");
    });
  });

  describe("trigger type detection", () => {
    it.each([
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.scheduleTrigger",
      "n8n-nodes-base.emailTrigger",
      "@n8n/n8n-nodes-langchain.manualChatTrigger",
    ])("recognizes %s as trigger (no orphan warning)", (type) => {
      const nodes = [makeNode("TriggerNode", type)];
      const result = validateWorkflow(nodes, {});
      expect(result.warnings).toEqual([]);
    });

    it.each([
      "n8n-nodes-base.code",
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.if",
      "n8n-nodes-base.set",
    ])("treats %s as non-trigger (warns when orphaned)", (type) => {
      const nodes = [makeNode("Node", type)];
      const result = validateWorkflow(nodes, {});
      expect(result.warnings).toHaveLength(1);
    });
  });
});

// --- Phonemo fixture tests (real workflow structure) ---

describe("phonemo fixture", () => {
  describe("flattenConnectionsRaw", () => {
    it("extracts all 23 edges from the workflow", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      expect(edges).toHaveLength(23);
    });

    it("extracts IF node branching (Route Input has 2 outputs)", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      const routeInputEdges = edges.filter((e) => e.from === "Route Input");
      expect(routeInputEdges).toHaveLength(2);
      expect(routeInputEdges).toContainEqual({ from: "Route Input", to: "Fetch YouTube Transcript" });
      expect(routeInputEdges).toContainEqual({ from: "Route Input", to: "Get File Info", fromOutput: 1 });
    });

    it("extracts IF node branching (Route Output has 2 outputs)", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      const routeOutputEdges = edges.filter((e) => e.from === "Route Output");
      expect(routeOutputEdges).toHaveLength(2);
      expect(routeOutputEdges).toContainEqual({ from: "Route Output", to: "Send Result" });
      expect(routeOutputEdges).toContainEqual({ from: "Route Output", to: "Test Generate PDF", fromOutput: 1 });
    });

    it("extracts converging paths (Merge Transcripts has 2 incoming)", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      const mergeIncoming = edges.filter((e) => e.to === "Merge Transcripts");
      expect(mergeIncoming).toHaveLength(2);
      expect(mergeIncoming.map((e) => e.from).sort()).toEqual(["Fetch YouTube Transcript", "Transcribe Chunk"]);
    });

    it("identifies two entry points", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      const sources = new Set(edges.map((e) => e.from));
      const targets = new Set(edges.map((e) => e.to));
      const entryPoints = [...sources].filter((s) => !targets.has(s));
      expect(entryPoints.sort()).toEqual(["Telegram Trigger", "Webhook"]);
    });

    it("identifies two terminal nodes", () => {
      const edges = flattenConnectionsRaw(phonemo.connections);
      const sources = new Set(edges.map((e) => e.from));
      const targets = new Set(edges.map((e) => e.to));
      const terminals = [...targets].filter((t) => !sources.has(t));
      expect(terminals.sort()).toEqual(["Respond to Webhook", "Send PDF"]);
    });
  });

  describe("validateWorkflow", () => {
    it("passes the intact Phonemo workflow with no errors", () => {
      const result = validateWorkflow(phonemo.nodes, phonemo.connections);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("errors when Route Input node is removed but still referenced in connections", () => {
      const nodesWithout = phonemo.nodes.filter((n) => n.name !== "Route Input");
      const result = validateWorkflow(nodesWithout, phonemo.connections);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Route Input"))).toBe(true);
    });

    it("errors when a mid-chain node is removed (Merge Transcripts)", () => {
      const nodesWithout = phonemo.nodes.filter((n) => n.name !== "Merge Transcripts");
      const result = validateWorkflow(nodesWithout, phonemo.connections);
      expect(result.valid).toBe(false);
      // Referenced as both source (to Prepare Summary Request) and target (from Transcribe Chunk, Fetch YouTube Transcript)
      const mergeErrors = result.errors.filter((e) => e.includes("Merge Transcripts"));
      expect(mergeErrors.length).toBeGreaterThanOrEqual(2);
    });

    it("errors when a terminal node is removed (Send PDF)", () => {
      const nodesWithout = phonemo.nodes.filter((n) => n.name !== "Send PDF");
      const result = validateWorkflow(nodesWithout, phonemo.connections);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Send PDF") && e.includes("target"))).toBe(true);
    });

    it("warns about orphaned node when connections are severed", () => {
      // Remove Extract Audio from both sides: as source (Extract Audio ->) and as target (Telegram Trigger ->)
      const modifiedConns = JSON.parse(JSON.stringify(phonemo.connections)) as WorkflowConnections;
      delete modifiedConns["Extract Audio"];
      delete modifiedConns["Telegram Trigger"];
      const result = validateWorkflow(phonemo.nodes, modifiedConns);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("Extract Audio"))).toBe(true);
    });

    it("errors when multiple nodes are removed", () => {
      const removedNames = new Set(["Route Input", "Route Output", "Route Webhook"]);
      const nodesWithout = phonemo.nodes.filter((n) => !removedNames.has(n.name));
      const result = validateWorkflow(nodesWithout, phonemo.connections);
      expect(result.valid).toBe(false);
      for (const name of removedNames) {
        expect(result.errors.some((e) => e.includes(name))).toBe(true);
      }
    });

    it("reports both errors and warnings when nodes are removed and connections severed", () => {
      // Remove Route Input (causes connection errors) and sever Extract Audio from both sides (makes it orphaned)
      const nodesWithout = phonemo.nodes.filter((n) => n.name !== "Route Input");
      const modifiedConns = JSON.parse(JSON.stringify(phonemo.connections)) as WorkflowConnections;
      delete modifiedConns["Extract Audio"];
      delete modifiedConns["Telegram Trigger"];
      const result = validateWorkflow(nodesWithout, modifiedConns);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Route Input"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("Extract Audio"))).toBe(true);
    });
  });

  describe("getOutline", () => {
    it("returns correct metadata", () => {
      const outline = getOutline(phonemo);
      expect(outline.id).toBe("tIfbOLa8RBZM9QmB");
      expect(outline.name).toBe("Phonemo");
      expect(outline.active).toBe(false);
      expect(outline.nodeCount).toBe(22);
    });

    it("lists all nodes with name and type", () => {
      const outline = getOutline(phonemo);
      expect(outline.nodes).toHaveLength(22);
      expect(outline.nodes.find((n) => n.name === "Route Input")).toEqual({
        name: "Route Input",
        type: "n8n-nodes-base.if",
      });
    });

    it("includes all 23 connection edges", () => {
      const outline = getOutline(phonemo);
      expect(outline.connections).toHaveLength(23);
    });
  });

  describe("findNodes", () => {
    it("finds a node by exact name", () => {
      const results = findNodes(phonemo, { name: "Route Input" });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("n8n-nodes-base.if");
    });

    it("finds all IF nodes by type", () => {
      const results = findNodes(phonemo, { type: "if" });
      expect(results).toHaveLength(3);
      expect(results.map((n) => n.name).sort()).toEqual(["Route Input", "Route Output", "Route Webhook"]);
    });

    it("finds all httpRequest nodes", () => {
      const results = findNodes(phonemo, { type: "httpRequest" });
      expect(results).toHaveLength(4);
    });

    it("finds all code nodes", () => {
      const results = findNodes(phonemo, { type: "code" });
      expect(results).toHaveLength(11);
    });

    it("returns empty for non-existent node", () => {
      expect(findNodes(phonemo, { name: "Does Not Exist" })).toEqual([]);
    });
  });

  describe("getNodeConnections", () => {
    it("returns incoming and outgoing for a mid-chain node", () => {
      const conns = getNodeConnections(phonemo, "Merge Transcripts");
      expect(conns.incoming).toHaveLength(2);
      expect(conns.incoming.map((e) => e.from).sort()).toEqual(["Fetch YouTube Transcript", "Transcribe Chunk"]);
      expect(conns.outgoing).toHaveLength(1);
      expect(conns.outgoing[0].to).toBe("Prepare Summary Request");
    });

    it("returns only outgoing for trigger nodes", () => {
      const conns = getNodeConnections(phonemo, "Telegram Trigger");
      expect(conns.incoming).toHaveLength(0);
      expect(conns.outgoing).toHaveLength(1);
      expect(conns.outgoing[0].to).toBe("Extract Audio");
    });

    it("returns only incoming for terminal nodes", () => {
      const conns = getNodeConnections(phonemo, "Send PDF");
      expect(conns.incoming).toHaveLength(1);
      expect(conns.incoming[0].from).toBe("Generate PDF");
      expect(conns.outgoing).toHaveLength(0);
    });

    it("returns branching outputs for IF nodes", () => {
      const conns = getNodeConnections(phonemo, "Route Input");
      expect(conns.incoming).toHaveLength(1);
      expect(conns.outgoing).toHaveLength(2);
      expect(conns.outgoing[0].to).toBe("Fetch YouTube Transcript");
      expect(conns.outgoing[1].to).toBe("Get File Info");
      expect(conns.outgoing[1].fromOutput).toBe(1);
    });

    it("returns empty for non-existent node", () => {
      const conns = getNodeConnections(phonemo, "Ghost Node");
      expect(conns.incoming).toEqual([]);
      expect(conns.outgoing).toEqual([]);
    });
  });
});
