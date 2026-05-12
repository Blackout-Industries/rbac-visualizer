import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import { updateBinding } from '@/state/actions';
import { makeSubject } from '@/lib/rbac-parser';
import type { Binding, Subject, SubjectKind } from '@/types/rbac';

interface Props {
  binding: Binding;
}

function recomputeId(b: Binding): string {
  return b.scope === 'ClusterRoleBinding'
    ? `ClusterRoleBinding/${b.name}`
    : `RoleBinding/${b.namespace ?? 'default'}/${b.name}`;
}

export function BindingEditor({ binding }: Props) {
  const { state, dispatch } = useRbacContext();
  const isClusterBinding = binding.scope === 'ClusterRoleBinding';

  // For ClusterRoleBinding, roleRef must be ClusterRole.
  // For RoleBinding, roleRef can be Role (same NS) or ClusterRole.
  const candidateRoles = useMemo(() => {
    const roles = state.graph?.roles ?? [];
    if (isClusterBinding) return roles.filter(r => r.scope === 'ClusterRole');
    return roles.filter(
      r => r.scope === 'ClusterRole' || (r.scope === 'Role' && r.namespace === (binding.namespace ?? 'default')),
    );
  }, [state.graph, binding.namespace, isClusterBinding]);

  const patch = (next: Partial<Binding>) => {
    const merged: Binding = { ...binding, ...next };
    merged.id = recomputeId(merged);
    dispatch(updateBinding(binding.id, merged));
  };

  const onRefChange = (val: string) => {
    if (!val) {
      patch({ roleRef: { ...binding.roleRef, kind: isClusterBinding ? 'ClusterRole' : binding.roleRef.kind, name: '' } });
      return;
    }
    const [kind, name] = val.split('::') as ['Role' | 'ClusterRole', string];
    patch({
      roleRef: {
        kind,
        name,
        apiGroup: 'rbac.authorization.k8s.io',
      },
    });
  };

  const onSubjectChange = (idx: number, next: Subject) => {
    const subjects = binding.subjects.map((s, i) => (i === idx ? next : s));
    patch({ subjects });
  };

  const onSubjectDelete = (idx: number) => {
    patch({ subjects: binding.subjects.filter((_, i) => i !== idx) });
  };

  const onSubjectAdd = () => {
    patch({
      subjects: [...binding.subjects, makeSubject('ServiceAccount', 'new-sa', binding.namespace ?? 'default')],
    });
  };

  const selectedRefValue = binding.roleRef.name
    ? `${binding.roleRef.kind}::${binding.roleRef.name}`
    : '';

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-glow px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
          {binding.scope}
        </span>
      </div>

      <Field label="name">
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
          value={binding.name}
          onChange={e => patch({ name: e.target.value })}
        />
      </Field>

      {!isClusterBinding && (
        <Field label="namespace">
          <input
            className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
            value={binding.namespace ?? 'default'}
            onChange={e => patch({ namespace: e.target.value || 'default' })}
          />
        </Field>
      )}

      <Field label="roleRef">
        <div className="flex flex-col gap-1">
          <select
            className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
            value={selectedRefValue}
            onChange={e => onRefChange(e.target.value)}
          >
            <option value="">— pick a role —</option>
            {candidateRoles.map(r => {
              const v = `${r.scope}::${r.name}`;
              const label =
                r.scope === 'ClusterRole'
                  ? `ClusterRole/${r.name}`
                  : `Role/${r.namespace}/${r.name}`;
              return (
                <option key={v} value={v}>
                  {label}
                </option>
              );
            })}
          </select>
          {binding.roleRef.name && !candidateRoles.some(r => r.scope === binding.roleRef.kind && r.name === binding.roleRef.name) && (
            <span className="text-[10px] text-rating-2">
              roleRef points at {binding.roleRef.kind}/{binding.roleRef.name} which doesn't exist
            </span>
          )}
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase tracking-wider text-text-secondary">subjects</h4>
          <button
            type="button"
            onClick={onSubjectAdd}
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 text-xs hover:bg-glow"
          >
            <Plus size={12} /> add subject
          </button>
        </div>
        {binding.subjects.length === 0 && (
          <p className="text-[11px] italic text-text-secondary">nothing here yet</p>
        )}
        <ul className="flex flex-col gap-2">
          {binding.subjects.map((s, i) => (
            <li
              key={i}
              className="rounded border border-card-border bg-card-bg p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between text-[10px] text-text-secondary uppercase tracking-wider">
                subject #{i + 1}
                <button
                  type="button"
                  onClick={() => onSubjectDelete(i)}
                  className="text-text-secondary hover:text-rating-1"
                  aria-label="delete subject"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <SubjectRow subject={s} onChange={next => onSubjectChange(i, next)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SubjectRow({ subject, onChange }: { subject: Subject; onChange: (s: Subject) => void }) {
  const setKind = (kind: SubjectKind) => {
    const ns = kind === 'ServiceAccount' ? subject.namespace ?? 'default' : undefined;
    onChange(makeSubject(kind, subject.name || (kind === 'ServiceAccount' ? 'new-sa' : 'user-name'), ns));
  };
  const setName = (name: string) => {
    onChange(makeSubject(subject.kind, name, subject.namespace));
  };
  const setNs = (ns: string) => {
    onChange(makeSubject(subject.kind, subject.name, ns || 'default'));
  };
  return (
    <div className="flex flex-wrap items-end gap-2 text-[11px]">
      <label className="flex flex-col gap-0.5">
        <span className="text-text-secondary uppercase tracking-wider">kind</span>
        <select
          className="rounded border border-input-border bg-input-bg px-2 py-1 text-xs"
          value={subject.kind}
          onChange={e => setKind(e.target.value as SubjectKind)}
        >
          <option value="User">User</option>
          <option value="Group">Group</option>
          <option value="ServiceAccount">ServiceAccount</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5 flex-1 min-w-[8rem]">
        <span className="text-text-secondary uppercase tracking-wider">name</span>
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1 text-xs font-mono"
          value={subject.name}
          onChange={e => setName(e.target.value)}
        />
      </label>
      {subject.kind === 'ServiceAccount' && (
        <label className="flex flex-col gap-0.5 w-32">
          <span className="text-text-secondary uppercase tracking-wider">namespace</span>
          <input
            className="rounded border border-input-border bg-input-bg px-2 py-1 text-xs font-mono"
            value={subject.namespace ?? 'default'}
            onChange={e => setNs(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="uppercase tracking-wider text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
