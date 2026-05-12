import { useMemo } from 'react';
import { Download, Camera } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import { snapshotBaseline } from '@/state/actions';
import { effectiveRules } from '@/lib/aggregation';
import { genFullYaml } from '@/lib/rbac-gen';
import type { Binding, RbacGraph, Role, ServiceAccountObj } from '@/types/rbac';
import { ResourceList } from './ResourceList';
import { RoleEditor } from './RoleEditor';
import { BindingEditor } from './BindingEditor';
import { ServiceAccountEditor } from './ServiceAccountEditor';
import { YamlPanePerResource } from './YamlPanePerResource';

function saId(sa: ServiceAccountObj): string {
  return `ServiceAccount/${sa.namespace}/${sa.name}`;
}

interface Permission {
  subjectId: string;
  verb: string;
  resource: string;
  apiGroup: string;
  namespace: string; // "*" for cluster-wide
}

function permissionKey(p: Permission): string {
  return `${p.subjectId}|${p.verb}|${p.apiGroup}|${p.resource}|${p.namespace}`;
}

/**
 * Materialize every (subject, verb, resource, namespace, apiGroup) grant in
 * the graph as a flat set. This is intentionally a cartesian expansion across
 * rule arrays — wildcards stay as "*", so they only collide with themselves.
 */
function materializePermissions(graph: RbacGraph): Set<string> {
  const out = new Set<string>();
  for (const binding of graph.bindings) {
    const role = resolveRoleRef(binding, graph);
    if (!role) continue;
    const rules = effectiveRules(role, graph);
    const ns = binding.scope === 'ClusterRoleBinding' ? '*' : (binding.namespace ?? 'default');
    for (const rule of rules) {
      const verbs = rule.verbs ?? [];
      const apiGroups = rule.apiGroups ?? [''];
      const resources = rule.resources ?? [];
      const urls = rule.nonResourceURLs ?? [];
      for (const subject of binding.subjects) {
        for (const verb of verbs) {
          for (const g of apiGroups) {
            for (const r of resources) {
              out.add(
                permissionKey({
                  subjectId: subject.id,
                  verb,
                  apiGroup: g,
                  resource: r,
                  namespace: ns,
                }),
              );
            }
            for (const u of urls) {
              out.add(
                permissionKey({
                  subjectId: subject.id,
                  verb,
                  apiGroup: g,
                  resource: `nonResource:${u}`,
                  namespace: ns,
                }),
              );
            }
          }
        }
      }
    }
  }
  return out;
}

function resolveRoleRef(binding: Binding, graph: RbacGraph): Role | undefined {
  if (binding.roleRef.kind === 'ClusterRole') {
    return graph.roles.find(r => r.scope === 'ClusterRole' && r.name === binding.roleRef.name);
  }
  return graph.roles.find(
    r => r.scope === 'Role' && r.name === binding.roleRef.name && r.namespace === binding.namespace,
  );
}

function subjectIds(graph: RbacGraph): Set<string> {
  return new Set(graph.subjects.map(s => s.id));
}

function diffCount(a: Set<string>, b: Set<string>): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const k of b) if (!a.has(k)) added++;
  for (const k of a) if (!b.has(k)) removed++;
  return { added, removed };
}

export function BuilderTab() {
  const { state, dispatch } = useRbacContext();
  const { graph, baseline, selectedId } = state;

  const impact = useMemo(() => {
    if (!graph) return null;
    const cur = materializePermissions(graph);
    const base = baseline ? materializePermissions(baseline) : new Set<string>();
    const perm = diffCount(base, cur);
    const curSubs = subjectIds(graph);
    const baseSubs = baseline ? subjectIds(baseline) : new Set<string>();
    let newSubjects = 0;
    for (const s of curSubs) if (!baseSubs.has(s)) newSubjects++;
    return { ...perm, newSubjects };
  }, [graph, baseline]);

  const selection = useMemo(() => {
    if (!graph || !selectedId) return null;
    if (selectedId.startsWith('ServiceAccount/')) {
      const sa = graph.serviceAccounts.find(s => saId(s) === selectedId);
      return sa ? ({ kind: 'sa' as const, sa } as const) : null;
    }
    if (selectedId.startsWith('Role/') || selectedId.startsWith('ClusterRole/')) {
      const role = graph.roles.find(r => r.id === selectedId);
      return role ? ({ kind: 'role' as const, role } as const) : null;
    }
    if (selectedId.startsWith('RoleBinding/') || selectedId.startsWith('ClusterRoleBinding/')) {
      const b = graph.bindings.find(b => b.id === selectedId);
      return b ? ({ kind: 'binding' as const, binding: b } as const) : null;
    }
    return null;
  }, [graph, selectedId]);

  const downloadAll = () => {
    if (!graph) return;
    const text = genFullYaml(graph);
    const blob = new Blob([text], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rbac-bundle.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const dirty =
    impact !== null && (impact.added > 0 || impact.removed > 0 || impact.newSubjects > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-divider bg-surface px-4 py-2 text-xs">
        <span className="text-text-secondary">impact vs. last clean state</span>
        <Badge
          label="new permissions"
          value={impact?.added ?? 0}
          tone={impact && impact.added > 0 ? 'add' : 'neutral'}
        />
        <Badge
          label="removed permissions"
          value={impact?.removed ?? 0}
          tone={impact && impact.removed > 0 ? 'remove' : 'neutral'}
        />
        <Badge
          label="new subjects"
          value={impact?.newSubjects ?? 0}
          tone={impact && impact.newSubjects > 0 ? 'add' : 'neutral'}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => dispatch(snapshotBaseline())}
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow disabled:opacity-40"
            title="mark current state as the new clean baseline"
          >
            <Camera size={12} /> snapshot baseline
          </button>
          <button
            type="button"
            disabled={!graph || (graph.roles.length + graph.bindings.length + graph.serviceAccounts.length === 0)}
            onClick={downloadAll}
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow disabled:opacity-40"
          >
            <Download size={12} /> download all as yaml
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-divider">
          <ResourceList />
        </aside>
        <section className="flex-1 min-w-0 overflow-y-auto">
          {selection ? (
            selection.kind === 'role' ? (
              <RoleEditor role={selection.role} />
            ) : selection.kind === 'binding' ? (
              <BindingEditor binding={selection.binding} />
            ) : (
              <ServiceAccountEditor sa={selection.sa} />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-text-secondary text-sm">
              nothing selected — pick a resource on the left or apply a starter template
            </div>
          )}
        </section>
        <aside className="w-[28rem] shrink-0 border-l border-divider bg-yaml-bg">
          {selection ? (
            <YamlPanePerResource selection={selection} />
          ) : (
            <div className="flex h-full items-center justify-center text-text-secondary text-xs">
              nothing selected
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'add' | 'remove' | 'neutral';
}) {
  const style =
    tone === 'add'
      ? 'border-rating-4 text-rating-4 bg-badge-allow-bg'
      : tone === 'remove'
      ? 'border-rating-1 text-rating-1 bg-badge-deny-bg'
      : 'border-input-border text-text-secondary';
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${style}`}>
      <span className="font-mono text-[11px]">{value}</span>
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

