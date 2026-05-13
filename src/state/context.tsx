import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { RbacAction, RbacUIState } from './actions';
import { appReducer, initialAppState } from './reducer';
import {
  type AppState,
  type TabState,
  getActiveTab,
  loadAppState,
  saveAppState,
} from './tabs';

/**
 * Two-layer context:
 *   - RbacContext  → `{ state, dispatch }` where `state` is the active tab's slice.
 *                    All existing view code (graph/flow/reverse/build/filters/etc) keeps
 *                    consuming this exact shape, sourced from the active tab.
 *   - TabsContext  → workspace-level: full tab list + activeTabId + dispatch.
 */

interface RbacContextValue {
  state: RbacUIState;
  dispatch: React.Dispatch<RbacAction>;
}

interface TabsContextValue {
  tabs: TabState[];
  activeTabId: string;
  dispatch: React.Dispatch<RbacAction>;
}

const RbacContext = createContext<RbacContextValue | null>(null);
const TabsContext = createContext<TabsContextValue | null>(null);

interface RbacProviderProps {
  children: ReactNode;
}

function lazyInit(): AppState {
  if (typeof window === 'undefined') return initialAppState;
  return loadAppState();
}

export function RbacProvider({ children }: RbacProviderProps) {
  const [app, dispatch] = useReducer(appReducer, undefined, lazyInit);

  // Debounced persistence to localStorage. We skip the very first write — load
  // already produced what's on disk.
  const firstWrite = useRef(true);
  useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }
    const id = window.setTimeout(() => saveAppState(app), 250);
    return () => window.clearTimeout(id);
  }, [app]);

  const activeTab = getActiveTab(app);

  const rbacValue = useMemo<RbacContextValue>(
    () => ({ state: activeTab, dispatch }),
    [activeTab],
  );

  const tabsValue = useMemo<TabsContextValue>(
    () => ({ tabs: app.tabs, activeTabId: app.activeTabId, dispatch }),
    [app.tabs, app.activeTabId],
  );

  return (
    <TabsContext.Provider value={tabsValue}>
      <RbacContext.Provider value={rbacValue}>{children}</RbacContext.Provider>
    </TabsContext.Provider>
  );
}

export function useRbacContext(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error('useRbacContext must be used inside RbacProvider');
  return ctx;
}

export function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabsContext must be used inside RbacProvider');
  return ctx;
}
