import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepository } from '../data/RepositoryContext';
import type { Profile } from '../domain/types';

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  switchHousehold(id: string | null): Promise<void>;
  reload(): Promise<void>;
};

const ProfileContext = createContext<ProfileState>({
  profile: null,
  loading: true,
  switchHousehold: async () => {},
  reload: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const activeId = useRef<string | null | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const next = await repo.getProfile();
      activeId.current = next?.activeHousehold?.id ?? null;
      setProfile(next);
    } catch {
      // keep the last known profile; the next focus tries again
    } finally {
      setLoading(false);
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
      await repo.setActiveHousehold(id);
      await reload();
      navigate('/');
    },
    [repo, reload, navigate],
  );

  const value = useMemo(
    () => ({ profile, loading, switchHousehold, reload }),
    [profile, loading, switchHousehold, reload],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  return useContext(ProfileContext);
}
