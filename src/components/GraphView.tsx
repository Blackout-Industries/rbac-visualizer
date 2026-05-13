import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useRbacContext } from '@/state/context';
import { setSelected } from '@/state/actions';
import { effectiveRules } from '@/lib/aggregation';
import type { Role } from '@/types/rbac';

interface RbacNodeData {
  label: string;
  sublabel?: string;
  kind: 'subject' | 'role' | 'resource';
  selected: boolean;
}

function RbacNode({ data }: NodeProps<RbacNodeData>) {
  const palette = {
    subject: { bg: 'rgba(0, 229, 255, 0.12)', border: 'var(--theme-accent)', text: 'var(--theme-text-primary)' },
    role: { bg: 'rgba(255, 215, 0, 0.12)', border: '#ffd700', text: 'var(--theme-text-primary)' },
    resource: { bg: 'rgba(57, 255, 20, 0.10)', border: '#39ff14', text: 'var(--theme-text-primary)' },
  }[data.kind];
  const ring = data.selected ? '0 0 0 2px var(--theme-accent)' : 'none';
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        minWidth: 140,
        boxShadow: ring,
      }}
    >
      <div className="font-semibold truncate" style={{ maxWidth: 220 }}>
        {data.label}
      </div>
      {data.sublabel && (
        <div className="text-[10px] opacity-70 truncate" style={{ maxWidth: 220 }}>
          {data.sublabel}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { rbac: RbacNode };

const COL_WIDTH = 320;
const ROW_HEIGHT = 70;

function rulesSummary(role: Role, graph: ReturnType<typeof useRbacContext>['state']['graph']): string[] {
  if (!graph) return [];
  const rules = effectiveRules(role, graph);
  const out = new Set<string>();
  for (const r of rules) {
    for (const res of r.resources ?? []) {
      out.add(res);
    }
    for (const url of r.nonResourceURLs ?? []) {
      out.add(`url:${url}`);
    }
  }
  return Array.from(out);
}

function ruleMatchesFilter(
  role: Role,
  graph: ReturnType<typeof useRbacContext>['state']['graph'],
  filter: ReturnType<typeof useRbacContext>['state']['filter'],
): boolean {
  if (!graph) return false;
  const verbFilter = filter.verbs;
  const resFilter = filter.resource;
  if (verbFilter.size === 0 && resFilter === 'all') return true;
  const rules = effectiveRules(role, graph);
  for (const rule of rules) {
    const verbsOk =
      verbFilter.size === 0 ||
      (rule.verbs ?? []).some(v => v === '*' || verbFilter.has(v));
    const resOk =
      resFilter === 'all' ||
      (resFilter === '*' && (rule.resources ?? []).includes('*')) ||
      (rule.resources ?? []).some(r => r === resFilter || r === '*');
    if (verbsOk && resOk) return true;
  }
  return false;
}

export function GraphView() {
  const { state, dispatch } = useRbacContext();
  const { graph, filter, selectedId } = state;

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node<RbacNodeData>[], edges: [] as Edge[] };

    const subjectNodes: Node<RbacNodeData>[] = [];
    const roleNodes: Node<RbacNodeData>[] = [];
    const resourceNodes: Node<RbacNodeData>[] = [];
    const edges: Edge[] = [];

    const namespaceFilter = filter.namespace;
    const includedBindings = graph.bindings.filter(b => {
      if (namespaceFilter === 'all') return true;
      if (b.scope === 'ClusterRoleBinding') return true;
      return b.namespace === namespaceFilter;
    });

    const usedSubjects = new Map<string, (typeof graph.subjects)[number]>();
    const usedRoles = new Map<string, Role>();
    for (const b of includedBindings) {
      const role = graph.roles.find(
        r =>
          r.name === b.roleRef.name &&
          r.scope === b.roleRef.kind &&
          (r.scope === 'ClusterRole' ? true : r.namespace === b.namespace),
      );
      if (!role) continue;
      if (!ruleMatchesFilter(role, graph, filter)) continue;
      usedRoles.set(role.id, role);
      for (const s of b.subjects) {
        usedSubjects.set(s.id, s);
      }
    }

    let row = 0;
    for (const s of usedSubjects.values()) {
      subjectNodes.push({
        id: s.id,
        type: 'rbac',
        position: { x: 0, y: row * ROW_HEIGHT },
        data: {
          label: s.name,
          sublabel: s.namespace ? `${s.kind} · ${s.namespace}` : s.kind,
          kind: 'subject',
          selected: selectedId === s.id,
        },
      });
      row++;
    }

    row = 0;
    const resourceIds = new Map<string, Node<RbacNodeData>>();
    for (const r of usedRoles.values()) {
      roleNodes.push({
        id: r.id,
        type: 'rbac',
        position: { x: COL_WIDTH, y: row * ROW_HEIGHT },
        data: {
          label: r.name,
          sublabel: r.scope + (r.namespace ? ` · ${r.namespace}` : ''),
          kind: 'role',
          selected: selectedId === r.id,
        },
      });
      row++;

      for (const res of rulesSummary(r, graph)) {
        const id = `resource/${res}`;
        if (!resourceIds.has(id)) {
          resourceIds.set(id, {
            id,
            type: 'rbac',
            position: { x: COL_WIDTH * 2, y: resourceIds.size * ROW_HEIGHT },
            data: {
              label: res,
              sublabel: 'resource',
              kind: 'resource',
              selected: false,
            },
          });
        }
        edges.push({
          id: `${r.id}->${id}`,
          source: r.id,
          target: id,
          type: 'smoothstep',
          pathOptions: { borderRadius: 12 },
          style: {
            stroke: 'var(--theme-arrow-allow)',
            strokeWidth: 1.5,
            opacity: 0.55,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--theme-arrow-allow)',
            width: 12,
            height: 12,
          },
        });
      }
    }
    resourceNodes.push(...resourceIds.values());

    for (const b of includedBindings) {
      const role = Array.from(usedRoles.values()).find(
        r =>
          r.name === b.roleRef.name &&
          r.scope === b.roleRef.kind &&
          (r.scope === 'ClusterRole' ? true : r.namespace === b.namespace),
      );
      if (!role) continue;
      for (const s of b.subjects) {
        if (!usedSubjects.has(s.id)) continue;
        edges.push({
          id: `${s.id}-${b.id}->${role.id}`,
          source: s.id,
          target: role.id,
          type: 'smoothstep',
          pathOptions: { borderRadius: 12 },
          label: b.scope === 'ClusterRoleBinding' ? 'CRB' : `RB·${b.namespace}`,
          labelStyle: { fontSize: 9, fill: 'var(--theme-text-secondary)' },
          style: {
            stroke: 'var(--theme-accent)',
            strokeWidth: 1.5,
            opacity: 0.55,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--theme-accent)',
            width: 12,
            height: 12,
          },
        });
      }
    }

    return { nodes: [...subjectNodes, ...roleNodes, ...resourceNodes], edges };
  }, [graph, filter, selectedId]);

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        Paste or upload RBAC YAML to render the graph.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No RBAC objects match the current filters.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => dispatch(setSelected(node.id))}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} color="var(--theme-divider)" />
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.4)" />
      </ReactFlow>
    </div>
  );
}
