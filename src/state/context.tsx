import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { RbacAction, RbacUIState } from './actions';
import { initialState, rbacReducer } from './reducer';

interface RbacContextValue {
  state: RbacUIState;
  dispatch: React.Dispatch<RbacAction>;
}

const RbacContext = createContext<RbacContextValue | null>(null);

interface RbacProviderProps {
  children: ReactNode;
}

export function RbacProvider({ children }: RbacProviderProps) {
  const [state, dispatch] = useReducer(rbacReducer, initialState);
  return <RbacContext.Provider value={{ state, dispatch }}>{children}</RbacContext.Provider>;
}

export function useRbacContext(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error('useRbacContext must be used inside RbacProvider');
  return ctx;
}
