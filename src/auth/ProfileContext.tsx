import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepository } from '../data/RepositoryContext';
import type { Profile } from '../domain/types';

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  error: boolean;
  switchError: string | null;
  switchHousehold(id: string | null): Promise<void>;
  reload(): Promise<void>;
};

const ProfileContext = createContext<ProfileState>({
  profile: null,
  loading: true,
  error: false,
  switchError: null,
  switchHousehold: async () => {},
  reload: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await repo.getProfile();
      if (id !== requestId.current) return;
      setProfile(next);
      setError(next === null);
    } catch {
      // keep the last known profile; a later focus or the retry button tries again
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  const switchHousehold = useCallback(
    async (id: string | null) => {
      setSwitchError(null);
      try {
        await repo.setActiveHousehold(id);
        await reload();
        navigate('/');
      } catch {
        setSwitchError('Wechsel fehlgeschlagen. Bitte erneut versuchen.');
        await reload();
      }
    },
    [repo, reload, navigate],
  );

  const value = useMemo(
    () => ({ profile, loading, error, switchError, switchHousehold, reload }),
    [profile, loading, error, switchError, switchHousehold, reload],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  return useContext(ProfileContext);
}
