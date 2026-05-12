import type { Binding, Role, ServiceAccountObj } from '@/types/rbac';
import { makeSubject } from '@/lib/rbac-parser';

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  build(): {
    roles: Role[];
    bindings: Binding[];
    serviceAccounts: ServiceAccountObj[];
  };
}

function clusterRole(name: string, rules: Role['rules']): Role {
  return {
    scope: 'ClusterRole',
    name,
    labels: {},
    rules,
    id: `ClusterRole/${name}`,
    docIndex: 0,
  };
}

function role(name: string, namespace: string, rules: Role['rules']): Role {
  return {
    scope: 'Role',
    name,
    namespace,
    labels: {},
    rules,
    id: `Role/${namespace}/${name}`,
    docIndex: 0,
  };
}

function sa(name: string, namespace: string): ServiceAccountObj {
  return { name, namespace, docIndex: 0 };
}

function crb(
  name: string,
  saName: string,
  saNamespace: string,
  clusterRoleName: string,
): Binding {
  return {
    scope: 'ClusterRoleBinding',
    name,
    subjects: [makeSubject('ServiceAccount', saName, saNamespace)],
    roleRef: { kind: 'ClusterRole', name: clusterRoleName, apiGroup: 'rbac.authorization.k8s.io' },
    id: `ClusterRoleBinding/${name}`,
    docIndex: 0,
  };
}

function rb(
  name: string,
  namespace: string,
  saName: string,
  saNamespace: string,
  ref: { kind: 'Role' | 'ClusterRole'; name: string },
): Binding {
  return {
    scope: 'RoleBinding',
    name,
    namespace,
    subjects: [makeSubject('ServiceAccount', saName, saNamespace)],
    roleRef: { kind: ref.kind, name: ref.name, apiGroup: 'rbac.authorization.k8s.io' },
    id: `RoleBinding/${namespace}/${name}`,
    docIndex: 0,
  };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'read-only-pod-watcher',
    name: 'read-only-pod-watcher',
    description: 'cluster-wide get/list/watch on pods — a safe observer SA',
    build() {
      const cr = clusterRole('pod-watcher', [
        {
          verbs: ['get', 'list', 'watch'],
          apiGroups: [''],
          resources: ['pods'],
        },
      ]);
      const account = sa('pod-watcher', 'observability');
      const binding = crb(
        'pod-watcher-binding',
        account.name,
        account.namespace,
        cr.name,
      );
      return { roles: [cr], bindings: [binding], serviceAccounts: [account] };
    },
  },
  {
    id: 'namespace-deployer',
    name: 'namespace-deployer',
    description: 'role + rolebinding + SA: full deploy/replicaset/service control in one namespace',
    build() {
      const r = role('deployer', 'apps', [
        {
          verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
          apiGroups: ['apps'],
          resources: ['deployments', 'replicasets'],
        },
        {
          verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
          apiGroups: [''],
          resources: ['services', 'configmaps'],
        },
      ]);
      const account = sa('deployer', 'apps');
      const binding = rb(
        'deployer-binding',
        'apps',
        account.name,
        account.namespace,
        { kind: 'Role', name: r.name },
      );
      return { roles: [r], bindings: [binding], serviceAccounts: [account] };
    },
  },
  {
    id: 'secrets-reader',
    name: 'secrets-reader',
    description: 'get/list secrets in one namespace — flagged sensitive by the visualizer',
    build() {
      const r = role('secrets-reader', 'prod', [
        {
          verbs: ['get', 'list'],
          apiGroups: [''],
          resources: ['secrets'],
        },
      ]);
      const account = sa('secret-puller', 'prod');
      const binding = rb(
        'secrets-reader-binding',
        'prod',
        account.name,
        account.namespace,
        { kind: 'Role', name: r.name },
      );
      return { roles: [r], bindings: [binding], serviceAccounts: [account] };
    },
  },
  {
    id: 'admin-clone',
    name: 'admin-clone',
    description: 'SA bound cluster-wide to cluster-admin — maximum red-flag example',
    build() {
      // We define a local cluster-admin clone instead of relying on the built-in
      // cluster-admin name (which may not be present in the IR).
      const cr = clusterRole('cluster-admin-clone', [
        {
          verbs: ['*'],
          apiGroups: ['*'],
          resources: ['*'],
        },
        {
          verbs: ['*'],
          nonResourceURLs: ['*'],
        },
      ]);
      const account = sa('overlord', 'default');
      const binding = crb(
        'overlord-binding',
        account.name,
        account.namespace,
        cr.name,
      );
      return { roles: [cr], bindings: [binding], serviceAccounts: [account] };
    },
  },
];
