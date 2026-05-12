import type { Binding, PolicyRule, RbacGraph, Role } from '@/types/rbac';
import { effectiveRules } from './aggregation';

export type RedFlagSeverity = 'critical' | 'warning' | 'info';

export interface RedFlag {
  severity: RedFlagSeverity;
  message: string;
  /** Optional anchor to the offending object (role.id / binding.id / "Subject/..."). */
  refId?: string;
}

const DEFAULT_NAMESPACES = new Set(['default', 'kube-public']);
const SENSITIVE_RESOURCES = new Set([
  'secrets',
  'serviceaccounts',
  'serviceaccounts/token',
  'pods/exec',
  'pods/attach',
  'nodes',
]);

function ruleHasWildcardVerb(rule: PolicyRule): boolean {
  return !!rule.verbs?.includes('*');
}

function ruleHasWildcardResource(rule: PolicyRule): boolean {
  return !!rule.resources?.includes('*');
}

function ruleHasWildcardApiGroup(rule: PolicyRule): boolean {
  return !!rule.apiGroups?.includes('*');
}

function ruleHasWildcardResourceName(rule: PolicyRule): boolean {
  return !!rule.resourceNames?.includes('*');
}

/**
 * Audit a parsed RbacGraph for cluster-admin-equivalent grants and other
 * commonly-fingered footguns. Output is grouped by ref so the UI can highlight
 * the source object.
 */
export function detectRedFlags(graph: RbacGraph): RedFlag[] {
  const flags: RedFlag[] = [];

  // Wildcard rules within roles
  for (const role of graph.roles) {
    const rules = effectiveRules(role, graph);
    for (const rule of rules) {
      const w = {
        verb: ruleHasWildcardVerb(rule),
        resource: ruleHasWildcardResource(rule),
        api: ruleHasWildcardApiGroup(rule),
      };
      if (w.verb && w.resource && w.api) {
        flags.push({
          severity: 'critical',
          message: `${role.scope} ${role.name}: rule grants ALL verbs on ALL resources in ALL apiGroups (cluster-admin equivalent)`,
          refId: role.id,
        });
      } else if (w.verb && w.resource) {
        flags.push({
          severity: 'critical',
          message: `${role.scope} ${role.name}: rule grants ALL verbs on ALL resources`,
          refId: role.id,
        });
      } else if (w.verb) {
        flags.push({
          severity: 'warning',
          message: `${role.scope} ${role.name}: rule uses verb '*' (grants every verb on listed resources)`,
          refId: role.id,
        });
      } else if (w.resource && (rule.verbs?.includes('delete') || rule.verbs?.includes('*'))) {
        flags.push({
          severity: 'warning',
          message: `${role.scope} ${role.name}: delete/'*' on resource '*'`,
          refId: role.id,
        });
      }
      if (ruleHasWildcardResourceName(rule)) {
        flags.push({
          severity: 'info',
          message: `${role.scope} ${role.name}: resourceNames includes '*' (no narrowing)`,
          refId: role.id,
        });
      }
    }
  }

  // Service accounts in default namespaces granted cluster-wide secret access
  for (const binding of graph.bindings) {
    if (binding.scope !== 'ClusterRoleBinding') continue;
    const role = findRole(graph, binding);
    if (!role) continue;
    const rules = effectiveRules(role, graph);
    const grantsSecrets = rules.some(
      r =>
        r.resources?.includes('secrets') &&
        (r.verbs?.includes('delete') ||
          r.verbs?.includes('*') ||
          r.verbs?.includes('get') ||
          r.verbs?.includes('list')) &&
        (r.apiGroups?.includes('') || r.apiGroups?.includes('*')),
    );
    if (!grantsSecrets) continue;
    for (const subj of binding.subjects) {
      if (subj.kind === 'ServiceAccount' && subj.namespace && DEFAULT_NAMESPACES.has(subj.namespace)) {
        flags.push({
          severity: 'critical',
          message: `ServiceAccount ${subj.namespace}/${subj.name} is bound cluster-wide to secrets via ${binding.scope}/${binding.name} → ${role.scope}/${role.name}`,
          refId: binding.id,
        });
      }
    }
  }

  // Bindings to system:masters / system:authenticated etc. that grant write
  for (const binding of graph.bindings) {
    const role = findRole(graph, binding);
    if (!role) continue;
    const rules = effectiveRules(role, graph);
    const grantsWrite = rules.some(r =>
      r.verbs?.some(v => v === '*' || v === 'create' || v === 'update' || v === 'patch' || v === 'delete'),
    );
    if (!grantsWrite) continue;
    for (const subj of binding.subjects) {
      if (subj.kind !== 'Group') continue;
      if (subj.name === 'system:authenticated' || subj.name === 'system:unauthenticated') {
        flags.push({
          severity: 'critical',
          message: `Group '${subj.name}' has write access via ${binding.scope}/${binding.name} → ${role.scope}/${role.name}`,
          refId: binding.id,
        });
      }
    }
  }

  // Sensitive resource access surfaced as info
  for (const role of graph.roles) {
    const rules = effectiveRules(role, graph);
    for (const rule of rules) {
      if (!rule.resources) continue;
      for (const res of rule.resources) {
        if (SENSITIVE_RESOURCES.has(res) && rule.verbs?.some(v => v === '*' || v === 'delete')) {
          flags.push({
            severity: 'warning',
            message: `${role.scope} ${role.name}: dangerous verb on sensitive resource '${res}'`,
            refId: role.id,
          });
        }
      }
    }
  }

  return flags;
}

function findRole(graph: RbacGraph, binding: Binding): Role | undefined {
  if (binding.roleRef.kind === 'ClusterRole') {
    return graph.roles.find(r => r.scope === 'ClusterRole' && r.name === binding.roleRef.name);
  }
  return graph.roles.find(
    r => r.scope === 'Role' && r.name === binding.roleRef.name && r.namespace === binding.namespace,
  );
}
