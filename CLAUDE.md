# RBAC "Who Can Do What" Visualizer — Tool Brief

**Folder:** `rbac-visualizer/` → future repo `Blackout-Industries/rbac-visualizer` → GitHub Pages `https://blackout-industries.github.io/rbac-visualizer/`

## What it is

Browser tool that turns a Kubernetes RBAC dump into a queryable graph of "which subject can do what to which resource." Solves the universal pain of RBAC analysis. CLI tools (`rbac-lookup`, `rakkess`, `kubectl-who-can`) exist but don't visualize and don't support offline analysis from a YAML dump.

## MVP scope

**Input modes (any combination):**
- Upload / paste / drag-drop multi-doc YAML containing `Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`, `ServiceAccount` (and optionally `Group`/`User` references in bindings)
- Suggested kubectl command shown in placeholder: `kubectl get roles,clusterroles,rolebindings,clusterrolebindings,serviceaccounts -A -o yaml`

**Two output modes (tabs):**

### Mode 1: Graph view
- Force-directed graph using **reactflow** (custom layout — group subjects on left, roles in middle, resources on right)
- Nodes: subjects (User/Group/SA), roles, resources (typed: `pods`, `secrets`, `*`, …)
- Edges: subject → role (from binding), role → resource (from rule)
- Filters in left rail: namespace dropdown, verb checkboxes (get/list/watch/create/update/patch/delete), resource type filter
- Click a node → side panel with details (where defined, which YAML doc)

### Mode 2: Reverse query
- Form: "Who can [verb] [resource] in namespace [ns]?"
- Result: ranked table of matching subjects, with the chain of binding → role → rule that grants it
- Red-flag highlights:
  - `*` verb or resource (cluster-admin-like)
  - SA mounted in a default namespace with cluster-wide delete on secrets
  - Wildcards in `resourceNames`

## Permission resolution logic (the hard part)

Implement RBAC permission resolution faithfully:
1. Aggregate `ClusterRole` rules via `aggregationRule.clusterRoleSelectors` matching `labels`
2. `RoleBinding` can reference either `Role` (same NS) or `ClusterRole` (scoped to that NS)
3. `ClusterRoleBinding` references `ClusterRole` and is cluster-wide
4. Wildcards: `*` in verbs, apiGroups, resources, resourceNames all match anything
5. `resourceNames` narrows a rule to specific named resources
6. `nonResourceURLs` is a separate axis (don't combine with resources)
7. Subject types: `User`, `Group`, `ServiceAccount` (the last has `namespace` field)
8. Built-in groups: `system:authenticated`, `system:unauthenticated`, `system:masters`, `system:serviceaccounts`, `system:serviceaccounts:<ns>`

**Reference:** https://kubernetes.io/docs/reference/access-authn-authz/rbac/

## Flagship scenario for verification

Paste this:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployer
  namespace: prod
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployer-secret
  namespace: prod
subjects:
- kind: ServiceAccount
  name: deployer
  namespace: prod
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

Reverse query: "Who can `get` `secrets` in namespace `prod`?" → returns `ServiceAccount/prod/deployer` with chain shown.

Reverse query: "Who can `delete` `secrets` in namespace `prod`?" → returns no results (only get/list granted).

## Specific deps

```json
"reactflow": "^11.11.4",
"@tanstack/react-table": "^8.21.3"
```

## Files to produce

- `src/types/rbac.ts` — `Subject`, `Rule`, `Role`, `Binding`, `PermissionEdge`
- `src/lib/rbac-parser.ts` — multi-doc YAML → typed RBAC objects
- `src/lib/rbac-resolver.ts` — query function `canSubjectDo(subject, verb, resource, namespace) → ChainOrNull`
- `src/lib/rbac-resolver.ts` also has `findSubjectsWith(verb, resource, namespace) → Subject[]`
- `src/lib/aggregation.ts` — handle ClusterRole aggregationRule
- `src/lib/redflags.ts` — pattern matches for cluster-admin-equivalent grants
- `src/components/GraphView.tsx` (reactflow), `ReverseQuery.tsx`, `Filters.tsx`, `SubjectDetail.tsx`
- `src/App.tsx` — tabbed shell

## Reuse from kpod

- Theme + index.css palette
- Multi-doc YAML parsing idiom from `kpod/src/lib/yaml-parser.ts`
- TanStack Table from kpod's editors for the reverse-query results table

## Out of scope for v0

- Live cluster connection (browser-only — input is paste/upload)
- OIDC group resolution beyond what's in the YAML
- Aggregated APIs / CRD-defined resources (just treat as opaque resource names)
