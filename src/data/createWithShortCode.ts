import { generateShortCode } from '../domain/shortCode';
import { DuplicateShortCodeError } from './repository';

const MAX_ATTEMPTS = 5;

export async function createWithShortCode<T>(
  insert: (code: string) => Promise<T>,
  generate: () => string = generateShortCode,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await insert(generate());
    } catch (e) {
      if (!(e instanceof DuplicateShortCodeError) || attempt >= MAX_ATTEMPTS) throw e;
    }
  }
}
