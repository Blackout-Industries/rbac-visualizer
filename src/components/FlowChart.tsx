import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import { ArrowDown, X } from 'lucide-react';
import 'reactflow/dist/style.css';
import { useRbacContext } from '@/state/context';
import {
  buildFlowGraph,
  describeEdgeChain,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from '@/lib/flow-graph';
import { roleIsClusterAdminLike, verbSeverityColor } from '@/lib/severity';
import { SubjectNode, type SubjectNodeData } from '@/components/flow/nodes/SubjectNode';
import { BindingNode, type BindingNodeData } from '@/components/flow/nodes/BindingNode';
import { RoleNode, type RoleNodeData } from '@/components/flow/nodes/RoleNode';
import { RuleNode, type RuleNodeData } from '@/components/flow/nodes/RuleNode';
import { ResourceNode, type ResourceNodeData } from '@/components/flow/nodes/ResourceNode';
import { FlowSidebar } from '@/components/flow/FlowSidebar';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 76;

const nodeTypes = {
  subject: SubjectNode,
  binding: BindingNode,
  role: RoleNode,
  rule: RuleNode,
  resource: ResourceNode,
};

type RfNode = Node<SubjectNodeData | BindingNodeData | RoleNodeData | RuleNodeData | ResourceNodeData>;

interface EdgePopover {
  edgeId: string;
  x: number;
  y: number;
  text: string;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

function runDagre(flow: FlowGraph): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 120, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of flow.nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of flow.edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of flow.nodes) {
    const node = g.node(n.id);
    if (!node) continue;
    positions.set(n.id, {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - NODE_HEIGHT / 2,
    });
  }
  return { positions };
}

export function FlowChart() {
  const { state } = useRbacContext();
  const { graph } = state;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [edgePopover, setEdgePopover] = useState<EdgePopover | null>(null);

  const flow = useMemo<FlowGraph | null>(() => {
    if (!graph) return null;
    return buildFlowGraph(graph);
  }, [graph]);

  // Reset focus / hover when the graph reloads.
  useEffect(() => {
    setHoveredNodeId(null);
    setFocusedNodeId(null);
    setEdgePopover(null);
  }, [graph]);

  const layout = useMemo(() => {
    if (!flow) return null;
    return runDagre(flow);
  }, [flow]);

  // Determine which node ids are "active" — based on hover or focus.
  const activeIds = useMemo<Set<string> | null>(() => {
    if (!flow) return null;
    const driverId = focusedNodeId ?? hoveredNodeId;
    if (!driverId) return null;
    return flow.chains.get(driverId) ?? null;
  }, [flow, focusedNodeId, hoveredNodeId]);

  const rfNodes = useMemo<RfNode[]>(() => {
    if (!flow || !graph || !layout) return [];
    const out: RfNode[] = [];
    for (const node of flow.nodes) {
      const pos = layout.positions.get(node.id) ?? { x: 0, y: 0 };
      const dim = activeIds !== null && !activeIds.has(node.id);
      const data = buildNodeData(node, graph, dim, focusedNodeId === node.id);
      if (!data) continue;
      out.push({
        id: node.id,
        type: node.layer,
        position: pos,
        data,
      });
    }
    return out;
  }, [flow, graph, layout, activeIds, focusedNodeId]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!flow) return [];
    return flow.edges.map(e => toRfEdge(e, activeIds));
  }, [flow, activeIds]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    setHoveredNodeId(node.id);
  }, []);
  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setEdgePopover(null);
    setFocusedNodeId(prev => (prev === node.id ? null : node.id));
  }, []);

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      if (!flow) return;
      const flowEdge = flow.edges.find(e => e.id === edge.id);
      if (!flowEdge) return;
      const text = describeEdgeChain(flowEdge);
      if (!text) return;
      const target = event.currentTarget as SVGElement | null;
      const rect = target?.ownerSVGElement?.getBoundingClientRect();
      const containerRect = (target?.closest('.flow-chart-canvas') as HTMLElement | null)?.getBoundingClientRect();
      const baseRect = containerRect ?? rect;
      const x = baseRect ? event.clientX - baseRect.left : event.clientX;
      const y = baseRect ? event.clientY - baseRect.top : event.clientY;
      setEdgePopover({ edgeId: edge.id, x, y, text });
    },
    [flow],
  );

  const handlePaneClick = useCallback(() => {
    setFocusedNodeId(null);
    setEdgePopover(null);
  }, []);

  const focusSubject = useCallback((subjectId: string) => {
    setFocusedNodeId(subjectId);
    setEdgePopover(null);
  }, []);

  const focusResource = useCallback((resourceId: string) => {
    setFocusedNodeId(resourceId);
    setEdgePopover(null);
  }, []);

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center text-text-secondary">
          <p className="text-sm">paste rbac yaml below to see the flow</p>
          <ArrowDown size={20} className="animate-bounce text-accent" />
        </div>
      </div>
    );
  }

  if (!flow || flow.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        no bindings reach a role — nothing to chart.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <aside className="w-60 shrink-0">
        <FlowSidebar
          flow={flow}
          graph={graph}
          onFocusSubject={focusSubject}
          onFocusResource={focusResource}
          focusedNodeId={focusedNodeId}
        />
      </aside>
      <div className="relative flex-1 flow-chart-canvas">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={24} color="var(--theme-divider)" />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.4)" />
        </ReactFlow>

        {focusedNodeId && (
          <button
            type="button"
            className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-input-border bg-surface px-3 py-1 text-[11px] text-text-primary shadow-md hover:bg-glow"
            onClick={() => setFocusedNodeId(null)}
          >
            <X size={11} /> clear focus
          </button>
        )}

        {edgePopover && (
          <div
            className="absolute z-30 max-w-sm rounded-md border border-input-border bg-surface p-3 shadow-xl"
            style={{ left: edgePopover.x + 8, top: edgePopover.y + 8 }}
          >
            <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-secondary">
              <span>grant chain</span>
              <button
                type="button"
                onClick={() => setEdgePopover(null)}
                className="text-text-secondary hover:text-text-primary"
                aria-label="close"
              >
                <X size={11} />
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-primary">
              {edgePopover.text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function buildNodeData(
  node: FlowNode,
  graph: NonNullable<ReturnType<typeof useRbacContext>['state']['graph']>,
  dim: boolean,
  selected: boolean,
): SubjectNodeData | BindingNodeData | RoleNodeData | RuleNodeData | ResourceNodeData | null {
  switch (node.layer) {
    case 'subject':
      return { subject: node.subject, severity: node.severity, dim, selected };
    case 'binding':
      return { binding: node.binding, dim };
    case 'role':
      return {
        role: node.role,
        adminLike: roleIsClusterAdminLike(node.role, graph),
        dim,
      };
    case 'rule':
      return {
        rule: node.rule,
        severity: node.severity,
        ruleIndex: node.ruleIndex,
        dim,
      };
    case 'resource':
      return {
        apiGroup: node.apiGroup,
        resource: node.resource,
        dim,
        highlighted: selected,
      };
    default:
      return null;
  }
}

function toRfEdge(e: FlowEdge, activeIds: Set<string> | null): Edge {
  const active = activeIds === null || (activeIds.has(e.source) && activeIds.has(e.target));
  const isVerbEdge = e.kind === 'rule-resource';
  const color = isVerbEdge && e.verbSeverity
    ? verbSeverityColor(e.verbSeverity)
    : e.kind === 'role-rule'
      ? 'var(--theme-text-secondary)'
      : 'var(--theme-accent)';
  const dashed = e.kind === 'role-rule';
  const label = isVerbEdge ? formatVerbLabel(e.verbs ?? []) : undefined;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    pathOptions: { borderRadius: 12 },
    animated: false,
    label,
    labelStyle: {
      fontSize: 9,
      fill: color,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    labelBgStyle: {
      fill: 'var(--theme-surface)',
      opacity: 0.85,
    },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 11,
      height: 11,
      color,
    },
    style: {
      stroke: color,
      strokeWidth: isVerbEdge ? 1.5 : 1,
      strokeDasharray: dashed ? '4 3' : undefined,
      opacity: active ? 0.85 : 0.12,
    },
  };
}

function formatVerbLabel(verbs: string[]): string {
  if (verbs.length === 0) return '';
  if (verbs.includes('*')) return '*';
  if (verbs.length <= 3) return verbs.join(' / ');
  return `${verbs.slice(0, 3).join(' / ')} +${verbs.length - 3}`;
}
