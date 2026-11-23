import { createDemoRepository } from './demoRepository';

test('demo data is signed in and resolves every item', async () => {
  const repo = createDemoRepository();
  expect(await repo.getSession()).not.toBeNull();
  const items = await repo.listItems();
  expect(items).toHaveLength(4);
  for (const item of items) expect(item.freezer).toBeDefined();
  expect((await repo.findItemByShortCode('k7f3'))?.name).toBe('Hackfleisch');
});

test('demo user is admin of "Unser Haushalt" and a second account awaits assignment', async () => {
  const repo = createDemoRepository();
  const profile = await repo.getProfile();
  expect(profile?.isAdmin).toBe(true);
  expect(profile?.household?.name).toBe('Unser Haushalt');
  const profiles = await repo.listProfiles();
  expect(profiles.some((p) => p.householdId === null && p.userId !== profile?.userId)).toBe(true);
});
