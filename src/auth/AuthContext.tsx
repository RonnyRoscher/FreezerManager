import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRepository } from '../data/RepositoryContext';
import type { Session } from '../data/repository';

type AuthState = { session: Session; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    repo.getSession().then((session) => active && setState({ session, loading: false }));
    const unsubscribe = repo.onAuthChange((session) => setState({ session, loading: false }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repo]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
