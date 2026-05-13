import type { RbacGraph } from '@/types/rbac';
import type { RbacUIState } from './actions';

/**
 * One workspace. Everything the user can drift between tabs lives here:
 * pasted yaml, parsed graph, filter, selection, baseline.
 */
export interface TabState extends RbacUIState {
  id: string;
  name: string;
}

export interface AppState {
  tabs: TabState[];
  activeTabId: string;
}

export const TABS_STORAGE_KEY = 'rbac-visualizer-tabs';
/** Legacy single-workspace key we silently absorb on first load. */
export const LEGACY_STORAGE_KEY = 'rbac-visualizer-state';
export const TABS_STORAGE_VERSION = 1;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyRbacState(): RbacUIState {
  return {
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
}

export function makeTab(name: string, overrides: Partial<RbacUIState> = {}): TabState {
  return {
    id: newId(),
    name,
    ...emptyRbacState(),
    ...overrides,
  };
}

export function defaultTabName(existing: TabState[]): string {
  // Stable counter so "config 3" stays "config 3" even after closing tab 2.
  let n = existing.length + 1;
  while (existing.some(t => t.name === `config ${n}`)) n++;
  return `config ${n}`;
}

export function newAppState(): AppState {
  const tab = makeTab('config 1');
  return { tabs: [tab], activeTabId: tab.id };
}

export function getActiveTab(state: AppState): TabState {
  const found = state.tabs.find(t => t.id === state.activeTabId);
  if (found) return found;
  // tabs[] is guaranteed non-empty by invariants; the fallback is defensive only.
  return state.tabs[0] ?? makeTab('config 1');
}

/* ─────────────────────────── serialization ─────────────────────────── */

// `Set<string>` doesn't survive JSON.stringify, so we marshal filter.verbs as an array.
interface SerializedTab {
  id: string;
  name: string;
  yaml: string;
  graph: RbacGraph | null;
  parseError: string | null;
  selectedId: string | null;
  filter: {
    namespace: string;
    verbs: string[];
    resource: string;
  };
  baseline: RbacGraph | null;
}

interface SerializedAppState {
  version: number;
  tabs: SerializedTab[];
  activeTabId: string;
}

function serializeTab(tab: TabState): SerializedTab {
  return {
    id: tab.id,
    name: tab.name,
    yaml: tab.yaml,
    graph: tab.graph,
    parseError: tab.parseError,
    selectedId: tab.selectedId,
    filter: {
      namespace: tab.filter.namespace,
      verbs: Array.from(tab.filter.verbs),
      resource: tab.filter.resource,
    },
    baseline: tab.baseline,
  };
}

function deserializeTab(raw: SerializedTab): TabState {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'untitled',
    yaml: typeof raw.yaml === 'string' ? raw.yaml : '',
    graph: raw.graph ?? null,
    parseError: raw.parseError ?? null,
    selectedId: raw.selectedId ?? null,
    filter: {
      namespace: raw.filter?.namespace ?? 'all',
      verbs: new Set<string>(Array.isArray(raw.filter?.verbs) ? raw.filter.verbs : []),
      resource: raw.filter?.resource ?? 'all',
    },
    baseline: raw.baseline ?? null,
  } as TabState;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateSerializedTab(v: unknown): v is SerializedTab {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || !v.id) return false;
  if (typeof v.name !== 'string') return false;
  if (typeof v.yaml !== 'string') return false;
  return true;
}

function validateSerializedApp(v: unknown): v is SerializedAppState {
  if (!isObject(v)) return false;
  if (typeof v.version !== 'number') return false;
  if (!Array.isArray(v.tabs) || v.tabs.length === 0) return false;
  if (!v.tabs.every(validateSerializedTab)) return false;
  if (typeof v.activeTabId !== 'string') return false;
  return v.tabs.some((t) => (t as SerializedTab).id === v.activeTabId);
}

export function loadAppState(): AppState {
  // Storage may be locked down (private mode, quota exceeded, missing window). Always
  // fall back to a fresh single-tab workspace rather than crash.
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return newAppState();
  }

  try {
    const raw = storage.getItem(TABS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateSerializedApp(parsed)) {
        return {
          tabs: parsed.tabs.map(deserializeTab),
          activeTabId: parsed.activeTabId,
        };
      }
    }
  } catch {
    // fall through to legacy/empty
  }

  // First load after deploying multi-tab: absorb any legacy single-workspace blob
  // as the first tab. We never had legacy persistence shipped, but the key is reserved
  // so the silent migration handles any out-of-tree experiments without losing work.
  try {
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (isObject(parsed)) {
        const tab = makeTab('config 1', absorbLegacy(parsed));
        storage.removeItem(LEGACY_STORAGE_KEY);
        return { tabs: [tab], activeTabId: tab.id };
      }
    }
  } catch {
    // ignore
  }

  return newAppState();
}

function absorbLegacy(raw: Record<string, unknown>): Partial<RbacUIState> {
  const out: Partial<RbacUIState> = {};
  if (typeof raw.yaml === 'string') out.yaml = raw.yaml;
  if (raw.graph && typeof raw.graph === 'object') out.graph = raw.graph as RbacGraph;
  if (raw.baseline && typeof raw.baseline === 'object') out.baseline = raw.baseline as RbacGraph;
  if (typeof raw.selectedId === 'string' || raw.selectedId === null) {
    out.selectedId = raw.selectedId as string | null;
  }
  if (isObject(raw.filter)) {
    const f = raw.filter;
    out.filter = {
      namespace: typeof f.namespace === 'string' ? f.namespace : 'all',
      verbs: new Set<string>(Array.isArray(f.verbs) ? (f.verbs as string[]) : []),
      resource: typeof f.resource === 'string' ? f.resource : 'all',
    };
  }
  return out;
}

export function saveAppState(state: AppState): void {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  try {
    const payload: SerializedAppState = {
      version: TABS_STORAGE_VERSION,
      tabs: state.tabs.map(serializeTab),
      activeTabId: state.activeTabId,
    };
    storage.setItem(TABS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded etc — silently drop the write; in-memory state still works
  }
}

/* ──────── tab list ops (used by reducer) ──────── */

export function withNewTab(state: AppState): AppState {
  const tab = makeTab(defaultTabName(state.tabs));
  return { tabs: [...state.tabs, tab], activeTabId: tab.id };
}

export function withRemovedTab(state: AppState, id: string): AppState {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx < 0) return state;
  const remaining = state.tabs.filter(t => t.id !== id);
  if (remaining.length === 0) {
    // last tab — replace with a fresh empty one rather than nuking the workspace
    const fresh = makeTab('config 1');
    return { tabs: [fresh], activeTabId: fresh.id };
  }
  const fallback = remaining[Math.min(idx, remaining.length - 1)] ?? remaining[0]!;
  const newActive = state.activeTabId === id ? fallback.id : state.activeTabId;
  return { tabs: remaining, activeTabId: newActive };
}

export function withRenamedTab(state: AppState, id: string, name: string): AppState {
  return {
    ...state,
    tabs: state.tabs.map(t => (t.id === id ? { ...t, name } : t)),
  };
}

export function withSwitchedTab(state: AppState, id: string): AppState {
  if (!state.tabs.some(t => t.id === id)) return state;
  return { ...state, activeTabId: id };
}

export function withDuplicatedTab(state: AppState, id: string): AppState {
  const src = state.tabs.find(t => t.id === id);
  if (!src) return state;
  const clone: TabState = {
    ...src,
    id: newId(),
    name: `${src.name} (copy)`,
    filter: { ...src.filter, verbs: new Set(src.filter.verbs) },
  };
  const idx = state.tabs.findIndex(t => t.id === id);
  const tabs = [...state.tabs];
  tabs.splice(idx + 1, 0, clone);
  return { tabs, activeTabId: clone.id };
}

export function withCloseOthers(state: AppState, id: string): AppState {
  const keep = state.tabs.find(t => t.id === id);
  if (!keep) return state;
  return { tabs: [keep], activeTabId: keep.id };
}
