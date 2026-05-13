// Severity classification helpers — used by the flow chart view to colour
// nodes / edges based on what a rule actually grants. Pulls from the same
// heuristics as redflags.ts but exposes a typed enum the UI can dispatch on.

import type { Binding, PolicyRule, RbacGraph, Role, Subject } from '@/types/rbac';
import { effectiveRules } from './aggregation';

export type VerbSeverity = 'read' | 'mutate' | 'destroy' | 'wildcard';
export type RuleSeverity = 'safe' | 'mutate' | 'destroy' | 'wildcard';
export type SubjectSeverity = 'default' | 'sensitive' | 'admin';

const READ_VERBS = new Set(['get', 'list', 'watch']);
const MUTATE_VERBS = new Set(['create', 'update', 'patch']);
const DESTROY_VERBS = new Set(['delete', 'deletecollection']);

export const SENSITIVE_RESOURCES = new Set([
  'secrets',
  'serviceaccounts',
  'serviceaccounts/token',
  'pods/exec',
  'pods/attach',
  'nodes',
]);

/** Coarse classification of a single verb string. */
export function verbSeverity(verb: string): VerbSeverity {
  if (verb === '*') return 'wildcard';
  if (READ_VERBS.has(verb)) return 'read';
  if (MUTATE_VERBS.has(verb)) return 'mutate';
  if (DESTROY_VERBS.has(verb)) return 'destroy';
  // unknown / custom verb — treat as mutate to be conservative
  return 'mutate';
}

/** Worst-case severity for a verb list. wildcard > destroy > mutate > read. */
export function verbsSeverity(verbs: string[] | undefined): VerbSeverity {
  if (!verbs || verbs.length === 0) return 'read';
  let worst: VerbSeverity = 'read';
  for (const v of verbs) {
    const s = verbSeverity(v);
    if (s === 'wildcard') return 'wildcard';
    if (s === 'destroy') worst = 'destroy';
    else if (s === 'mutate' && worst !== 'destroy') worst = 'mutate';
  }
  return worst;
}

function hasWildcard(list: string[] | undefined): boolean {
  return !!list?.includes('*');
}

function touchesSensitive(rule: PolicyRule): boolean {
  if (!rule.resources) return false;
  if (hasWildcard(rule.resources)) return true;
  return rule.resources.some(r => SENSITIVE_RESOURCES.has(r));
}

/** Severity for a whole PolicyRule. Wildcard verb OR wildcard resource → wildcard. */
export function ruleSeverity(rule: PolicyRule): RuleSeverity {
  const wildVerb = hasWildcard(rule.verbs);
  const wildRes = hasWildcard(rule.resources);
  const wildApi = hasWildcard(rule.apiGroups);
  if (wildVerb && (wildRes || wildApi)) return 'wildcard';
  if (wildVerb || wildRes) return 'wildcard';
  const vs = verbsSeverity(rule.verbs);
  if (vs === 'wildcard') return 'wildcard';
  if (vs === 'destroy') return 'destroy';
  if (vs === 'mutate') {
    // mutate on sensitive resource bumps to destroy visually
    if (touchesSensitive(rule)) return 'destroy';
    return 'mutate';
  }
  return 'safe';
}

/** Does any rule on this role grant cluster-admin-equivalent power? */
export function roleIsClusterAdminLike(role: Role, graph: RbacGraph): boolean {
  const rules = effectiveRules(role, graph);
  return rules.some(
    r => hasWildcard(r.verbs) && hasWildcard(r.resources) && hasWildcard(r.apiGroups),
  );
}

/** Severity for a subject based on all roles bound to it. */
export function subjectSeverity(
  subject: Subject,
  graph: RbacGraph,
): SubjectSeverity {
  // Treat system:masters Group as admin regardless of explicit binding.
  if (subject.kind === 'Group' && subject.name === 'system:masters') return 'admin';

  let touchesSensitiveRule = false;
  for (const binding of graph.bindings) {
    if (!binding.subjects.some(s => s.id === subject.id)) continue;
    const role = findRoleForBinding(binding, graph);
    if (!role) continue;
    if (roleIsClusterAdminLike(role, graph)) return 'admin';
    const rules = effectiveRules(role, graph);
    for (const rule of rules) {
      if (touchesSensitive(rule) && verbsSeverity(rule.verbs) !== 'read') {
        touchesSensitiveRule = true;
      }
    }
  }
  return touchesSensitiveRule ? 'sensitive' : 'default';
}

function findRoleForBinding(binding: Binding, graph: RbacGraph): Role | undefined {
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

/** CSS variable for a verb-severity edge colour. */
export function verbSeverityColor(s: VerbSeverity): string {
  switch (s) {
    case 'read':
      return 'var(--theme-arrow-allow)';
    case 'mutate':
      return 'var(--theme-rating-2)';
    case 'destroy':
    case 'wildcard':
      return 'var(--theme-arrow-deny)';
  }
}

/** CSS variable for a rule-severity outline. */
export function ruleSeverityColor(s: RuleSeverity): string {
  switch (s) {
    case 'safe':
      return 'var(--theme-arrow-allow)';
    case 'mutate':
      return 'var(--theme-rating-2)';
    case 'destroy':
    case 'wildcard':
      return 'var(--theme-arrow-deny)';
  }
}

/** CSS variable for a subject outline. */
export function subjectSeverityColor(s: SubjectSeverity): string {
  switch (s) {
    case 'admin':
      return 'var(--theme-arrow-deny)';
    case 'sensitive':
      return 'var(--theme-rating-2)';
    case 'default':
      return 'var(--theme-accent)';
  }
}
