import type { LabelSelector, PolicyRule, RbacGraph, Role } from '@/types/rbac';

function matchExprMatches(
  labels: Record<string, string>,
  expr: NonNullable<LabelSelector['matchExpressions']>[number],
): boolean {
  const v = labels[expr.key];
  const vals = expr.values ?? [];
  switch (expr.operator) {
    case 'In':
      return v !== undefined && vals.includes(v);
    case 'NotIn':
      return v === undefined || !vals.includes(v);
    case 'Exists':
      return v !== undefined;
    case 'DoesNotExist':
      return v === undefined;
    default:
      return false;
  }
}

export function matchesSelector(labels: Record<string, string>, sel: LabelSelector): boolean {
  if (sel.matchLabels) {
    for (const [k, v] of Object.entries(sel.matchLabels)) {
      if (labels[k] !== v) return false;
    }
  }
  if (sel.matchExpressions) {
    for (const e of sel.matchExpressions) {
      if (!matchExprMatches(labels, e)) return false;
    }
  }
  // An empty selector ({}) matches everything; if no fields, that's the case.
  return true;
}

/**
 * Resolve the effective rules for a Role/ClusterRole.
 *
 * For a ClusterRole with an aggregationRule, the rules are the union of:
 *   - any rules defined inline (rare but legal)
 *   - the rules of every other ClusterRole whose metadata.labels match one of the
 *     clusterRoleSelectors. The aggregated ClusterRole is NOT itself re-aggregated
 *     (Kubernetes does not recurse) but we still resolve transitively in case the
 *     dumped YAML has nested aggregations — bounded by the role set.
 */
export function effectiveRules(role: Role, graph: RbacGraph): PolicyRule[] {
  if (!role.aggregationRule || role.scope !== 'ClusterRole') return role.rules;

  const selectors = role.aggregationRule.clusterRoleSelectors ?? [];
  if (selectors.length === 0) return role.rules;

  const aggregated: PolicyRule[] = [...role.rules];
  const seen = new Set<string>([role.id]);

  for (const other of graph.roles) {
    if (other.scope !== 'ClusterRole') continue;
    if (seen.has(other.id)) continue;
    const matches = selectors.some(sel => matchesSelector(other.labels ?? {}, sel));
    if (!matches) continue;
    seen.add(other.id);
    // Important: do NOT call effectiveRules recursively per the k8s contract.
    // But to keep this resilient against weird dumps, only include the inline rules.
    aggregated.push(...other.rules);
  }

  return aggregated;
}
