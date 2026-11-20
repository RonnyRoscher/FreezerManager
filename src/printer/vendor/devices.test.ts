import { findT5080Model, SUPVAN_VENDOR_ID } from './devices';

test('knows the T50M Pro reported by the household printer', () => {
  expect(SUPVAN_VENDOR_ID).toBe(0x1820);
  expect(findT5080Model(0x207f)?.name).toBe('T50M Pro');
  expect(findT5080Model(0x207f)?.headDots).toBe(384);
});

test('knows the wider T80 heads', () => {
  expect(findT5080Model(0x207a)?.headDots).toBe(576);
});

test('rejects Supvan models of other families', () => {
  expect(findT5080Model(0x203e)).toBeUndefined();
});
