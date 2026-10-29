import { SHORT_CODE_ALPHABET, generateShortCode, normalizeShortCode } from './shortCode';

test('generates 4 characters from the alphabet', () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateShortCode();
    expect(code).toHaveLength(4);
    for (const ch of code) expect(SHORT_CODE_ALPHABET).toContain(ch);
  }
});

test('uses the injected random source', () => {
  expect(generateShortCode(() => 0)).toBe('AAAA');
});

test('normalizes manual input', () => {
  expect(normalizeShortCode(' k7f3 ')).toBe('K7F3');
});
