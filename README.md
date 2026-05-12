# RBAC Visualizer

Paste your cluster's RBAC YAML, get a graph and a "who can do what" search. No live cluster required.

[![CI](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/ci.yml)
[![Deploy](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/pages.yml/badge.svg)](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/pages.yml)
[![CodeQL](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/codeql.yml/badge.svg)](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/codeql.yml)
[![Trivy](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/trivy.yml/badge.svg)](https://github.com/Blackout-Industries/rbac-visualizer/actions/workflows/trivy.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Blackout-Industries/rbac-visualizer/badge)](https://scorecard.dev/viewer/?uri=github.com/Blackout-Industries/rbac-visualizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Live demo: https://blackout-industries.github.io/rbac-visualizer/

## What it does

- Takes a multi-doc YAML dump of `Roles`, `ClusterRoles`, `RoleBindings`, `ClusterRoleBindings`, `ServiceAccounts`.
- Renders a force-directed graph of subject → role → resource.
- Reverse query: "who can [verb] [resource] in [namespace]?" Returns the chain that grants it.
- Flags wildcards, cluster-admin-equivalent grants, and dangerous secret access.
- Handles `aggregationRule`, `RoleBinding → ClusterRole`, `resourceNames`, system groups.

Get a dump with `kubectl get roles,clusterroles,rolebindings,clusterrolebindings,serviceaccounts -A -o yaml` and paste it in.

## Quick start

```bash
docker compose up
# open http://localhost:5173
```

Non-Docker: `npm install && npm run dev`.

## Tech

| Layer | What |
|-------|------|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind v4 |
| Graph | reactflow v11 |
| Tables | TanStack Table v8 |

## Limits

- No live cluster connection. YAML in, answers out.
- OIDC group claims aren't resolved beyond what's in the YAML.
- Aggregated APIs and CRD-defined resources are treated as opaque names.

## Versioning

[SemVer](https://semver.org), computed by [GitVersion](https://gitversion.net) on push to `main`. Default bump is patch. Override per commit with a `+semver: major|minor|patch|none` footer. The computed version lands in the Vite build as `__APP_VERSION__`.

## License

MIT — see LICENSE.
