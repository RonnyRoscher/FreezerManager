const TAKE_PATTERN =
  /#\/take\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export function buildTakeUrl(baseUrl: string, id: string): string {
  return `${baseUrl}#/take/${id}`;
}

/** Returns the item id encoded in a take URL, or null for any other content. */
export function parseTakeUrl(text: string): string | null {
  return TAKE_PATTERN.exec(text.trim())?.[1] ?? null;
}
