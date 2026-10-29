import { createWithShortCode } from './createWithShortCode';
import { DuplicateShortCodeError } from './repository';

function sequence(codes: string[]) {
  let i = 0;
  return () => codes[i++ % codes.length];
}

test('retries with a new code after a duplicate', async () => {
  const tried: string[] = [];
  const result = await createWithShortCode(async (code) => {
    tried.push(code);
    if (code === 'AAAA') throw new DuplicateShortCodeError();
    return code;
  }, sequence(['AAAA', 'AAAA', 'BBBB']));
  expect(result).toBe('BBBB');
  expect(tried).toEqual(['AAAA', 'AAAA', 'BBBB']);
});

test('gives up after 5 attempts', async () => {
  let calls = 0;
  await expect(
    createWithShortCode(async () => {
      calls++;
      throw new DuplicateShortCodeError();
    }, sequence(['AAAA'])),
  ).rejects.toBeInstanceOf(DuplicateShortCodeError);
  expect(calls).toBe(5);
});

test('does not retry other errors', async () => {
  let calls = 0;
  await expect(
    createWithShortCode(async () => {
      calls++;
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
  expect(calls).toBe(1);
});
