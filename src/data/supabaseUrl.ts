/**
 * supabase-js expects the bare project URL. A URL copied from the API settings often
 * ends in /rest/v1/, which turns the login endpoint into an invalid path.
 */
export function normalizeSupabaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth)\/v1$/, '');
}
