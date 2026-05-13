import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  summariseBindings,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from '@/lib/flow-graph';
import { roleIsClusterAdminLike, verbSeverityColor } from '@/lib/severity';
import { SubjectNode, type SubjectNodeData } from '@/components/flow/nodes/SubjectNode';
import { RoleNode, type RoleNodeData } from '@/components/flow/nodes/RoleNode';
import {
  ResourceNode,
  type ResourceNodeData,
  isSensitiveResource,
} from '@/components/flow/nodes/ResourceNode';
import { FlowSidebar } from '@/components/flow/FlowSidebar';

const SUBJECT_WIDTH = 180;
const SUBJECT_HEIGHT = 64;
const RESOURCE_WIDTH = 168;
const RESOURCE_HEIGHT = 52;
const ROLE_WIDTH = 252;
const ROLE_HEADER_HEIGHT = 70;
const ROLE_RULE_ROW = 16;
const ROLE_RULE_PAD = 10;

const nodeTypes = {
  subject: SubjectNode,
  role: RoleNode,
  resource: ResourceNode,
};

type RfNode = Node<SubjectNodeData | RoleNodeData | ResourceNodeData>;

interface EdgePopover {
  edgeId: string;
  x: number;
  y: number;
  text: string;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  dimensions: Map<string, { w: number; h: number }>;
}

function nodeDimensions(node: FlowNode): { w: number; h: number } {
  if (node.layer === 'subject') return { w: SUBJECT_WIDTH, h: SUBJECT_HEIGHT };
  if (node.layer === 'resource') return { w: RESOURCE_WIDTH, h: RESOURCE_HEIGHT };
  // role — grows with rules
  const ruleCount = node.rules.length;
  const h = ROLE_HEADER_HEIGHT + ROLE_RULE_PAD + ruleCount * ROLE_RULE_ROW + ROLE_RULE_PAD;
  return { w: ROLE_WIDTH, h: Math.max(h, 96) };
}

function runDagre(flow: FlowGraph): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const dimensions = new Map<string, { w: number; h: number }>();
  for (const n of flow.nodes) {
    const dim = nodeDimensions(n);
    dimensions.set(n.id, dim);
    g.setNode(n.id, { width: dim.w, height: dim.h });
  }
  for (const e of flow.edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of flow.nodes) {
    const node = g.node(n.id);
    if (!node) continue;
    const dim = dimensions.get(n.id) ?? { w: 0, h: 0 };
    positions.set(n.id, {
      x: node.x - dim.w / 2,
      y: node.y - dim.h / 2,
    });
  }
  return { positions, dimensions };
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

  useEffect(() => {
    setHoveredNodeId(null);
    setFocusedNodeId(null);
    setEdgePopover(null);
  }, [graph]);

  const layout = useMemo(() => {
    if (!flow) return null;
    return runDagre(flow);
  }, [flow]);

  const activeIds = useMemo<Set<string> | null>(() => {
    if (!flow) return null;
    const driverId = focusedNodeId ?? hoveredNodeId;
    if (!driverId) return null;
    return flow.chains.get(driverId) ?? null;
  }, [flow, focusedNodeId, hoveredNodeId]);

  // Identity-preserving node + edge builders. Hover flicker was caused by
  // every render emitting a fresh `data` object for every node — even if
  // dim/selected didn't change for that specific node. React.memo on the
  // node components can't help if their props always look new. We cache the
  // previous RfNode per id and reuse it verbatim when dim/selected/pos
  // haven't changed. Same trick for edges.
  const prevNodesRef = useRef<Map<string, RfNode>>(new Map());
  const prevEdgesRef = useRef<Map<string, Edge>>(new Map());

  const rfNodes = useMemo<RfNode[]>(() => {
    if (!flow || !graph || !layout) return [];
    const next = new Map<string, RfNode>();
    const out: RfNode[] = [];
    for (const node of flow.nodes) {
      const pos = layout.positions.get(node.id) ?? { x: 0, y: 0 };
      const dim = activeIds !== null && !activeIds.has(node.id);
      const selected = focusedNodeId === node.id;
      const prev = prevNodesRef.current.get(node.id);
      const prevData = prev?.data as
        | { dim?: boolean; selected?: boolean }
        | undefined;
      if (
        prev &&
        prev.position.x === pos.x &&
        prev.position.y === pos.y &&
        prevData?.dim === dim &&
        prevData?.selected === selected
      ) {
        next.set(node.id, prev);
        out.push(prev);
        continue;
      }
      const data = buildNodeData(node, graph, dim, selected);
      if (!data) continue;
      const rf: RfNode = { id: node.id, type: node.layer, position: pos, data };
      next.set(node.id, rf);
      out.push(rf);
    }
    prevNodesRef.current = next;
    return out;
  }, [flow, graph, layout, activeIds, focusedNodeId]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!flow) return [];
    const next = new Map<string, Edge>();
    const out: Edge[] = [];
    for (const e of flow.edges) {
      const active = activeIds === null
        ? true
        : activeIds.has(e.source) && activeIds.has(e.target);
      const prev = prevEdgesRef.current.get(e.id);
      // Edge identity is stable if (active state, source, target) all match.
      // Encode active state on the edge as a custom field for the comparison.
      const prevActive = (prev as Edge & { _active?: boolean } | undefined)?._active;
      if (prev && prevActive === active) {
        next.set(e.id, prev);
        out.push(prev);
        continue;
      }
      const rf = toRfEdge(e, activeIds);
      (rf as Edge & { _active: boolean })._active = active;
      next.set(e.id, rf);
      out.push(rf);
    }
    prevEdgesRef.current = next;
    return out;
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
      const containerRect = (target?.closest('.flow-chart-canvas') as HTMLElement | null)?.getBoundingClientRect();
      const baseRect = containerRect ?? target?.ownerSVGElement?.getBoundingClientRect();
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
          minZoom={0.2}
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
            className="absolute z-30 max-w-md rounded-md border border-input-border bg-surface p-3 shadow-xl"
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
): SubjectNodeData | RoleNodeData | ResourceNodeData | null {
  switch (node.layer) {
    case 'subject':
      return { subject: node.subject, severity: node.severity, dim, selected };
    case 'role':
      return {
        role: node.role,
        bindings: node.bindings,
        rules: node.rules,
        severity: node.severity,
        adminLike: roleIsClusterAdminLike(node.role, graph),
        dim,
        selected,
      };
    case 'resource':
      return {
        apiGroup: node.apiGroup,
        resource: node.resource,
        dim,
        highlighted: selected,
        sensitive: isSensitiveResource(node.apiGroup, node.resource),
      };
    default:
      return null;
  }
}

function toRfEdge(e: FlowEdge, activeIds: Set<string> | null): Edge {
  const active = activeIds === null || (activeIds.has(e.source) && activeIds.has(e.target));
  const isVerbEdge = e.kind === 'role-resource';
  const color = isVerbEdge && e.verbSeverity
    ? verbSeverityColor(e.verbSeverity)
    : 'var(--theme-text-secondary)';
  const label = isVerbEdge
    ? formatVerbLabel(e.verbs ?? [])
    : summariseBindings(e.bindings);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    pathOptions: { borderRadius: 14 },
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
      width: 10,
      height: 10,
      color,
    },
    style: {
      stroke: color,
      strokeWidth: isVerbEdge ? 1.4 : 1,
      strokeDasharray: e.kind === 'subject-role' ? '3 3' : undefined,
      opacity: active ? 0.8 : 0.1,
    },
  };
}

function formatVerbLabel(verbs: string[]): string {
  if (verbs.length === 0) return '';
  if (verbs.includes('*')) return '*';
  if (verbs.length <= 3) return verbs.join('/');
  return `${verbs.slice(0, 3).join('/')} +${verbs.length - 3}`;
}
