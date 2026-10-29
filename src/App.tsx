import { HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { RepositoryProvider } from './data/RepositoryContext';
import type { Repository } from './data/repository';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

export default function App({ repo }: { repo: Repository }) {
  return (
    <RepositoryProvider repo={repo}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Placeholder title="Übersicht" />} />
              <Route path="new" element={<Placeholder title="Einfrieren" />} />
              <Route path="item/:id" element={<Placeholder title="Eintrag" />} />
              <Route path="item/:id/edit" element={<Placeholder title="Bearbeiten" />} />
              <Route path="scan" element={<Placeholder title="Scannen" />} />
              <Route path="take/:id" element={<Placeholder title="Entnehmen" />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </RepositoryProvider>
  );
}
