import { useMemo } from 'react';
import { useRbacContext } from '@/state/context';
import { updateRole } from '@/state/actions';
import type { PolicyRule, Role } from '@/types/rbac';
import { RulesTable } from './RulesTable';
import { LabelEditor } from './LabelEditor';

interface Props {
  role: Role;
}

function recomputeId(role: Role): string {
  return role.scope === 'ClusterRole'
    ? `ClusterRole/${role.name}`
    : `Role/${role.namespace ?? 'default'}/${role.name}`;
}

export function RoleEditor({ role }: Props) {
  const { state, dispatch } = useRbacContext();
  const isClusterRole = role.scope === 'ClusterRole';

  const conflicts = useMemo(() => {
    const roles = state.graph?.roles ?? [];
    return roles.some(r => r.id !== role.id && r.id === recomputeId(role));
  }, [state.graph, role]);

  const patch = (next: Partial<Role>) => {
    const merged: Role = { ...role, ...next };
    merged.id = recomputeId(merged);
    dispatch(updateRole(role.id, merged));
  };

  const setRules = (rules: PolicyRule[]) => patch({ rules });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-glow px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
          {role.scope}
        </span>
        {conflicts && (
          <span className="text-[10px] text-rating-1">id collides with another resource</span>
        )}
      </div>

      <Field label="name">
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
          value={role.name}
          onChange={e => patch({ name: e.target.value })}
        />
      </Field>

      {!isClusterRole && (
        <Field label="namespace">
          <input
            className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
            value={role.namespace ?? 'default'}
            onChange={e => patch({ namespace: e.target.value || 'default' })}
          />
        </Field>
      )}

      <Field label="labels">
        <LabelEditor
          labels={role.labels ?? {}}
          onChange={labels => patch({ labels })}
        />
      </Field>

      {isClusterRole && role.aggregationRule && (
        <Field label="aggregationRule">
          <div className="rounded border border-input-border bg-input-bg px-3 py-2 text-[11px] font-mono text-text-secondary">
            present — rules unioned from matching ClusterRoles (read-only UI; edit via YAML pane)
          </div>
        </Field>
      )}

      <RulesTable rules={role.rules} onChange={setRules} />
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
