import type { Repository } from '../data/repository';

export type AuthRedirect = { type: string | null; error: string | null };

/**
 * Supabase email links (magic link, password reset, invite) return to the app with
 * `#access_token=…` or `#error=…`. With hash routing that would be read as an unknown route.
 */
export function parseAuthRedirect(hash: string): AuthRedirect | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('access_token')) return { type: params.get('type'), error: null };
  if (params.has('error')) return { type: null, error: params.get('error_code') ?? params.get('error') };
  return null;
}

function redirectErrorMessage(code: string): string {
  return code === 'otp_expired'
    ? 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen Link anfordern.'
    : 'Die Anmeldung über den Link ist fehlgeschlagen. Bitte einen neuen Link anfordern.';
}

/**
 * Lets the repository consume the tokens in the URL, then moves to a real app route.
 * Pass `redirect` parsed before the Supabase client was created, since it clears the hash.
 * Returns a message for the login page if the link failed.
 */
export async function handleAuthRedirect(
  repo: Repository,
  redirect: AuthRedirect | null = parseAuthRedirect(window.location.hash),
): Promise<string | undefined> {
  if (!redirect) return undefined;
  await repo.getSession().catch(() => null);
  const target = redirect.error ? '#/login' : redirect.type === 'recovery' ? '#/passwort' : '#/';
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${target}`);
  return redirect.error ? redirectErrorMessage(redirect.error) : undefined;
}

export function loginErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message === 'Invalid login credentials') return 'E-Mail oder Passwort falsch.';
  if (message === 'Email not confirmed') return 'Die E-Mail-Adresse ist noch nicht bestätigt.';
  return `Anmeldung fehlgeschlagen: ${message}`;
}
