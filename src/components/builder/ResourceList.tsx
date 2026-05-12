import { useMemo, useState } from 'react';
import { Plus, Trash2, Users, Shield, ShieldCheck, Link2, Globe, Wand2 } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import {
  addBinding,
  addRole,
  addSa,
  applyTemplate,
  deleteBinding,
  deleteRole,
  deleteSa,
  selectResource,
} from '@/state/actions';
import { STARTER_TEMPLATES } from '@/lib/starter-rbac';
import type { Binding, Role, ServiceAccountObj } from '@/types/rbac';

function saId(sa: ServiceAccountObj): string {
  return `ServiceAccount/${sa.namespace}/${sa.name}`;
}

function uniqueRoleId(scope: 'Role' | 'ClusterRole', baseName: string, ns: string, existing: Role[]): { name: string; id: string } {
  let suffix = 0;
  while (true) {
    const name = suffix === 0 ? baseName : `${baseName}-${suffix}`;
    const id = scope === 'ClusterRole' ? `ClusterRole/${name}` : `Role/${ns}/${name}`;
    if (!existing.some(r => r.id === id)) return { name, id };
    suffix++;
  }
}

function uniqueBindingId(
  scope: 'RoleBinding' | 'ClusterRoleBinding',
  baseName: string,
  ns: string,
  existing: Binding[],
): { name: string; id: string } {
  let suffix = 0;
  while (true) {
    const name = suffix === 0 ? baseName : `${baseName}-${suffix}`;
    const id = scope === 'ClusterRoleBinding' ? `ClusterRoleBinding/${name}` : `RoleBinding/${ns}/${name}`;
    if (!existing.some(b => b.id === id)) return { name, id };
    suffix++;
  }
}

function uniqueSaName(base: string, ns: string, existing: ServiceAccountObj[]): string {
  let suffix = 0;
  while (true) {
    const name = suffix === 0 ? base : `${base}-${suffix}`;
    if (!existing.some(s => s.namespace === ns && s.name === name)) return name;
    suffix++;
  }
}

export function ResourceList() {
  const { state, dispatch } = useRbacContext();
  const graph = state.graph;
  const selectedId = state.selectedId;
  const [templateOpen, setTemplateOpen] = useState(false);

  const groups = useMemo(() => {
    const sas = graph?.serviceAccounts ?? [];
    const roles = (graph?.roles ?? []).filter(r => r.scope === 'Role');
    const clusterRoles = (graph?.roles ?? []).filter(r => r.scope === 'ClusterRole');
    const rbs = (graph?.bindings ?? []).filter(b => b.scope === 'RoleBinding');
    const crbs = (graph?.bindings ?? []).filter(b => b.scope === 'ClusterRoleBinding');
    return { sas, roles, clusterRoles, rbs, crbs };
  }, [graph]);

  const select = (id: string) => dispatch(selectResource(id));

  const onNewSa = () => {
    const existing = graph?.serviceAccounts ?? [];
    const name = uniqueSaName('new-sa', 'default', existing);
    const sa: ServiceAccountObj = { name, namespace: 'default', docIndex: 0 };
    dispatch(addSa(sa));
    select(saId(sa));
  };

  const onNewRole = () => {
    const existing = graph?.roles ?? [];
    const { name, id } = uniqueRoleId('Role', 'new-role', 'default', existing);
    const role: Role = {
      scope: 'Role',
      name,
      namespace: 'default',
      labels: {},
      rules: [],
      id,
      docIndex: 0,
    };
    dispatch(addRole(role));
    select(id);
  };

  const onNewClusterRole = () => {
    const existing = graph?.roles ?? [];
    const { name, id } = uniqueRoleId('ClusterRole', 'new-clusterrole', '', existing);
    const role: Role = {
      scope: 'ClusterRole',
      name,
      labels: {},
      rules: [],
      id,
      docIndex: 0,
    };
    dispatch(addRole(role));
    select(id);
  };

  const onNewRoleBinding = () => {
    const existing = graph?.bindings ?? [];
    const { name, id } = uniqueBindingId('RoleBinding', 'new-binding', 'default', existing);
    const binding: Binding = {
      scope: 'RoleBinding',
      name,
      namespace: 'default',
      subjects: [],
      roleRef: { kind: 'Role', name: '', apiGroup: 'rbac.authorization.k8s.io' },
      id,
      docIndex: 0,
    };
    dispatch(addBinding(binding));
    select(id);
  };

  const onNewClusterRoleBinding = () => {
    const existing = graph?.bindings ?? [];
    const { name, id } = uniqueBindingId('ClusterRoleBinding', 'new-clusterbinding', '', existing);
    const binding: Binding = {
      scope: 'ClusterRoleBinding',
      name,
      subjects: [],
      roleRef: { kind: 'ClusterRole', name: '', apiGroup: 'rbac.authorization.k8s.io' },
      id,
      docIndex: 0,
    };
    dispatch(addBinding(binding));
    select(id);
  };

  const onApplyTemplate = (id: string) => {
    const t = STARTER_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    const built = t.build();
    dispatch(applyTemplate(built.roles, built.bindings, built.serviceAccounts));
    setTemplateOpen(false);
    // Auto-select the first role (or first binding/sa).
    const first =
      built.roles[0]?.id ?? built.bindings[0]?.id ?? (built.serviceAccounts[0] ? saId(built.serviceAccounts[0]) : null);
    if (first) select(first);
  };

  return (
    <div className="flex h-full flex-col bg-surface text-text-primary">
      <div className="border-b border-divider px-3 py-2">
        <div className="relative">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded border border-input-border bg-input-bg px-2 py-1.5 text-xs hover:bg-glow"
            onClick={() => setTemplateOpen(o => !o)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Wand2 size={12} /> starter templates
            </span>
            <span className="text-text-secondary">{templateOpen ? '–' : '+'}</span>
          </button>
          {templateOpen && (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded border border-divider bg-surface shadow-xl">
              {STARTER_TEMPLATES.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-glow"
                    onClick={() => onApplyTemplate(t.id)}
                  >
                    <span className="font-mono text-accent">{t.name}</span>
                    <span className="text-[10px] text-text-secondary">{t.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Group
          icon={<Users size={12} />}
          label="serviceaccounts"
          count={groups.sas.length}
          onNew={onNewSa}
        >
          {groups.sas.map(sa => {
            const id = saId(sa);
            return (
              <ListRow
                key={id}
                active={selectedId === id}
                primary={sa.name}
                secondary={sa.namespace}
                onClick={() => select(id)}
                onDelete={() => dispatch(deleteSa(id))}
              />
            );
          })}
          {groups.sas.length === 0 && <EmptyHint>nothing here yet</EmptyHint>}
        </Group>

        <Group
          icon={<Shield size={12} />}
          label="roles"
          count={groups.roles.length}
          onNew={onNewRole}
        >
          {groups.roles.map(r => (
            <ListRow
              key={r.id}
              active={selectedId === r.id}
              primary={r.name}
              secondary={r.namespace}
              onClick={() => select(r.id)}
              onDelete={() => dispatch(deleteRole(r.id))}
            />
          ))}
          {groups.roles.length === 0 && <EmptyHint>nothing here yet</EmptyHint>}
        </Group>

        <Group
          icon={<ShieldCheck size={12} />}
          label="clusterroles"
          count={groups.clusterRoles.length}
          onNew={onNewClusterRole}
        >
          {groups.clusterRoles.map(r => (
            <ListRow
              key={r.id}
              active={selectedId === r.id}
              primary={r.name}
              secondary={r.aggregationRule ? 'aggregated' : 'cluster-wide'}
              onClick={() => select(r.id)}
              onDelete={() => dispatch(deleteRole(r.id))}
            />
          ))}
          {groups.clusterRoles.length === 0 && <EmptyHint>nothing here yet</EmptyHint>}
        </Group>

        <Group
          icon={<Link2 size={12} />}
          label="rolebindings"
          count={groups.rbs.length}
          onNew={onNewRoleBinding}
        >
          {groups.rbs.map(b => (
            <ListRow
              key={b.id}
              active={selectedId === b.id}
              primary={b.name}
              secondary={`${b.namespace} → ${b.roleRef.kind}/${b.roleRef.name || '?'}`}
              onClick={() => select(b.id)}
              onDelete={() => dispatch(deleteBinding(b.id))}
            />
          ))}
          {groups.rbs.length === 0 && <EmptyHint>nothing here yet</EmptyHint>}
        </Group>

        <Group
          icon={<Globe size={12} />}
          label="clusterrolebindings"
          count={groups.crbs.length}
          onNew={onNewClusterRoleBinding}
        >
          {groups.crbs.map(b => (
            <ListRow
              key={b.id}
              active={selectedId === b.id}
              primary={b.name}
              secondary={`${b.roleRef.kind}/${b.roleRef.name || '?'}`}
              onClick={() => select(b.id)}
              onDelete={() => dispatch(deleteBinding(b.id))}
            />
          ))}
          {groups.crbs.length === 0 && <EmptyHint>nothing here yet</EmptyHint>}
        </Group>
      </div>
    </div>
  );
}

function Group({
  icon,
  label,
  count,
  onNew,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onNew: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-divider">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
          <span className="text-text-secondary opacity-70">({count})</span>
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-[10px] hover:bg-glow"
          onClick={onNew}
        >
          <Plus size={10} /> new
        </button>
      </div>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function ListRow({
  active,
  primary,
  secondary,
  onClick,
  onDelete,
}: {
  active: boolean;
  primary: string;
  secondary?: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={
        'group flex items-center gap-2 border-l-2 px-3 py-1.5 text-xs cursor-pointer ' +
        (active
          ? 'border-l-accent bg-glow text-text-primary'
          : 'border-l-transparent hover:bg-glow')
      }
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-accent">{primary}</span>
        {secondary && (
          <span className="truncate text-[10px] text-text-secondary">{secondary}</span>
        )}
      </div>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-rating-1"
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="delete"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-2 text-[10px] italic text-text-secondary">{children}</li>;
}
