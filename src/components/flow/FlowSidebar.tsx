import { useMemo } from 'react';
import { ShieldAlert, Box, Users, ListChecks, FileWarning } from 'lucide-react';
import type { FlowGraph } from '@/lib/flow-graph';
import type { RbacGraph, Subject } from '@/types/rbac';
import { roleIsClusterAdminLike, subjectSeverity } from '@/lib/severity';

interface FlowSidebarProps {
  flow: FlowGraph;
  graph: RbacGraph;
  onFocusSubject: (subjectId: string) => void;
  onFocusResource: (resourceId: string) => void;
  focusedNodeId: string | null;
}

interface ResourceCount {
  id: string;
  apiGroup: string;
  resource: string;
  subjects: number;
}

function countSubjectsPerResource(flow: FlowGraph): ResourceCount[] {
  // Walk every chain that ends at a resource and count distinct subjects.
  const map = new Map<string, { apiGroup: string; resource: string; subjects: Set<string> }>();
  const resourceNodes = flow.nodes.filter(n => n.layer === 'resource');
  for (const r of resourceNodes) {
    if (r.layer !== 'resource') continue;
    const chainIds = flow.chains.get(r.id);
    if (!chainIds) continue;
    const subjects = new Set<string>();
    for (const id of chainIds) {
      const node = flow.nodes.find(n => n.id === id);
      if (node && node.layer === 'subject') subjects.add(node.id);
    }
    map.set(r.id, { apiGroup: r.apiGroup, resource: r.resource, subjects });
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ id, apiGroup: v.apiGroup, resource: v.resource, subjects: v.subjects.size }))
    .sort((a, b) => b.subjects - a.subjects);
}

function findAdminSubjects(flow: FlowGraph, graph: RbacGraph): Subject[] {
  const out: Subject[] = [];
  for (const node of flow.nodes) {
    if (node.layer !== 'subject') continue;
    if (subjectSeverity(node.subject, graph) === 'admin') out.push(node.subject);
  }
  return out;
}

function countAdminLikeRoles(flow: FlowGraph, graph: RbacGraph): number {
  let count = 0;
  for (const node of flow.nodes) {
    if (node.layer !== 'role') continue;
    if (roleIsClusterAdminLike(node.role, graph)) count++;
  }
  return count;
}

export function FlowSidebar({
  flow,
  graph,
  onFocusSubject,
  onFocusResource,
  focusedNodeId,
}: FlowSidebarProps) {
  const subjectCount = flow.subjects.length;
  const roleCount = flow.roles.length;
  const ruleCount = flow.nodes.filter(n => n.layer === 'rule').length;
  const resourceCount = flow.resources.length;

  const adminSubjects = useMemo(() => findAdminSubjects(flow, graph), [flow, graph]);
  const adminRoles = useMemo(() => countAdminLikeRoles(flow, graph), [flow, graph]);
  const topResources = useMemo(() => countSubjectsPerResource(flow).slice(0, 8), [flow]);

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-divider bg-surface text-text-primary">
      <Section title="summary" icon={<Users size={12} />}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="subjects" value={subjectCount} />
          <Stat label="roles" value={roleCount} />
          <Stat label="rules" value={ruleCount} />
          <Stat label="resources" value={resourceCount} />
        </div>
      </Section>

      <Section title="red flags" icon={<ShieldAlert size={12} />}>
        {adminSubjects.length === 0 && adminRoles === 0 ? (
          <p className="text-[11px] text-text-secondary">no cluster-admin-equivalent grants.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {adminRoles > 0 && (
              <div className="inline-flex items-center gap-1 text-[11px] text-rating-1">
                <FileWarning size={11} />
                <span>{adminRoles} role{adminRoles === 1 ? '' : 's'} grant verbs:[*] resources:[*]</span>
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {adminSubjects.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onFocusSubject(s.id)}
                    className={
                      'w-full rounded border border-input-border bg-input-bg px-2 py-1 text-left text-[11px] font-mono hover:bg-glow ' +
                      (focusedNodeId === s.id ? 'ring-1 ring-rating-1' : '')
                    }
                    style={{ color: 'var(--theme-arrow-deny)' }}
                  >
                    {s.id}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="top resources" icon={<Box size={12} />}>
        {topResources.length === 0 ? (
          <p className="text-[11px] text-text-secondary">no resources touched.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {topResources.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onFocusResource(r.id)}
                  className={
                    'flex w-full items-center justify-between rounded border border-input-border bg-input-bg px-2 py-1 text-left text-[11px] font-mono hover:bg-glow ' +
                    (focusedNodeId === r.id ? 'ring-1 ring-accent' : '')
                  }
                >
                  <span className="truncate" title={`${r.apiGroup || 'core'}/${r.resource}`}>
                    {r.resource}
                  </span>
                  <span className="ml-2 shrink-0 text-text-secondary">{r.subjects}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="legend" icon={<ListChecks size={12} />}>
        <ul className="flex flex-col gap-1 text-[10px] text-text-secondary">
          <LegendRow color="var(--theme-arrow-allow)" label="read (get/list/watch)" />
          <LegendRow color="var(--theme-rating-2)" label="mutate (create/update/patch)" />
          <LegendRow color="var(--theme-arrow-deny)" label="destroy / wildcard" />
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-divider px-3 py-3">
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-secondary">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-card-border bg-card-bg px-2 py-1.5">
      <div className="text-base font-semibold leading-none">{value}</div>
      <div className="text-[10px] text-text-secondary">{label}</div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 16,
          height: 2,
          background: color,
          borderRadius: 1,
        }}
      />
      <span>{label}</span>
    </li>
  );
}
