import { createDemoRepository } from './demoRepository';

test('demo data is signed in and resolves every item', async () => {
  const repo = createDemoRepository();
  expect(await repo.getSession()).not.toBeNull();
  const items = await repo.listItems();
  expect(items).toHaveLength(4);
  for (const item of items) expect(item.freezer).toBeDefined();
  expect((await repo.findItemByShortCode('k7f3'))?.name).toBe('Hackfleisch');
});
