import { HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { RepositoryProvider } from './data/RepositoryContext';
import type { Repository } from './data/repository';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { ItemFormPage } from './pages/ItemFormPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ScanPage } from './pages/ScanPage';
import { SettingsPage } from './pages/SettingsPage';
import { TakePage } from './pages/TakePage';

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
              <Route index element={<OverviewPage />} />
              <Route path="new" element={<ItemFormPage />} />
              <Route path="item/:id" element={<ItemDetailPage />} />
              <Route path="item/:id/edit" element={<ItemFormPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="take/:id" element={<TakePage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </RepositoryProvider>
  );
}
