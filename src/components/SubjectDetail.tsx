import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import { setSelected } from '@/state/actions';
import { effectiveRules } from '@/lib/aggregation';
import type { Binding, Role, Subject } from '@/types/rbac';

export function SubjectDetail() {
  const { state, dispatch } = useRbacContext();
  const { graph, selectedId } = state;

  const selection = useMemo(() => {
    if (!graph || !selectedId) return null;
    if (selectedId.startsWith('Role/') || selectedId.startsWith('ClusterRole/')) {
      const role = graph.roles.find(r => r.id === selectedId);
      return role ? ({ kind: 'role' as const, role } as const) : null;
    }
    const subj = graph.subjects.find(s => s.id === selectedId);
    if (subj) return { kind: 'subject' as const, subject: subj } as const;
    return null;
  }, [graph, selectedId]);

  if (!selection || !graph) return null;

  return (
    <div className="absolute right-0 top-0 h-full w-96 max-w-[90vw] border-l border-divider bg-surface shadow-xl overflow-y-auto">
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Details</h3>
        <button
          className="text-text-secondary hover:text-text-primary"
          onClick={() => dispatch(setSelected(null))}
          aria-label="Close details"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-4 text-sm text-text-primary">
        {selection.kind === 'subject' ? (
          <SubjectBody subject={selection.subject} />
        ) : (
          <RoleBody role={selection.role} />
        )}
      </div>
    </div>
  );
}

function SubjectBody({ subject }: { subject: Subject }) {
  const { state } = useRbacContext();
  const graph = state.graph!;
  const bindings = graph.bindings.filter(b => b.subjects.some(s => s.id === subject.id));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Kind" value={subject.kind} />
      <Field label="Name" value={subject.name} />
      {subject.namespace && <Field label="Namespace" value={subject.namespace} />}
      <Field label="ID" value={subject.id} />

      <h4 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Bindings ({bindings.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {bindings.map(b => (
          <li
            key={b.id}
            className="rounded border border-card-border bg-card-bg px-3 py-2 text-xs"
          >
            <div className="font-mono text-accent">{b.scope}/{b.namespace ? `${b.namespace}/` : ''}{b.name}</div>
            <div className="text-text-secondary">
              → {b.roleRef.kind}/{b.roleRef.name}
            </div>
          </li>
        ))}
        {bindings.length === 0 && (
          <li className="text-xs text-text-secondary">No bindings reference this subject.</li>
        )}
      </ul>
    </div>
  );
}

function RoleBody({ role }: { role: Role }) {
  const { state } = useRbacContext();
  const graph = state.graph!;
  const rules = effectiveRules(role, graph);
  const usedByBindings: Binding[] = graph.bindings.filter(
    b => b.roleRef.name === role.name && b.roleRef.kind === role.scope,
  );

  return (
    <div className="flex flex-col gap-3">
      <Field label="Kind" value={role.scope} />
      <Field label="Name" value={role.name} />
      {role.namespace && <Field label="Namespace" value={role.namespace} />}
      {role.aggregationRule && (
        <Field label="aggregationRule" value="present (rules unioned from matching ClusterRoles)" />
      )}
      <h4 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Rules ({rules.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {rules.map((rule, i) => (
          <li
            key={i}
            className="rounded border border-card-border bg-card-bg px-3 py-2 text-xs font-mono"
          >
            <div>
              <span className="text-text-secondary">verbs:</span> [{(rule.verbs ?? []).join(', ')}]
            </div>
            <div>
              <span className="text-text-secondary">apiGroups:</span> [{(rule.apiGroups ?? []).join(', ')}]
            </div>
            <div>
              <span className="text-text-secondary">resources:</span> [{(rule.resources ?? []).join(', ')}]
            </div>
            {rule.resourceNames && rule.resourceNames.length > 0 && (
              <div>
                <span className="text-text-secondary">resourceNames:</span> [{rule.resourceNames.join(', ')}]
              </div>
            )}
            {rule.nonResourceURLs && rule.nonResourceURLs.length > 0 && (
              <div>
                <span className="text-text-secondary">nonResourceURLs:</span> [{rule.nonResourceURLs.join(', ')}]
              </div>
            )}
          </li>
        ))}
      </ul>
      <h4 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Used by ({usedByBindings.length})
      </h4>
      <ul className="flex flex-col gap-1 text-xs">
        {usedByBindings.map(b => (
          <li key={b.id} className="font-mono text-accent">
            {b.scope}/{b.namespace ? `${b.namespace}/` : ''}{b.name}
          </li>
        ))}
        {usedByBindings.length === 0 && (
          <li className="text-text-secondary">No bindings reference this role.</li>
        )}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="font-mono text-sm break-all">{value}</span>
    </div>
  );
}
