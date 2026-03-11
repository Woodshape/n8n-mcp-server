import type {
  Workflow,
  WorkflowNode,
  ConnectionEdge,
} from "./types.js";

export interface WorkflowOutline {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number;
  nodes: { name: string; type: string; disabled?: boolean }[];
  connections: ConnectionEdge[];
  tags?: string[];
}

export function getOutline(workflow: Workflow): WorkflowOutline {
  const nodes = workflow.nodes.map((n) => ({
    name: n.name,
    type: n.type,
    ...(n.disabled ? { disabled: true } : {}),
  }));

  const connections = flattenConnections(workflow);

  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    nodeCount: workflow.nodes.length,
    nodes,
    connections,
    ...(workflow.tags?.length
      ? { tags: workflow.tags.map((t) => t.name) }
      : {}),
  };
}

export function findNodes(
  workflow: Workflow,
  opts: { name?: string; type?: string },
): WorkflowNode[] {
  return workflow.nodes.filter((n) => {
    if (opts.name && n.name !== opts.name) return false;
    if (opts.type && !n.type.toLowerCase().includes(opts.type.toLowerCase()))
      return false;
    return true;
  });
}

export function getNodeConnections(
  workflow: Workflow,
  nodeName: string,
): { incoming: ConnectionEdge[]; outgoing: ConnectionEdge[] } {
  const all = flattenConnections(workflow);
  return {
    incoming: all.filter((e) => e.to === nodeName),
    outgoing: all.filter((e) => e.from === nodeName),
  };
}

function flattenConnections(workflow: Workflow): ConnectionEdge[] {
  const edges: ConnectionEdge[] = [];
  const conns = workflow.connections;
  if (!conns) return edges;

  for (const sourceName of Object.keys(conns)) {
    const outputs = conns[sourceName];
    for (const outputType of Object.keys(outputs)) {
      const outputGroups = outputs[outputType];
      for (let outputIndex = 0; outputIndex < outputGroups.length; outputIndex++) {
        const targets = outputGroups[outputIndex];
        if (!targets) continue;
        for (const target of targets) {
          edges.push({
            from: sourceName,
            to: target.node,
            ...(outputIndex > 0 ? { fromOutput: outputIndex } : {}),
            ...(target.index > 0 ? { toInput: target.index } : {}),
          });
        }
      }
    }
  }

  return edges;
}
