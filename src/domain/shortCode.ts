/** Alphabet without easily confused characters (0/O, 1/I/L). */
export const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateShortCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += SHORT_CODE_ALPHABET[Math.floor(random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeShortCode(input: string): string {
  return input.trim().toUpperCase();
}
