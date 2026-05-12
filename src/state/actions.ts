import type { Binding, RbacGraph, Role, ServiceAccountObj } from '@/types/rbac';

export interface FilterState {
  namespace: string | 'all';
  verbs: Set<string>;
  resource: string | 'all';
}

export interface RbacUIState {
  yaml: string;
  graph: RbacGraph | null;
  parseError: string | null;
  selectedId: string | null;
  filter: FilterState;
  /** Snapshot of the graph used as the "clean" baseline for the live impact preview. */
  baseline: RbacGraph | null;
}

export type RbacAction =
  | { type: 'SET_YAML'; payload: { yaml: string } }
  | { type: 'SET_GRAPH'; payload: { graph: RbacGraph | null; error: string | null } }
  | { type: 'SET_SELECTED'; payload: { id: string | null } }
  | { type: 'SET_FILTER_NAMESPACE'; payload: { namespace: string | 'all' } }
  | { type: 'TOGGLE_FILTER_VERB'; payload: { verb: string } }
  | { type: 'SET_FILTER_VERBS'; payload: { verbs: string[] } }
  | { type: 'SET_FILTER_RESOURCE'; payload: { resource: string | 'all' } }
  | { type: 'ADD_ROLE'; payload: { role: Role } }
  | { type: 'UPDATE_ROLE'; payload: { id: string; role: Role } }
  | { type: 'DELETE_ROLE'; payload: { id: string } }
  | { type: 'ADD_BINDING'; payload: { binding: Binding } }
  | { type: 'UPDATE_BINDING'; payload: { id: string; binding: Binding } }
  | { type: 'DELETE_BINDING'; payload: { id: string } }
  | { type: 'ADD_SA'; payload: { sa: ServiceAccountObj } }
  | { type: 'UPDATE_SA'; payload: { id: string; sa: ServiceAccountObj } }
  | { type: 'DELETE_SA'; payload: { id: string } }
  | { type: 'APPLY_TEMPLATE'; payload: { roles: Role[]; bindings: Binding[]; serviceAccounts: ServiceAccountObj[] } }
  | { type: 'SELECT_RESOURCE'; payload: { id: string | null } }
  | { type: 'SNAPSHOT_BASELINE' };

export const setYaml = (yaml: string): RbacAction => ({ type: 'SET_YAML', payload: { yaml } });
export const setGraph = (
  graph: RbacGraph | null,
  error: string | null,
): RbacAction => ({ type: 'SET_GRAPH', payload: { graph, error } });
export const setSelected = (id: string | null): RbacAction => ({
  type: 'SET_SELECTED',
  payload: { id },
});
export const setFilterNamespace = (namespace: string | 'all'): RbacAction => ({
  type: 'SET_FILTER_NAMESPACE',
  payload: { namespace },
});
export const toggleFilterVerb = (verb: string): RbacAction => ({
  type: 'TOGGLE_FILTER_VERB',
  payload: { verb },
});
export const setFilterVerbs = (verbs: string[]): RbacAction => ({
  type: 'SET_FILTER_VERBS',
  payload: { verbs },
});
export const setFilterResource = (resource: string | 'all'): RbacAction => ({
  type: 'SET_FILTER_RESOURCE',
  payload: { resource },
});

export const addRole = (role: Role): RbacAction => ({ type: 'ADD_ROLE', payload: { role } });
export const updateRole = (id: string, role: Role): RbacAction => ({
  type: 'UPDATE_ROLE',
  payload: { id, role },
});
export const deleteRole = (id: string): RbacAction => ({ type: 'DELETE_ROLE', payload: { id } });

export const addBinding = (binding: Binding): RbacAction => ({
  type: 'ADD_BINDING',
  payload: { binding },
});
export const updateBinding = (id: string, binding: Binding): RbacAction => ({
  type: 'UPDATE_BINDING',
  payload: { id, binding },
});
export const deleteBinding = (id: string): RbacAction => ({
  type: 'DELETE_BINDING',
  payload: { id },
});

export const addSa = (sa: ServiceAccountObj): RbacAction => ({ type: 'ADD_SA', payload: { sa } });
export const updateSa = (id: string, sa: ServiceAccountObj): RbacAction => ({
  type: 'UPDATE_SA',
  payload: { id, sa },
});
export const deleteSa = (id: string): RbacAction => ({ type: 'DELETE_SA', payload: { id } });

export const applyTemplate = (
  roles: Role[],
  bindings: Binding[],
  serviceAccounts: ServiceAccountObj[],
): RbacAction => ({
  type: 'APPLY_TEMPLATE',
  payload: { roles, bindings, serviceAccounts },
});

export const selectResource = (id: string | null): RbacAction => ({
  type: 'SELECT_RESOURCE',
  payload: { id },
});

export const snapshotBaseline = (): RbacAction => ({ type: 'SNAPSHOT_BASELINE' });
