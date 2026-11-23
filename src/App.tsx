import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProfileProvider, useProfile } from './auth/ProfileContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { RepositoryProvider } from './data/RepositoryContext';
import type { Repository } from './data/repository';
import { PrinterProvider } from './printer/PrinterContext';
import type { Printer } from './printer/printerService';
import { AdminPage } from './pages/AdminPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { ItemFormPage } from './pages/ItemFormPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ScanPage } from './pages/ScanPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { TakePage } from './pages/TakePage';

function AdminRoute() {
  const { profile } = useProfile();
  return profile?.isAdmin ? <AdminPage /> : <Navigate to="/" replace />;
}

export default function App({
  repo,
  printer,
  authMessage,
}: {
  repo: Repository;
  printer: Printer;
  authMessage?: string;
}) {
  return (
    <RepositoryProvider repo={repo}>
      <PrinterProvider printer={printer}>
        <AuthProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginPage authMessage={authMessage} />} />
              <Route
                element={
                  <RequireAuth>
                    <ProfileProvider>
                      <Layout />
                    </ProfileProvider>
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
                <Route path="admin" element={<AdminRoute />} />
                <Route path="passwort" element={<SetPasswordPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </AuthProvider>
      </PrinterProvider>
    </RepositoryProvider>
  );
}
