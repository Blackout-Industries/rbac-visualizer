import { Handle, Position, type NodeProps } from 'reactflow';
import { Shield, ShieldAlert, Layers } from 'lucide-react';
import type { Binding, Role } from '@/types/rbac';
import type { RoleRuleEntry } from '@/lib/flow-graph';
import { ruleSeverityColor, type RuleSeverity, verbSeverityColor } from '@/lib/severity';

export interface RoleNodeData {
  role: Role;
  bindings: Binding[];
  rules: RoleRuleEntry[];
  severity: RuleSeverity;
  adminLike: boolean;
  dim: boolean;
  selected: boolean;
}

function summarise(list: string[] | undefined, max = 2): string {
  if (!list || list.length === 0) return '*';
  const cleaned = list.map(v => (v === '' ? 'core' : v));
  if (cleaned.length <= max) return cleaned.join(',');
  return `${cleaned.slice(0, max).join(',')} +${cleaned.length - max}`;
}

function summariseVerbs(list: string[] | undefined): string {
  if (!list || list.length === 0) return '*';
  if (list.includes('*')) return '*';
  if (list.length <= 3) return list.join('/');
  return `${list.slice(0, 3).join('/')} +${list.length - 3}`;
}

function bindingChips(bindings: Binding[]): string {
  const first = bindings[0];
  if (!first) return '';
  const label = first.scope === 'ClusterRoleBinding'
    ? `via ${first.name}`
    : `via ${first.name} · ${first.namespace ?? ''}`.trim();
  return bindings.length > 1 ? `${label} +${bindings.length - 1}` : label;
}

export function RoleNode({ data }: NodeProps<RoleNodeData>) {
  const isCluster = data.role.scope === 'ClusterRole';
  const outline = data.adminLike
    ? 'var(--theme-arrow-deny)'
    : ruleSeverityColor(data.severity);

  return (
    <div
      className="flow-role-card"
      style={{
        opacity: data.dim ? 0.18 : 1,
        borderColor: outline,
        boxShadow: data.selected ? `0 0 0 2px ${outline}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />

      <header className="flow-role-card__head" style={{ borderBottomColor: outline }}>
        <div className="flow-role-card__title">
          {data.adminLike ? (
            <ShieldAlert size={12} style={{ color: outline }} />
          ) : (
            <Shield size={12} style={{ color: outline }} />
          )}
          <span className="flow-role-card__kind">{isCluster ? 'clusterrole' : 'role'}</span>
          {data.role.aggregationRule && (
            <span className="flow-role-card__agg" title="aggregated">
              <Layers size={9} />
            </span>
          )}
        </div>
        <div className="flow-role-card__name" title={data.role.name}>
          {data.role.name}
        </div>
        <div className="flow-role-card__sub">
          {data.role.namespace ? `ns · ${data.role.namespace}` : 'cluster-wide'}
        </div>
        {data.bindings.length > 0 && (
          <div className="flow-role-card__via" title={bindingChips(data.bindings)}>
            {bindingChips(data.bindings)}
          </div>
        )}
      </header>

      <ul className="flow-role-card__rules">
        {data.rules.length === 0 && (
          <li className="flow-role-card__empty">no rules</li>
        )}
        {data.rules.map(r => {
          const color = verbSeverityColor(r.verbSeverity);
          return (
            <li key={r.ruleIndex} className="flow-role-card__rule">
              <span
                aria-hidden="true"
                className="flow-role-card__rule-dot"
                style={{ background: color }}
              />
              <span className="flow-role-card__rule-verbs" style={{ color }}>
                {summariseVerbs(r.rule.verbs)}
              </span>
              <span className="flow-role-card__rule-sep">·</span>
              <span className="flow-role-card__rule-res">
                {summarise(r.rule.resources)}
              </span>
              <span
                className="flow-role-card__rule-api"
                title={(r.rule.apiGroups ?? []).join(', ') || 'core'}
              >
                {summarise(r.rule.apiGroups, 1)}
              </span>
            </li>
          );
        })}
      </ul>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const handleStyle = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
};
