// Pure transformation: RbacGraph → 5-layer DAG model for the Flow Chart view.
//
// Layers (left to right): subject → binding → role → rule → resource
//
// A "rule node" corresponds to one PolicyRule on one role (post-aggregation).
// A "resource node" is a distinct (apiGroup, resource) tuple that was actually
// granted by some rule. Wildcards are represented as the literal "*" token —
// we do NOT expand them into every existing resource type.

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

export type FlowLayer = 'subject' | 'binding' | 'role' | 'rule' | 'resource';

export interface FlowSubjectNode {
  layer: 'subject';
  id: string;
  subject: Subject;
  severity: SubjectSeverity;
}

export interface FlowBindingNode {
  layer: 'binding';
  id: string;
  binding: Binding;
}

export interface FlowRoleNode {
  layer: 'role';
  id: string;
  role: Role;
}

export interface FlowRuleNode {
  layer: 'rule';
  id: string;
  role: Role;
  rule: PolicyRule;
  ruleIndex: number;
  severity: RuleSeverity;
}

export interface FlowResourceNode {
  layer: 'resource';
  id: string;
  apiGroup: string;
  resource: string;
}

export type FlowNode =
  | FlowSubjectNode
  | FlowBindingNode
  | FlowRoleNode
  | FlowRuleNode
  | FlowResourceNode;

export type FlowEdgeKind =
  | 'subject-binding'
  | 'binding-role'
  | 'role-rule'
  | 'rule-resource';

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: FlowEdgeKind;
  /** For rule→resource edges: the verbs that this rule grants on this resource. */
  verbs?: string[];
  verbSeverity?: VerbSeverity;
  /** Concatenated chain info for popovers. */
  chain?: {
    subjects: Subject[]; // subjects that reach this edge (only filled for rule-resource)
    role: Role;
    rule: PolicyRule;
    bindings: Binding[];
    namespace?: string;
  };
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Per-node: ids on the same connected chain. Used by hover spotlight. */
  chains: Map<string, Set<string>>;
  /** Subjects ordered. */
  subjects: Subject[];
  /** Roles in play. */
  roles: Role[];
  /** Total resource nodes. */
  resources: FlowResourceNode[];
}

const RESOURCE_WILDCARD = '*';

function resourceNodeId(apiGroup: string, resource: string): string {
  const g = apiGroup === '' ? 'core' : apiGroup;
  return `res::${g}::${resource}`;
}

function ruleNodeId(role: Role, ruleIndex: number): string {
  return `rule::${role.id}::${ruleIndex}`;
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

/**
 * Build the layered DAG model from the parsed RbacGraph.
 *
 * Only reachable nodes are emitted: a role appears only if some binding points
 * at it AND the binding has at least one subject; resources appear only if some
 * rule on a reachable role lists them.
 */
export function buildFlowGraph(graph: RbacGraph): FlowGraph {
  const subjectMap = new Map<string, FlowSubjectNode>();
  const bindingMap = new Map<string, FlowBindingNode>();
  const roleMap = new Map<string, FlowRoleNode>();
  const ruleMap = new Map<string, FlowRuleNode>();
  const resourceMap = new Map<string, FlowResourceNode>();
  const edges: FlowEdge[] = [];
  const edgeKey = new Set<string>();

  function addEdge(e: FlowEdge) {
    if (edgeKey.has(e.id)) return;
    edgeKey.add(e.id);
    edges.push(e);
  }

  for (const binding of graph.bindings) {
    const role = bindingResolvesToRole(binding, graph);
    if (!role) continue;
    if (binding.subjects.length === 0) continue;

    if (!bindingMap.has(binding.id)) {
      bindingMap.set(binding.id, { layer: 'binding', id: binding.id, binding });
    }
    if (!roleMap.has(role.id)) {
      roleMap.set(role.id, { layer: 'role', id: role.id, role });
    }

    // subjects → binding
    for (const subj of binding.subjects) {
      if (!subjectMap.has(subj.id)) {
        subjectMap.set(subj.id, {
          layer: 'subject',
          id: subj.id,
          subject: subj,
          severity: subjectSeverity(subj, graph),
        });
      }
      addEdge({
        id: `e::${subj.id}->${binding.id}`,
        source: subj.id,
        target: binding.id,
        kind: 'subject-binding',
      });
    }

    // binding → role
    addEdge({
      id: `e::${binding.id}->${role.id}`,
      source: binding.id,
      target: role.id,
      kind: 'binding-role',
    });

    // role → rule(s) → resource(s)
    const rules = effectiveRules(role, graph);
    rules.forEach((rule, ruleIndex) => {
      const rId = ruleNodeId(role, ruleIndex);
      if (!ruleMap.has(rId)) {
        ruleMap.set(rId, {
          layer: 'rule',
          id: rId,
          role,
          rule,
          ruleIndex,
          severity: ruleSeverity(rule),
        });
      }
      addEdge({
        id: `e::${role.id}->${rId}`,
        source: role.id,
        target: rId,
        kind: 'role-rule',
      });

      const apiGroups = rule.apiGroups && rule.apiGroups.length > 0 ? rule.apiGroups : [''];
      const resources = rule.resources && rule.resources.length > 0
        ? rule.resources
        : rule.nonResourceURLs && rule.nonResourceURLs.length > 0
          ? rule.nonResourceURLs.map(u => `url:${u}`)
          : [];
      if (resources.length === 0) return;

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
          const verbs = rule.verbs ?? [];
          addEdge({
            id: `e::${rId}->${resKey}`,
            source: rId,
            target: resKey,
            kind: 'rule-resource',
            verbs,
            verbSeverity:
              verbs.includes(RESOURCE_WILDCARD) ? 'wildcard' : verbsSeverity(verbs),
            chain: {
              subjects: binding.subjects,
              role,
              rule,
              bindings: [binding],
              namespace:
                binding.scope === 'ClusterRoleBinding' ? undefined : binding.namespace,
            },
          });
        }
      }
    });
  }

  const nodes: FlowNode[] = [
    ...subjectMap.values(),
    ...bindingMap.values(),
    ...roleMap.values(),
    ...ruleMap.values(),
    ...resourceMap.values(),
  ];

  const chains = computeChains(nodes, edges);

  return {
    nodes,
    edges,
    chains,
    subjects: Array.from(subjectMap.values()).map(s => s.subject),
    roles: Array.from(roleMap.values()).map(r => r.role),
    resources: Array.from(resourceMap.values()),
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
  if (edge.kind !== 'rule-resource' || !edge.chain) return '';
  const c = edge.chain;
  const subs = c.subjects.map(s => s.id).join(', ');
  const verbs = (edge.verbs ?? []).join(', ');
  const apiGroup = c.rule.apiGroups?.join(', ') ?? '';
  const resources = c.rule.resources?.join(', ') ?? '';
  const ns = c.namespace ? `ns ${c.namespace}` : 'cluster-wide';
  return [
    `subjects: ${subs || '(none)'}`,
    `role: ${c.role.scope}/${c.role.namespace ? c.role.namespace + '/' : ''}${c.role.name}`,
    `apiGroups: [${apiGroup}]`,
    `resources: [${resources}]`,
    `verbs: [${verbs}]`,
    `scope: ${ns}`,
  ].join('\n');
}
