import { bluetoothModelName, findT5080Model, SUPVAN_VENDOR_ID } from './devices';

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

describe('bluetoothModelName', () => {
  test.each([
    ['T0205C260729L704', 'T50M Pro'],
    ['T0148B2507018663', 'T50M Pro'],
    ['T0200A1', 'T50 Pro'],
  ])('%s → %s', (name, model) => {
    expect(bluetoothModelName(name)).toBe(model);
  });

  test('rejects unknown names', () => {
    expect(bluetoothModelName('T0999X123')).toBeUndefined();
    expect(bluetoothModelName(undefined)).toBeUndefined();
  });
});
