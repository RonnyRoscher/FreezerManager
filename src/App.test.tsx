import { render, screen } from '@testing-library/react';
import App from './App';
import { fakePrinter } from './test/fakePrinter';
import userEvent from '@testing-library/user-event';
import { renderApp, seededRepository } from './test/renderApp';

const loggedOut = () => seededRepository({ session: null });

test('shows the login form without a session', async () => {
  renderApp('#/take/abc', loggedOut());
  expect(await screen.findByLabelText('E-Mail')).toBeInTheDocument();
  expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
});

test('returns to the originally requested route after login', async () => {
  renderApp('#/take/abc', loggedOut());
  await userEvent.type(await screen.findByLabelText('E-Mail'), 'ich@example.de');
  await userEvent.type(screen.getByLabelText('Passwort'), 'geheim');
  await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
  expect(await screen.findByRole('heading', { name: 'Entnehmen' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#/take/abc');
});

test('shows an error for wrong credentials', async () => {
  renderApp('#/', loggedOut());
  await userEvent.type(await screen.findByLabelText('E-Mail'), 'ich@example.de');
  await userEvent.type(screen.getByLabelText('Passwort'), 'falsch');
  await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
  expect(await screen.findByText('E-Mail oder Passwort falsch.')).toBeInTheDocument();
});

test('shows the navigation when signed in', async () => {
  renderApp('#/');
  for (const name of ['Übersicht', 'Scannen', 'Einfrieren', 'Einstellungen']) {
    expect(await screen.findByRole('link', { name })).toBeInTheDocument();
  }
});

test('shows the overview instead of a blank page for unknown routes', async () => {
  renderApp('#/gibt-es-nicht');
  expect(await screen.findByRole('heading', { name: 'Übersicht' })).toBeInTheDocument();
});

test('shows a message passed from an auth redirect on the login page', async () => {
  window.location.hash = '#/login';
  render(<App repo={loggedOut()} printer={fakePrinter()} authMessage="Der Link ist abgelaufen." />);
  expect(await screen.findByText('Der Link ist abgelaufen.')).toBeInTheDocument();
});

test('sets a new password after a recovery link', async () => {
  const repo = seededRepository();
  const updatePassword = vi.spyOn(repo, 'updatePassword');
  renderApp('#/passwort', repo);
  await userEvent.type(await screen.findByLabelText('Neues Passwort'), 'geheim123');
  await userEvent.type(screen.getByLabelText('Passwort wiederholen'), 'geheim123');
  await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
  expect(await screen.findByText('Passwort gespeichert.')).toBeInTheDocument();
  expect(updatePassword).toHaveBeenCalledWith('geheim123');
});

test('rejects mismatching or short new passwords', async () => {
  const repo = seededRepository();
  const updatePassword = vi.spyOn(repo, 'updatePassword');
  renderApp('#/passwort', repo);
  await userEvent.type(await screen.findByLabelText('Neues Passwort'), 'geheim123');
  await userEvent.type(screen.getByLabelText('Passwort wiederholen'), 'anders123');
  await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
  expect(await screen.findByText('Die Passwörter stimmen nicht überein.')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Neues Passwort'));
  await userEvent.clear(screen.getByLabelText('Passwort wiederholen'));
  await userEvent.type(screen.getByLabelText('Neues Passwort'), 'kurz');
  await userEvent.type(screen.getByLabelText('Passwort wiederholen'), 'kurz');
  await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
  expect(await screen.findByText('Das Passwort muss mindestens 8 Zeichen haben.')).toBeInTheDocument();
  expect(updatePassword).not.toHaveBeenCalled();
});

test('sends a password reset link from the login page', async () => {
  const repo = loggedOut();
  const sendPasswordReset = vi.spyOn(repo, 'sendPasswordReset');
  renderApp('#/login', repo);
  await userEvent.type(await screen.findByLabelText('E-Mail'), 'ich@example.de');
  await userEvent.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
  expect(
    await screen.findByText('Falls die Adresse bekannt ist, wurde ein Link zum Zurücksetzen gesendet.'),
  ).toBeInTheDocument();
  expect(sendPasswordReset).toHaveBeenCalledWith('ich@example.de');
});
