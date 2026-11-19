import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { handleAuthRedirect, parseAuthRedirect } from './auth/authRedirect';
import type { Repository } from './data/repository';
import './styles.css';

// Read before the Supabase client exists: it clears the tokens from the URL.
const authRedirect = parseAuthRedirect(window.location.hash);

async function createRepository(): Promise<Repository> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    const { createDemoRepository } = await import('./data/demoRepository');
    document.body.classList.add('demo');
    return createDemoRepository();
  }
  const [{ supabase }, { createSupabaseRepository }] = await Promise.all([
    import('./data/supabaseClient'),
    import('./data/supabaseRepository'),
  ]);
  return createSupabaseRepository(supabase);
}

createRepository().then(async (repo) => {
  const authMessage = await handleAuthRedirect(repo, authRedirect);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App repo={repo} authMessage={authMessage} />
    </React.StrictMode>,
  );
});
