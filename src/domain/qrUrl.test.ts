import { buildTakeUrl, parseTakeUrl } from './qrUrl';

const uuid = '0b9f8c1e-5d1a-4c7e-9a7b-2f1e3d4c5b6a';

test('builds the take URL from the app base URL', () => {
  expect(buildTakeUrl('https://x.github.io/FreezerManager/', 'abc')).toBe(
    'https://x.github.io/FreezerManager/#/take/abc',
  );
});

test('parses the item id from a take URL', () => {
  expect(parseTakeUrl(`https://x.github.io/FreezerManager/#/take/${uuid}`)).toBe(uuid);
});

test.each(['https://example.com', 'hallo', 'https://x.github.io/FreezerManager/#/take/keine-uuid'])(
  'ignores foreign content %s',
  (text) => {
    expect(parseTakeUrl(text)).toBeNull();
  },
);
