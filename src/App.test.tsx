import { screen } from '@testing-library/react';
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
  expect(await screen.findByText('Anmeldung fehlgeschlagen')).toBeInTheDocument();
});

test('shows the navigation when signed in', async () => {
  renderApp('#/');
  for (const name of ['Übersicht', 'Scannen', 'Einfrieren', 'Einstellungen']) {
    expect(await screen.findByRole('link', { name })).toBeInTheDocument();
  }
});
