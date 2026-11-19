import { normalizeSupabaseUrl } from './supabaseUrl';

test.each([
  ['https://abc.supabase.co', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/rest/v1', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/auth/v1/', 'https://abc.supabase.co'],
  ['  https://abc.supabase.co/rest/v1/ \n', 'https://abc.supabase.co'],
])('%j → %s', (input, expected) => {
  expect(normalizeSupabaseUrl(input)).toBe(expected);
});
