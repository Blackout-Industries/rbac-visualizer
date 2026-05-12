import yaml from 'js-yaml';
import type {
  Binding,
  RbacGraph,
  Role,
  RoleRef,
  ServiceAccountObj,
  Subject,
  SubjectKind,
} from '@/types/rbac';

export class RbacParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbacParseError';
  }
}

interface RawDoc {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  rules?: unknown;
  aggregationRule?: unknown;
  subjects?: unknown;
  roleRef?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function parseRules(rules: unknown): Role['rules'] {
  if (!Array.isArray(rules)) return [];
  const out: Role['rules'] = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const verbs = asStringArray(obj.verbs);
    if (verbs.length === 0) continue;
    out.push({
      verbs,
      apiGroups: obj.apiGroups !== undefined ? asStringArray(obj.apiGroups) : undefined,
      resources: obj.resources !== undefined ? asStringArray(obj.resources) : undefined,
      resourceNames: obj.resourceNames !== undefined ? asStringArray(obj.resourceNames) : undefined,
      nonResourceURLs: obj.nonResourceURLs !== undefined ? asStringArray(obj.nonResourceURLs) : undefined,
    });
  }
  return out;
}

function parseAggregationRule(aggr: unknown): Role['aggregationRule'] {
  if (!aggr || typeof aggr !== 'object') return undefined;
  const obj = aggr as Record<string, unknown>;
  const selectors = obj.clusterRoleSelectors;
  if (!Array.isArray(selectors)) return { clusterRoleSelectors: [] };
  return {
    clusterRoleSelectors: selectors
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map(s => ({
        matchLabels:
          s.matchLabels && typeof s.matchLabels === 'object'
            ? { ...(s.matchLabels as Record<string, string>) }
            : undefined,
        matchExpressions: Array.isArray(s.matchExpressions)
          ? (s.matchExpressions as Array<Record<string, unknown>>).map(e => ({
              key: String(e.key ?? ''),
              operator: (e.operator as 'In' | 'NotIn' | 'Exists' | 'DoesNotExist') ?? 'In',
              values: Array.isArray(e.values) ? asStringArray(e.values) : undefined,
            }))
          : undefined,
      })),
  };
}

function parseSubjects(subjects: unknown): Subject[] {
  if (!Array.isArray(subjects)) return [];
  const out: Subject[] = [];
  for (const s of subjects) {
    if (!s || typeof s !== 'object') continue;
    const obj = s as Record<string, unknown>;
    const kindRaw = typeof obj.kind === 'string' ? obj.kind : '';
    const name = typeof obj.name === 'string' ? obj.name : '';
    if (!name) continue;
    let kind: SubjectKind;
    if (kindRaw === 'User' || kindRaw === 'Group' || kindRaw === 'ServiceAccount') {
      kind = kindRaw;
    } else {
      continue;
    }
    const namespace = typeof obj.namespace === 'string' ? obj.namespace : undefined;
    out.push(makeSubject(kind, name, namespace));
  }
  return out;
}

export function makeSubject(kind: SubjectKind, name: string, namespace?: string): Subject {
  const id =
    kind === 'ServiceAccount'
      ? `ServiceAccount/${namespace ?? 'default'}/${name}`
      : `${kind}/${name}`;
  return {
    kind,
    name,
    namespace: kind === 'ServiceAccount' ? (namespace ?? 'default') : namespace,
    id,
  };
}

function parseRoleRef(ref: unknown): RoleRef | null {
  if (!ref || typeof ref !== 'object') return null;
  const obj = ref as Record<string, unknown>;
  const kind = obj.kind;
  const name = obj.name;
  if ((kind !== 'Role' && kind !== 'ClusterRole') || typeof name !== 'string') return null;
  return {
    kind,
    name,
    apiGroup: typeof obj.apiGroup === 'string' ? obj.apiGroup : 'rbac.authorization.k8s.io',
  };
}

function roleId(scope: 'Role' | 'ClusterRole', name: string, namespace?: string): string {
  return scope === 'ClusterRole' ? `ClusterRole/${name}` : `Role/${namespace ?? 'default'}/${name}`;
}

function bindingId(
  scope: 'RoleBinding' | 'ClusterRoleBinding',
  name: string,
  namespace?: string,
): string {
  return scope === 'ClusterRoleBinding'
    ? `ClusterRoleBinding/${name}`
    : `RoleBinding/${namespace ?? 'default'}/${name}`;
}

/** Parse a multi-document YAML stream of RBAC objects. */
export function parseRbacYaml(yamlString: string): RbacGraph {
  let docs: unknown[];
  try {
    docs = yaml.loadAll(yamlString);
  } catch (e) {
    throw new RbacParseError(
      `Invalid YAML syntax: ${e instanceof Error ? e.message : 'parse error'}`,
    );
  }

  const roles: Role[] = [];
  const bindings: Binding[] = [];
  const serviceAccounts: ServiceAccountObj[] = [];
  const warnings: string[] = [];
  const subjectMap = new Map<string, Subject>();
  const namespaceSet = new Set<string>();
  const resourceTypeSet = new Set<string>();

  // Some kubectl dumps wrap many objects under a List kind. Unwrap them.
  const flatDocs: { doc: RawDoc; docIndex: number }[] = [];
  let idx = 0;
  for (const raw of docs) {
    if (!raw || typeof raw !== 'object') {
      idx++;
      continue;
    }
    const d = raw as RawDoc & { items?: unknown };
    if (
      typeof d.kind === 'string' &&
      d.kind.endsWith('List') &&
      Array.isArray((d as { items?: unknown }).items)
    ) {
      const items = (d as { items: unknown[] }).items;
      for (const item of items) {
        if (item && typeof item === 'object') {
          flatDocs.push({ doc: item as RawDoc, docIndex: idx });
        }
      }
    } else {
      flatDocs.push({ doc: d, docIndex: idx });
    }
    idx++;
  }

  for (const { doc, docIndex } of flatDocs) {
    const kind = doc.kind ?? '';
    const name = doc.metadata?.name ?? '';
    if (!name) continue;
    const namespace = doc.metadata?.namespace;
    const labels = doc.metadata?.labels ?? {};

    if (kind === 'Role') {
      if (!namespace) {
        warnings.push(`Role/${name} missing namespace — defaulted to "default"`);
      }
      const role: Role = {
        scope: 'Role',
        name,
        namespace: namespace ?? 'default',
        labels: { ...labels },
        rules: parseRules(doc.rules),
        id: roleId('Role', name, namespace ?? 'default'),
        docIndex,
      };
      roles.push(role);
      namespaceSet.add(role.namespace ?? 'default');
      collectResourceTypes(role.rules, resourceTypeSet);
    } else if (kind === 'ClusterRole') {
      const role: Role = {
        scope: 'ClusterRole',
        name,
        labels: { ...labels },
        rules: parseRules(doc.rules),
        aggregationRule: parseAggregationRule(doc.aggregationRule),
        id: roleId('ClusterRole', name),
        docIndex,
      };
      roles.push(role);
      collectResourceTypes(role.rules, resourceTypeSet);
    } else if (kind === 'RoleBinding') {
      const ref = parseRoleRef(doc.roleRef);
      if (!ref) {
        warnings.push(`RoleBinding/${namespace ?? 'default'}/${name} has invalid roleRef`);
        continue;
      }
      const subs = parseSubjects(doc.subjects);
      const binding: Binding = {
        scope: 'RoleBinding',
        name,
        namespace: namespace ?? 'default',
        subjects: subs,
        roleRef: ref,
        id: bindingId('RoleBinding', name, namespace ?? 'default'),
        docIndex,
      };
      bindings.push(binding);
      namespaceSet.add(binding.namespace ?? 'default');
      for (const s of subs) {
        if (!subjectMap.has(s.id)) subjectMap.set(s.id, s);
        if (s.kind === 'ServiceAccount' && s.namespace) namespaceSet.add(s.namespace);
      }
    } else if (kind === 'ClusterRoleBinding') {
      const ref = parseRoleRef(doc.roleRef);
      if (!ref) {
        warnings.push(`ClusterRoleBinding/${name} has invalid roleRef`);
        continue;
      }
      if (ref.kind !== 'ClusterRole') {
        warnings.push(
          `ClusterRoleBinding/${name} must reference ClusterRole, got ${ref.kind} — ignored`,
        );
        continue;
      }
      const subs = parseSubjects(doc.subjects);
      const binding: Binding = {
        scope: 'ClusterRoleBinding',
        name,
        subjects: subs,
        roleRef: ref,
        id: bindingId('ClusterRoleBinding', name),
        docIndex,
      };
      bindings.push(binding);
      for (const s of subs) {
        if (!subjectMap.has(s.id)) subjectMap.set(s.id, s);
        if (s.kind === 'ServiceAccount' && s.namespace) namespaceSet.add(s.namespace);
      }
    } else if (kind === 'ServiceAccount') {
      const ns = namespace ?? 'default';
      const sa: ServiceAccountObj = { name, namespace: ns, docIndex };
      serviceAccounts.push(sa);
      namespaceSet.add(ns);
      const subj = makeSubject('ServiceAccount', name, ns);
      if (!subjectMap.has(subj.id)) subjectMap.set(subj.id, subj);
    } else if (kind) {
      warnings.push(`Unsupported kind: ${kind} (${name}) — skipped`);
    }
  }

  return {
    roles,
    bindings,
    serviceAccounts,
    subjects: Array.from(subjectMap.values()),
    namespaces: Array.from(namespaceSet).sort(),
    resourceTypes: Array.from(resourceTypeSet).sort(),
    warnings,
  };
}

function collectResourceTypes(rules: Role['rules'], set: Set<string>) {
  for (const r of rules) {
    if (!r.resources) continue;
    for (const res of r.resources) {
      if (res && res !== '*') set.add(res);
    }
  }
}
