import type {
  Binding,
  PermissionChain,
  PolicyRule,
  RbacGraph,
  Role,
  Subject,
} from '@/types/rbac';
import { effectiveRules } from './aggregation';

const WILDCARD = '*';

/**
 * Determine whether a Subject (as written in a binding) matches a query subject.
 *
 * Built-in system groups expand membership:
 *   - system:masters          → matched by everyone we're asked about (super-admin alias)
 *   - system:authenticated    → matched by every User & ServiceAccount
 *   - system:unauthenticated  → only matches anonymous (we don't track that explicitly)
 *   - system:serviceaccounts  → matched by every ServiceAccount
 *   - system:serviceaccounts:<ns> → matched by ServiceAccounts in <ns>
 */
export function bindingSubjectMatches(bound: Subject, query: Subject): boolean {
  if (bound.id === query.id) return true;

  if (bound.kind === 'Group') {
    if (bound.name === 'system:masters') return true; // cluster super-admin
    if (bound.name === 'system:authenticated') {
      return query.kind === 'User' || query.kind === 'ServiceAccount';
    }
    if (bound.name === 'system:serviceaccounts') {
      return query.kind === 'ServiceAccount';
    }
    if (bound.name.startsWith('system:serviceaccounts:')) {
      const ns = bound.name.slice('system:serviceaccounts:'.length);
      return query.kind === 'ServiceAccount' && query.namespace === ns;
    }
  }

  return false;
}

function arrayMatches(list: string[] | undefined, value: string): boolean {
  // RBAC semantics: an empty/undefined list is interpreted as no constraint only for resourceNames;
  // for verbs/apiGroups/resources the caller MUST supply the list (k8s requires it).
  if (!list || list.length === 0) return false;
  if (list.includes(WILDCARD)) return true;
  return list.includes(value);
}

function apiGroupMatches(rule: PolicyRule, apiGroup: string): boolean {
  const groups = rule.apiGroups;
  if (!groups || groups.length === 0) return false;
  if (groups.includes(WILDCARD)) return true;
  // The core API group is represented as "" — accept both forms.
  if (apiGroup === '' || apiGroup === 'core') {
    return groups.includes('') || groups.includes('core');
  }
  return groups.includes(apiGroup);
}

function resourceMatches(rule: PolicyRule, resource: string): boolean {
  const resources = rule.resources;
  if (!resources || resources.length === 0) return false;
  if (resources.includes(WILDCARD)) return true;
  // Treat "resource/subresource" — only base match for v0.
  return resources.includes(resource);
}

function resourceNameMatches(rule: PolicyRule, resourceName?: string): boolean {
  const names = rule.resourceNames;
  if (!names || names.length === 0) return true; // no constraint
  if (!resourceName) return false; // rule narrows by name but query gives none → no grant
  if (names.includes(WILDCARD)) return true;
  return names.includes(resourceName);
}

export interface PermissionQuery {
  verb: string;
  resource: string;
  /** API group; "" or "core" for core API group. Defaults to "" if omitted. */
  apiGroup?: string;
  /** Namespace the operation targets. undefined = cluster-scoped operation. */
  namespace?: string;
  /** Specific resource name (e.g. for a 'get' on a named object). */
  resourceName?: string;
}

function ruleAllows(rule: PolicyRule, q: PermissionQuery): boolean {
  if (!arrayMatches(rule.verbs, q.verb)) return false;
  if (!apiGroupMatches(rule, q.apiGroup ?? '')) return false;
  if (!resourceMatches(rule, q.resource)) return false;
  if (!resourceNameMatches(rule, q.resourceName)) return false;
  return true;
}

/**
 * Compute the namespace scope a binding applies to.
 *   - ClusterRoleBinding → cluster-wide (undefined)
 *   - RoleBinding        → its own namespace
 */
function bindingScopeNamespace(binding: Binding): string | undefined {
  return binding.scope === 'ClusterRoleBinding' ? undefined : binding.namespace;
}

/** Find the role a binding points at (Role same-NS or ClusterRole). */
function resolveRoleRef(binding: Binding, graph: RbacGraph): Role | undefined {
  const ref = binding.roleRef;
  if (ref.kind === 'ClusterRole') {
    return graph.roles.find(r => r.scope === 'ClusterRole' && r.name === ref.name);
  }
  // Role — must be in the same namespace as the binding (RoleBinding only).
  return graph.roles.find(
    r => r.scope === 'Role' && r.name === ref.name && r.namespace === binding.namespace,
  );
}

/**
 * Returns whether the binding grants the subject access in the queried namespace.
 *
 * Rules:
 *  - ClusterRoleBinding: cluster-wide; matches any namespace and cluster-scoped ops.
 *  - RoleBinding: scoped to binding.namespace. Matches only if query namespace == binding.namespace.
 *    NOTE: a RoleBinding pointing at a ClusterRole still restricts the grant to its own namespace.
 */
function bindingAppliesInNamespace(binding: Binding, queryNs: string | undefined): boolean {
  const scope = bindingScopeNamespace(binding);
  if (scope === undefined) return true; // cluster-wide
  // Namespaced binding — must match queried namespace (queryNs undefined = cluster-scoped op, not granted by a RoleBinding).
  return queryNs !== undefined && scope === queryNs;
}

/**
 * Core query: does the given subject have permission for the given (verb, resource, namespace)?
 *
 * Returns the first matching chain or null. Use {@link findAllChains} for all grants.
 */
export function canSubjectDo(
  subject: Subject,
  query: PermissionQuery,
  graph: RbacGraph,
): PermissionChain | null {
  for (const chain of iterateGrants(subject, query, graph)) {
    return chain;
  }
  return null;
}

/** Yields every PermissionChain that grants the subject access. */
export function* iterateGrants(
  subject: Subject,
  query: PermissionQuery,
  graph: RbacGraph,
): Generator<PermissionChain> {
  for (const binding of graph.bindings) {
    if (!bindingAppliesInNamespace(binding, query.namespace)) continue;
    if (!binding.subjects.some(bs => bindingSubjectMatches(bs, subject))) continue;
    const role = resolveRoleRef(binding, graph);
    if (!role) continue;
    const rules = effectiveRules(role, graph);
    for (const rule of rules) {
      if (ruleAllows(rule, query)) {
        yield {
          subject,
          binding,
          role,
          rule,
          appliesNamespace: bindingScopeNamespace(binding),
        };
      }
    }
  }
}

export function findAllChains(
  subject: Subject,
  query: PermissionQuery,
  graph: RbacGraph,
): PermissionChain[] {
  return Array.from(iterateGrants(subject, query, graph));
}

/**
 * Reverse query: which subjects in the graph can perform the operation?
 *
 * Returns one chain per (subject, chain) match — UI may dedupe by subject.id.
 */
export function findSubjectsWith(query: PermissionQuery, graph: RbacGraph): PermissionChain[] {
  const result: PermissionChain[] = [];
  for (const subject of graph.subjects) {
    for (const chain of iterateGrants(subject, query, graph)) {
      result.push(chain);
    }
  }
  return result;
}

/** Convenience overload that returns the first chain for a (verb, resource, namespace) tuple. */
export function checkPermission(
  subject: Subject,
  verb: string,
  resource: string,
  namespace?: string,
  apiGroup?: string,
  graph?: RbacGraph,
): PermissionChain | null {
  if (!graph) return null;
  return canSubjectDo(subject, { verb, resource, namespace, apiGroup }, graph);
}
