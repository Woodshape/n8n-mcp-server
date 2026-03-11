export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
}

export interface ConnectionInfo {
  node: string;
  type: string;
  index: number;
}

export type WorkflowConnections = Record<
  string,
  Record<string, ConnectionInfo[][]>
>;

export interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  createdAt?: string;
  updatedAt?: string;
  tags?: { name: string }[];
}

export interface ConnectionEdge {
  from: string;
  to: string;
  fromOutput?: number;
  toInput?: number;
}
