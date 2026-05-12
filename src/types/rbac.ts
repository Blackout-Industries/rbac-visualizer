// RBAC domain types — modeled after Kubernetes rbac.authorization.k8s.io/v1

export type SubjectKind = 'User' | 'Group' | 'ServiceAccount';

export interface Subject {
  kind: SubjectKind;
  name: string;
  /** Only present for ServiceAccount. */
  namespace?: string;
  /** Stable identity string used as a graph node id, e.g. "ServiceAccount/prod/deployer" or "Group/system:masters". */
  id: string;
}

export interface PolicyRule {
  verbs: string[];
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: Array<{
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
    values?: string[];
  }>;
}

export interface AggregationRule {
  clusterRoleSelectors?: LabelSelector[];
}

export type RoleScope = 'Role' | 'ClusterRole';

export interface Role {
  scope: RoleScope;
  name: string;
  /** Only present for namespaced Role. */
  namespace?: string;
  labels: Record<string, string>;
  rules: PolicyRule[];
  aggregationRule?: AggregationRule;
  /** Stable identity string: "ClusterRole/admin" or "Role/prod/secret-reader" */
  id: string;
  /** Index of the source document inside the parsed YAML stream. */
  docIndex: number;
}

export interface RoleRef {
  kind: RoleScope;
  name: string;
  apiGroup: string;
}

export type BindingScope = 'RoleBinding' | 'ClusterRoleBinding';

export interface Binding {
  scope: BindingScope;
  name: string;
  /** Only present for RoleBinding. */
  namespace?: string;
  subjects: Subject[];
  roleRef: RoleRef;
  /** Stable identity. */
  id: string;
  docIndex: number;
}

export interface ServiceAccountObj {
  name: string;
  namespace: string;
  docIndex: number;
}

export interface RbacGraph {
  roles: Role[];
  bindings: Binding[];
  serviceAccounts: ServiceAccountObj[];
  /** All subjects referenced anywhere (bindings + standalone SAs), deduped by id. */
  subjects: Subject[];
  /** All namespaces seen across bindings / roles / SAs. */
  namespaces: string[];
  /** Distinct resource types referenced in any rule (excluding wildcards). */
  resourceTypes: string[];
  /** Parse warnings (e.g. unsupported kind). */
  warnings: string[];
}

/** A single granted-permission chain (binding → role → matching rule). */
export interface PermissionChain {
  subject: Subject;
  binding: Binding;
  role: Role;
  rule: PolicyRule;
  /** The namespace the grant applies to — undefined means cluster-wide. */
  appliesNamespace?: string;
}

/** Edge in the permission graph: subject -> role -> resource(or *) */
export interface PermissionEdge {
  fromId: string;
  toId: string;
  label?: string;
}

export const ALL_VERBS = [
  'get',
  'list',
  'watch',
  'create',
  'update',
  'patch',
  'delete',
  'deletecollection',
] as const;

export type StandardVerb = typeof ALL_VERBS[number];
