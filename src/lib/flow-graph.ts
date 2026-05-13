// Pure transformation: RbacGraph → 3-layer compact DAG for the Flow Chart view.
//
// Layers (left to right): subject → role → resource
//
// Compared to the v1 5-layer model (subject → binding → role → rule → resource),
// this folds two layers away from the canvas:
//   * Bindings are no longer their own nodes; the binding label rides on the
//     subject→role edge ("CRB" or "RB ns/<ns>"), and a role card carries the
//     list of bindings that landed subjects on it.
//   * Rules are no longer their own nodes; a role card lists its rules inline
//     as small rows (apiGroup / resources / verbs, severity-coloured).
//
// A "resource node" is still a distinct (apiGroup, resource) tuple actually
// granted by some rule on a reachable role. Wildcards stay as literal "*".

import type {
  Binding,
  PolicyRule,
  RbacGraph,
  Role,
  Subject,
} from '@/types/rbac';
import { effectiveRules } from './aggregation';
import {
  ruleSeverity,
  subjectSeverity,
  verbsSeverity,
  type RuleSeverity,
  type SubjectSeverity,
  type VerbSeverity,
} from './severity';

export type FlowLayer = 'subject' | 'role' | 'resource';

export interface FlowSubjectNode {
  layer: 'subject';
  id: string;
  subject: Subject;
  severity: SubjectSeverity;
}

/** A single rule on a role, packed for inline rendering inside the role card. */
export interface RoleRuleEntry {
  ruleIndex: number;
  rule: PolicyRule;
  severity: RuleSeverity;
  /** Worst-case verb severity for the rule, drives the row colour. */
  verbSeverity: VerbSeverity;
}

export interface FlowRoleNode {
  layer: 'role';
  id: string;
  role: Role;
  /** Bindings whose subjects reach this role. Used for the binding chip on the role header. */
  bindings: Binding[];
  /** Inline rules for the compound card. */
  rules: RoleRuleEntry[];
  /** Worst-case rule severity across the card. */
  severity: RuleSeverity;
}

export interface FlowResourceNode {
  layer: 'resource';
  id: string;
  apiGroup: string;
  resource: string;
}

export type FlowNode = FlowSubjectNode | FlowRoleNode | FlowResourceNode;

export type FlowEdgeKind = 'subject-role' | 'role-resource';

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: FlowEdgeKind;
  /** For subject→role edges: the bindings that link this subject to this role. */
  bindings?: Binding[];
  /** For role→resource edges: the union of verbs across all rules on the role that target this resource. */
  verbs?: string[];
  verbSeverity?: VerbSeverity;
  /** Concatenated chain info for popovers (role→resource only). */
  chain?: {
    subjects: Subject[];
    role: Role;
    rules: PolicyRule[];
    bindings: Binding[];
    namespaces: string[];
  };
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Per-node: ids on the same connected chain. Used by hover spotlight. */
  chains: Map<string, Set<string>>;
  subjects: Subject[];
  roles: Role[];
  resources: FlowResourceNode[];
  /** Number of effective rules drawn across all role cards — used for the sidebar stat. */
  ruleCount: number;
}

const RESOURCE_WILDCARD = '*';

function resourceNodeId(apiGroup: string, resource: string): string {
  const g = apiGroup === '' ? 'core' : apiGroup;
  return `res::${g}::${resource}`;
}

function bindingResolvesToRole(binding: Binding, graph: RbacGraph): Role | undefined {
  if (binding.roleRef.kind === 'ClusterRole') {
    return graph.roles.find(r => r.scope === 'ClusterRole' && r.name === binding.roleRef.name);
  }
  return graph.roles.find(
    r =>
      r.scope === 'Role' &&
      r.name === binding.roleRef.name &&
      r.namespace === binding.namespace,
  );
}

function worstRuleSeverity(rules: RoleRuleEntry[]): RuleSeverity {
  let worst: RuleSeverity = 'safe';
  for (const r of rules) {
    if (r.severity === 'wildcard') return 'wildcard';
    if (r.severity === 'destroy') worst = 'destroy';
    else if (r.severity === 'mutate' && worst !== 'destroy') worst = 'mutate';
  }
  return worst;
}

function mergeVerbs(a: string[], b: string[]): string[] {
  const set = new Set<string>(a);
  for (const v of b) set.add(v);
  return Array.from(set);
}

/**
 * Build the compact 3-layer DAG model from the parsed RbacGraph.
 *
 * Only reachable nodes are emitted: a role appears only if some binding points
 * at it AND the binding has at least one subject; resources appear only if some
 * rule on a reachable role lists them.
 */
export function buildFlowGraph(graph: RbacGraph): FlowGraph {
  const subjectMap = new Map<string, FlowSubjectNode>();
  const roleMap = new Map<string, FlowRoleNode>();
  const resourceMap = new Map<string, FlowResourceNode>();

  // Edges are keyed by (source,target) so we can fold duplicate edges
  // (same subject reached via multiple bindings, same resource via multiple rules).
  const subjectRoleEdges = new Map<string, FlowEdge>();
  const roleResourceEdges = new Map<string, FlowEdge>();

  let ruleCount = 0;

  for (const binding of graph.bindings) {
    const role = bindingResolvesToRole(binding, graph);
    if (!role) continue;
    if (binding.subjects.length === 0) continue;

    // Materialise the role node (once) — with its rules + binding list.
    if (!roleMap.has(role.id)) {
      const effective = effectiveRules(role, graph);
      const ruleEntries: RoleRuleEntry[] = effective.map((rule, ruleIndex) => {
        const verbSev = (rule.verbs ?? []).includes(RESOURCE_WILDCARD)
          ? 'wildcard'
          : verbsSeverity(rule.verbs);
        return {
          ruleIndex,
          rule,
          severity: ruleSeverity(rule),
          verbSeverity: verbSev,
        };
      });
      ruleCount += ruleEntries.length;
      roleMap.set(role.id, {
        layer: 'role',
        id: role.id,
        role,
        bindings: [],
        rules: ruleEntries,
        severity: worstRuleSeverity(ruleEntries),
      });
    }
    const roleNode = roleMap.get(role.id)!;
    if (!roleNode.bindings.some(b => b.id === binding.id)) {
      roleNode.bindings.push(binding);
    }

    // Subjects → role.
    for (const subj of binding.subjects) {
      if (!subjectMap.has(subj.id)) {
        subjectMap.set(subj.id, {
          layer: 'subject',
          id: subj.id,
          subject: subj,
          severity: subjectSeverity(subj, graph),
        });
      }
      const edgeKey = `e::${subj.id}->${role.id}`;
      const existing = subjectRoleEdges.get(edgeKey);
      if (existing) {
        if (!existing.bindings?.some(b => b.id === binding.id)) {
          existing.bindings = [...(existing.bindings ?? []), binding];
        }
      } else {
        subjectRoleEdges.set(edgeKey, {
          id: edgeKey,
          source: subj.id,
          target: role.id,
          kind: 'subject-role',
          bindings: [binding],
        });
      }
    }

    // Role → resources (fan-out across every rule, merging verbs per resource).
    const effective = effectiveRules(role, graph);
    for (const rule of effective) {
      const apiGroups = rule.apiGroups && rule.apiGroups.length > 0 ? rule.apiGroups : [''];
      const resources = rule.resources && rule.resources.length > 0
        ? rule.resources
        : rule.nonResourceURLs && rule.nonResourceURLs.length > 0
          ? rule.nonResourceURLs.map(u => `url:${u}`)
          : [];
      if (resources.length === 0) continue;

      const verbs = rule.verbs ?? [];
      const verbSev = verbs.includes(RESOURCE_WILDCARD) ? 'wildcard' : verbsSeverity(verbs);

      for (const apiGroup of apiGroups) {
        for (const resource of resources) {
          const resKey = resourceNodeId(apiGroup, resource);
          if (!resourceMap.has(resKey)) {
            resourceMap.set(resKey, {
              layer: 'resource',
              id: resKey,
              apiGroup,
              resource,
            });
          }
          const edgeKey = `e::${role.id}->${resKey}`;
          const existing = roleResourceEdges.get(edgeKey);
          if (existing) {
            existing.verbs = mergeVerbs(existing.verbs ?? [], verbs);
            existing.verbSeverity = existing.verbs.includes(RESOURCE_WILDCARD)
              ? 'wildcard'
              : verbsSeverity(existing.verbs);
            if (existing.chain) {
              if (!existing.chain.rules.includes(rule)) existing.chain.rules.push(rule);
              if (!existing.chain.bindings.some(b => b.id === binding.id)) {
                existing.chain.bindings.push(binding);
              }
              const ns =
                binding.scope === 'ClusterRoleBinding' ? 'cluster' : (binding.namespace ?? 'cluster');
              if (!existing.chain.namespaces.includes(ns)) existing.chain.namespaces.push(ns);
              for (const s of binding.subjects) {
                if (!existing.chain.subjects.some(x => x.id === s.id)) {
                  existing.chain.subjects.push(s);
                }
              }
            }
          } else {
            const ns =
              binding.scope === 'ClusterRoleBinding' ? 'cluster' : (binding.namespace ?? 'cluster');
            roleResourceEdges.set(edgeKey, {
              id: edgeKey,
              source: role.id,
              target: resKey,
              kind: 'role-resource',
              verbs,
              verbSeverity: verbSev,
              chain: {
                subjects: [...binding.subjects],
                role,
                rules: [rule],
                bindings: [binding],
                namespaces: [ns],
              },
            });
          }
        }
      }
    }
  }

  const nodes: FlowNode[] = [
    ...subjectMap.values(),
    ...roleMap.values(),
    ...resourceMap.values(),
  ];
  const edges: FlowEdge[] = [
    ...subjectRoleEdges.values(),
    ...roleResourceEdges.values(),
  ];

  const chains = computeChains(nodes, edges);

  return {
    nodes,
    edges,
    chains,
    subjects: Array.from(subjectMap.values()).map(s => s.subject),
    roles: Array.from(roleMap.values()).map(r => r.role),
    resources: Array.from(resourceMap.values()),
    ruleCount,
  };
}

/**
 * For every node id, compute the set of all nodes reachable by walking edges
 * in either direction. Used by the hover spotlight: hovering N highlights
 * `chains.get(N.id)`.
 */
function computeChains(nodes: FlowNode[], edges: FlowEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const chains = new Map<string, Set<string>>();
  for (const n of nodes) {
    const visited = new Set<string>([n.id]);
    const stack = [n.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const nbrs = adj.get(cur);
      if (!nbrs) continue;
      for (const nb of nbrs) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    chains.set(n.id, visited);
  }
  return chains;
}

/** Plain-text grant-chain summary used by edge-click popovers. */
export function describeEdgeChain(edge: FlowEdge): string {
  if (edge.kind === 'role-resource' && edge.chain) {
    const c = edge.chain;
    const subs = c.subjects.map(s => s.id).join(', ');
    const verbs = (edge.verbs ?? []).join(', ');
    const ruleSummaries = c.rules
      .map(
        r =>
          `  - apiGroups:[${(r.apiGroups ?? []).join(', ')}] resources:[${(r.resources ?? []).join(', ')}] verbs:[${(r.verbs ?? []).join(', ')}]`,
      )
      .join('\n');
    const bindings = c.bindings.map(b => `${b.scope}/${b.namespace ? b.namespace + '/' : ''}${b.name}`).join(', ');
    return [
      `subjects: ${subs || '(none)'}`,
      `role: ${c.role.scope}/${c.role.namespace ? c.role.namespace + '/' : ''}${c.role.name}`,
      `bindings: ${bindings || '(none)'}`,
      `scope: ${c.namespaces.join(', ') || 'cluster'}`,
      `verbs: [${verbs}]`,
      `rules:\n${ruleSummaries}`,
    ].join('\n');
  }
  if (edge.kind === 'subject-role' && edge.bindings && edge.bindings.length > 0) {
    const lines = edge.bindings.map(b => {
      const scope = b.scope === 'ClusterRoleBinding' ? 'cluster' : `ns ${b.namespace}`;
      return `  - ${b.scope}/${b.name} (${scope})`;
    });
    return ['bindings:', ...lines].join('\n');
  }
  return '';
}

/** Short edge label for a subject→role link — picks the most specific binding. */
export function summariseBindings(bindings: Binding[] | undefined): string {
  if (!bindings || bindings.length === 0) return '';
  if (bindings.length === 1) {
    const b = bindings[0];
    if (!b) return '';
    if (b.scope === 'ClusterRoleBinding') return 'CRB';
    return `RB ${b.namespace ?? ''}`.trim();
  }
  // Multiple bindings — count and abbreviate.
  const crb = bindings.filter(b => b.scope === 'ClusterRoleBinding').length;
  const rb = bindings.length - crb;
  const parts: string[] = [];
  if (crb > 0) parts.push(`${crb} CRB`);
  if (rb > 0) parts.push(`${rb} RB`);
  return parts.join(' · ');
}
