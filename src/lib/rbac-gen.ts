import yaml from 'js-yaml';
import type {
  Binding,
  PolicyRule,
  RbacGraph,
  Role,
  ServiceAccountObj,
} from '@/types/rbac';

/**
 * IR → YAML conversion. Produces output that `parseRbacYaml` round-trips.
 *
 * Each generator function returns a plain JS object suitable for js-yaml
 * to dump, then a serializer concatenates them into a multi-doc stream.
 */

interface YamlObj {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  rules?: PolicyRuleYaml[];
  aggregationRule?: Record<string, unknown>;
  subjects?: SubjectYaml[];
  roleRef?: { kind: string; name: string; apiGroup: string };
}

interface PolicyRuleYaml {
  verbs: string[];
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

interface SubjectYaml {
  kind: string;
  name: string;
  namespace?: string;
  apiGroup?: string;
}

const RBAC_API_VERSION = 'rbac.authorization.k8s.io/v1';

function ruleToYaml(rule: PolicyRule): PolicyRuleYaml {
  const out: PolicyRuleYaml = { verbs: [...rule.verbs] };
  if (rule.apiGroups !== undefined) out.apiGroups = [...rule.apiGroups];
  if (rule.resources !== undefined) out.resources = [...rule.resources];
  if (rule.resourceNames && rule.resourceNames.length > 0) {
    out.resourceNames = [...rule.resourceNames];
  }
  if (rule.nonResourceURLs && rule.nonResourceURLs.length > 0) {
    out.nonResourceURLs = [...rule.nonResourceURLs];
  }
  return out;
}

function labelsOrUndefined(labels: Record<string, string>): Record<string, string> | undefined {
  if (!labels || Object.keys(labels).length === 0) return undefined;
  return { ...labels };
}

export function roleToYamlObject(role: Role): YamlObj {
  if (role.scope === 'ClusterRole') {
    const obj: YamlObj = {
      apiVersion: RBAC_API_VERSION,
      kind: 'ClusterRole',
      metadata: {
        name: role.name,
      },
      rules: role.rules.map(ruleToYaml),
    };
    const labels = labelsOrUndefined(role.labels);
    if (labels) obj.metadata.labels = labels;
    if (role.aggregationRule) {
      obj.aggregationRule = {
        clusterRoleSelectors: (role.aggregationRule.clusterRoleSelectors ?? []).map(s => {
          const sel: Record<string, unknown> = {};
          if (s.matchLabels && Object.keys(s.matchLabels).length > 0) {
            sel.matchLabels = { ...s.matchLabels };
          }
          if (s.matchExpressions && s.matchExpressions.length > 0) {
            sel.matchExpressions = s.matchExpressions.map(e => {
              const out: Record<string, unknown> = { key: e.key, operator: e.operator };
              if (e.values && e.values.length > 0) out.values = [...e.values];
              return out;
            });
          }
          return sel;
        }),
      };
    }
    return obj;
  }
  // Namespaced Role
  const obj: YamlObj = {
    apiVersion: RBAC_API_VERSION,
    kind: 'Role',
    metadata: {
      name: role.name,
      namespace: role.namespace ?? 'default',
    },
    rules: role.rules.map(ruleToYaml),
  };
  const labels = labelsOrUndefined(role.labels);
  if (labels) obj.metadata.labels = labels;
  return obj;
}

export function bindingToYamlObject(binding: Binding): YamlObj {
  const subjects: SubjectYaml[] = binding.subjects.map(s => {
    const out: SubjectYaml = { kind: s.kind, name: s.name };
    if (s.kind === 'ServiceAccount') {
      out.namespace = s.namespace ?? 'default';
    } else {
      // User / Group use the RBAC apiGroup
      out.apiGroup = 'rbac.authorization.k8s.io';
    }
    return out;
  });

  if (binding.scope === 'ClusterRoleBinding') {
    return {
      apiVersion: RBAC_API_VERSION,
      kind: 'ClusterRoleBinding',
      metadata: { name: binding.name },
      subjects,
      roleRef: {
        kind: binding.roleRef.kind,
        name: binding.roleRef.name,
        apiGroup: binding.roleRef.apiGroup,
      },
    };
  }
  return {
    apiVersion: RBAC_API_VERSION,
    kind: 'RoleBinding',
    metadata: { name: binding.name, namespace: binding.namespace ?? 'default' },
    subjects,
    roleRef: {
      kind: binding.roleRef.kind,
      name: binding.roleRef.name,
      apiGroup: binding.roleRef.apiGroup,
    },
  };
}

export function serviceAccountToYamlObject(sa: ServiceAccountObj): YamlObj {
  return {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: { name: sa.name, namespace: sa.namespace },
  };
}

function dump(obj: unknown): string {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

/** Single resource → YAML string (no leading `---`). */
export function genRoleYaml(role: Role): string {
  return dump(roleToYamlObject(role));
}

export function genBindingYaml(binding: Binding): string {
  return dump(bindingToYamlObject(binding));
}

export function genServiceAccountYaml(sa: ServiceAccountObj): string {
  return dump(serviceAccountToYamlObject(sa));
}

/**
 * Multi-doc YAML for the entire graph. Order: ServiceAccounts, ClusterRoles,
 * Roles, ClusterRoleBindings, RoleBindings — easy to read top-down.
 */
export function genFullYaml(graph: RbacGraph): string {
  const parts: string[] = [];
  for (const sa of graph.serviceAccounts) {
    parts.push(dump(serviceAccountToYamlObject(sa)));
  }
  for (const role of graph.roles) {
    if (role.scope === 'ClusterRole') parts.push(dump(roleToYamlObject(role)));
  }
  for (const role of graph.roles) {
    if (role.scope === 'Role') parts.push(dump(roleToYamlObject(role)));
  }
  for (const b of graph.bindings) {
    if (b.scope === 'ClusterRoleBinding') parts.push(dump(bindingToYamlObject(b)));
  }
  for (const b of graph.bindings) {
    if (b.scope === 'RoleBinding') parts.push(dump(bindingToYamlObject(b)));
  }
  return parts.join('---\n');
}

/** Generate YAML for a "slice" of IR (e.g. a starter template). */
export interface IrSlice {
  roles?: Role[];
  bindings?: Binding[];
  serviceAccounts?: ServiceAccountObj[];
}

export function genSliceYaml(slice: IrSlice): string {
  const parts: string[] = [];
  for (const sa of slice.serviceAccounts ?? []) {
    parts.push(dump(serviceAccountToYamlObject(sa)));
  }
  for (const role of slice.roles ?? []) {
    if (role.scope === 'ClusterRole') parts.push(dump(roleToYamlObject(role)));
  }
  for (const role of slice.roles ?? []) {
    if (role.scope === 'Role') parts.push(dump(roleToYamlObject(role)));
  }
  for (const b of slice.bindings ?? []) {
    if (b.scope === 'ClusterRoleBinding') parts.push(dump(bindingToYamlObject(b)));
  }
  for (const b of slice.bindings ?? []) {
    if (b.scope === 'RoleBinding') parts.push(dump(bindingToYamlObject(b)));
  }
  return parts.join('---\n');
}
