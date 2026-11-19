import { handleAuthRedirect, loginErrorMessage, parseAuthRedirect } from './authRedirect';
import { createMemoryRepository } from '../data/memoryRepository';

describe('parseAuthRedirect', () => {
  test('ignores normal app routes', () => {
    expect(parseAuthRedirect('#/scan')).toBeNull();
    expect(parseAuthRedirect('')).toBeNull();
  });

  test('detects a recovery link', () => {
    expect(parseAuthRedirect('#access_token=abc&refresh_token=x&type=recovery')).toEqual({
      type: 'recovery',
      error: null,
    });
  });

  test('detects a magic link', () => {
    expect(parseAuthRedirect('#access_token=abc&type=magiclink')).toEqual({ type: 'magiclink', error: null });
  });

  test('detects an expired link', () => {
    expect(
      parseAuthRedirect(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ type: null, error: 'otp_expired' });
  });
});

describe('handleAuthRedirect', () => {
  const repo = createMemoryRepository();

  test('leaves normal routes alone', async () => {
    window.location.hash = '#/scan';
    expect(await handleAuthRedirect(repo)).toBeUndefined();
    expect(window.location.hash).toBe('#/scan');
  });

  test('sends recovery links to the new-password page', async () => {
    window.location.hash = '#access_token=abc&type=recovery';
    expect(await handleAuthRedirect(repo)).toBeUndefined();
    expect(window.location.hash).toBe('#/passwort');
  });

  test('sends magic links to the overview', async () => {
    window.location.hash = '#access_token=abc&type=magiclink';
    await handleAuthRedirect(repo);
    expect(window.location.hash).toBe('#/');
  });

  test('sends failed links to the login page with an explanation', async () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=x';
    expect(await handleAuthRedirect(repo)).toBe(
      'Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen Link anfordern.',
    );
    expect(window.location.hash).toBe('#/login');
  });
});

describe('loginErrorMessage', () => {
  test.each([
    ['Invalid login credentials', 'E-Mail oder Passwort falsch.'],
    ['Email not confirmed', 'Die E-Mail-Adresse ist noch nicht bestätigt.'],
    ['Something else', 'Anmeldung fehlgeschlagen: Something else'],
  ])('%s', (message, text) => {
    expect(loginErrorMessage(new Error(message))).toBe(text);
  });
});
