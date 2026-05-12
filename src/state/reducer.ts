import type {
  Binding,
  PolicyRule,
  RbacGraph,
  Role,
  ServiceAccountObj,
  Subject,
} from '@/types/rbac';
import { makeSubject } from '@/lib/rbac-parser';
import type { RbacAction, RbacUIState } from './actions';

export const initialState: RbacUIState = {
  yaml: '',
  graph: null,
  parseError: null,
  selectedId: null,
  filter: {
    namespace: 'all',
    verbs: new Set<string>(),
    resource: 'all',
  },
  baseline: null,
};

function recomputeDerived(
  roles: Role[],
  bindings: Binding[],
  serviceAccounts: ServiceAccountObj[],
  warnings: string[] = [],
): RbacGraph {
  const subjectMap = new Map<string, Subject>();
  const namespaceSet = new Set<string>();
  const resourceTypeSet = new Set<string>();

  for (const sa of serviceAccounts) {
    namespaceSet.add(sa.namespace);
    const s = makeSubject('ServiceAccount', sa.name, sa.namespace);
    if (!subjectMap.has(s.id)) subjectMap.set(s.id, s);
  }
  for (const r of roles) {
    if (r.namespace) namespaceSet.add(r.namespace);
    collectResourceTypes(r.rules, resourceTypeSet);
  }
  for (const b of bindings) {
    if (b.namespace) namespaceSet.add(b.namespace);
    for (const s of b.subjects) {
      if (!subjectMap.has(s.id)) subjectMap.set(s.id, s);
      if (s.kind === 'ServiceAccount' && s.namespace) namespaceSet.add(s.namespace);
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

function collectResourceTypes(rules: PolicyRule[], set: Set<string>) {
  for (const r of rules) {
    if (!r.resources) continue;
    for (const res of r.resources) {
      if (res && res !== '*') set.add(res);
    }
  }
}

function saId(sa: ServiceAccountObj): string {
  return `ServiceAccount/${sa.namespace}/${sa.name}`;
}

function applyIrChange(
  state: RbacUIState,
  next: {
    roles?: Role[];
    bindings?: Binding[];
    serviceAccounts?: ServiceAccountObj[];
  },
): RbacUIState {
  const roles = next.roles ?? state.graph?.roles ?? [];
  const bindings = next.bindings ?? state.graph?.bindings ?? [];
  const serviceAccounts = next.serviceAccounts ?? state.graph?.serviceAccounts ?? [];
  const graph = recomputeDerived(roles, bindings, serviceAccounts);
  return { ...state, graph, parseError: null };
}

export function rbacReducer(state: RbacUIState, action: RbacAction): RbacUIState {
  switch (action.type) {
    case 'SET_YAML':
      return { ...state, yaml: action.payload.yaml };
    case 'SET_GRAPH':
      return {
        ...state,
        graph: action.payload.graph,
        parseError: action.payload.error,
        selectedId: null,
        // SET_GRAPH comes from a fresh YAML parse — that's the new clean baseline.
        baseline: action.payload.graph,
      };
    case 'SET_SELECTED':
      return { ...state, selectedId: action.payload.id };
    case 'SET_FILTER_NAMESPACE':
      return { ...state, filter: { ...state.filter, namespace: action.payload.namespace } };
    case 'TOGGLE_FILTER_VERB': {
      const next = new Set(state.filter.verbs);
      if (next.has(action.payload.verb)) next.delete(action.payload.verb);
      else next.add(action.payload.verb);
      return { ...state, filter: { ...state.filter, verbs: next } };
    }
    case 'SET_FILTER_VERBS':
      return {
        ...state,
        filter: { ...state.filter, verbs: new Set(action.payload.verbs) },
      };
    case 'SET_FILTER_RESOURCE':
      return { ...state, filter: { ...state.filter, resource: action.payload.resource } };

    case 'ADD_ROLE': {
      const current = state.graph?.roles ?? [];
      return applyIrChange(state, { roles: [...current, action.payload.role] });
    }
    case 'UPDATE_ROLE': {
      const current = state.graph?.roles ?? [];
      const next = current.map(r => (r.id === action.payload.id ? action.payload.role : r));
      const newId = action.payload.role.id;
      const ns = state.selectedId === action.payload.id ? newId : state.selectedId;
      return { ...applyIrChange(state, { roles: next }), selectedId: ns };
    }
    case 'DELETE_ROLE': {
      const current = state.graph?.roles ?? [];
      const next = current.filter(r => r.id !== action.payload.id);
      const sel = state.selectedId === action.payload.id ? null : state.selectedId;
      return { ...applyIrChange(state, { roles: next }), selectedId: sel };
    }

    case 'ADD_BINDING': {
      const current = state.graph?.bindings ?? [];
      return applyIrChange(state, { bindings: [...current, action.payload.binding] });
    }
    case 'UPDATE_BINDING': {
      const current = state.graph?.bindings ?? [];
      const next = current.map(b => (b.id === action.payload.id ? action.payload.binding : b));
      const newId = action.payload.binding.id;
      const sel = state.selectedId === action.payload.id ? newId : state.selectedId;
      return { ...applyIrChange(state, { bindings: next }), selectedId: sel };
    }
    case 'DELETE_BINDING': {
      const current = state.graph?.bindings ?? [];
      const next = current.filter(b => b.id !== action.payload.id);
      const sel = state.selectedId === action.payload.id ? null : state.selectedId;
      return { ...applyIrChange(state, { bindings: next }), selectedId: sel };
    }

    case 'ADD_SA': {
      const current = state.graph?.serviceAccounts ?? [];
      return applyIrChange(state, { serviceAccounts: [...current, action.payload.sa] });
    }
    case 'UPDATE_SA': {
      const current = state.graph?.serviceAccounts ?? [];
      const next = current.map(sa => (saId(sa) === action.payload.id ? action.payload.sa : sa));
      const newId = saId(action.payload.sa);
      const sel = state.selectedId === action.payload.id ? newId : state.selectedId;
      return { ...applyIrChange(state, { serviceAccounts: next }), selectedId: sel };
    }
    case 'DELETE_SA': {
      const current = state.graph?.serviceAccounts ?? [];
      const next = current.filter(sa => saId(sa) !== action.payload.id);
      const sel = state.selectedId === action.payload.id ? null : state.selectedId;
      return { ...applyIrChange(state, { serviceAccounts: next }), selectedId: sel };
    }

    case 'APPLY_TEMPLATE': {
      const currentRoles = state.graph?.roles ?? [];
      const currentBindings = state.graph?.bindings ?? [];
      const currentSas = state.graph?.serviceAccounts ?? [];

      // Dedup by id — incoming wins on conflict.
      const incomingRoleIds = new Set(action.payload.roles.map(r => r.id));
      const incomingBindingIds = new Set(action.payload.bindings.map(b => b.id));
      const incomingSaIds = new Set(action.payload.serviceAccounts.map(s => saId(s)));

      const mergedRoles = [
        ...currentRoles.filter(r => !incomingRoleIds.has(r.id)),
        ...action.payload.roles,
      ];
      const mergedBindings = [
        ...currentBindings.filter(b => !incomingBindingIds.has(b.id)),
        ...action.payload.bindings,
      ];
      const mergedSas = [
        ...currentSas.filter(s => !incomingSaIds.has(saId(s))),
        ...action.payload.serviceAccounts,
      ];

      return applyIrChange(state, {
        roles: mergedRoles,
        bindings: mergedBindings,
        serviceAccounts: mergedSas,
      });
    }
    case 'SELECT_RESOURCE':
      return { ...state, selectedId: action.payload.id };

    case 'SNAPSHOT_BASELINE':
      return { ...state, baseline: state.graph };

    default:
      return state;
  }
}
