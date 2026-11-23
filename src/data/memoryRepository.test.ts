import { createMemoryRepository } from './memoryRepository';
import { InUseError } from './repository';
import { SHORT_CODE_ALPHABET } from '../domain/shortCode';
import { cellar, drawer2, kitchen, meat, top, veg } from '../test/fixtures';
import type { ItemInput } from '../domain/types';

const input: ItemInput = {
  name: 'Hackfleisch',
  details: null,
  quantity: '500 g',
  category_id: meat.id,
  compartment_id: drawer2.id,
  frozen_at: '2026-10-18',
};

function setup() {
  return createMemoryRepository({
    freezers: [cellar, kitchen],
    compartments: [drawer2, top],
    categories: [meat, veg],
    session: { email: 'a@b.de' },
  });
}

test('createItem resolves category, compartment and freezer', async () => {
  const repo = setup();
  const item = await repo.createItem(input);
  const [view] = await repo.listItems();
  expect(view.id).toBe(item.id);
  expect(view.category).toEqual(meat);
  expect(view.compartment).toEqual(drawer2);
  expect(view.freezer).toEqual(cellar);
  expect([...view.short_code].every((c) => SHORT_CODE_ALPHABET.includes(c))).toBe(true);
});

test('removeItem returns the removed item once', async () => {
  const repo = setup();
  const item = await repo.createItem(input);
  expect(await repo.removeItem(item.id)).toEqual(item);
  expect(await repo.removeItem(item.id)).toBeNull();
});

test('restoreItem brings back the same id and short code', async () => {
  const repo = setup();
  const item = await repo.createItem(input);
  const removed = (await repo.removeItem(item.id))!;
  await repo.restoreItem(removed);
  const restored = await repo.getItem(item.id);
  expect(restored?.short_code).toBe(item.short_code);
});

test('findItemByShortCode normalizes input', async () => {
  const repo = setup();
  const item = await repo.createItem(input);
  const code = item.short_code.toLowerCase();
  expect((await repo.findItemByShortCode(` ${code} `))?.id).toBe(item.id);
});

test('deleteCompartment with items throws InUseError with count', async () => {
  const repo = setup();
  await repo.createItem(input);
  await repo.createItem(input);
  await expect(repo.deleteCompartment(drawer2.id)).rejects.toEqual(new InUseError(2));
  await expect(repo.deleteCompartment(drawer2.id)).rejects.toMatchObject({ count: 2 });
});

test('deleteFreezer counts items in all of its compartments', async () => {
  const repo = setup();
  await repo.createItem(input);
  await expect(repo.deleteFreezer(cellar.id)).rejects.toMatchObject({ count: 1 });
});

test('deleteFreezer without items also deletes its compartments', async () => {
  const repo = setup();
  await repo.deleteFreezer(kitchen.id);
  const freezers = await repo.listFreezers();
  expect(freezers.map((f) => f.id)).toEqual([cellar.id]);
  await expect(repo.deleteCompartment(top.id)).resolves.toBeUndefined();
});

test('deleteCategory with items throws InUseError', async () => {
  const repo = setup();
  await repo.createItem(input);
  await expect(repo.deleteCategory(meat.id)).rejects.toMatchObject({ count: 1 });
  await repo.deleteCategory(veg.id);
  expect((await repo.listCategories()).map((c) => c.id)).toEqual([meat.id]);
});

test('listFreezers nests compartments sorted by sort_order', async () => {
  const repo = setup();
  await repo.saveCompartment({ freezer_id: cellar.id, name: 'Schublade 1', sort_order: 0 });
  const [first] = await repo.listFreezers();
  expect(first.compartments.map((c) => c.name)).toEqual(['Schublade 1', 'Schublade 2']);
});

test('listItemNames returns unique sorted names', async () => {
  const repo = setup();
  await repo.createItem({ ...input, name: 'Erbsen' });
  await repo.createItem(input);
  await repo.createItem(input);
  expect(await repo.listItemNames()).toEqual(['Erbsen', 'Hackfleisch']);
});

test('subscribeItems notifies on every item change until unsubscribed', async () => {
  const repo = setup();
  const onChange = vi.fn();
  const unsubscribe = repo.subscribeItems(onChange);
  const item = await repo.createItem(input);
  await repo.updateItem(item.id, { ...input, name: 'Gulasch' });
  const removed = (await repo.removeItem(item.id))!;
  await repo.restoreItem(removed);
  expect(onChange).toHaveBeenCalledTimes(4);
  unsubscribe();
  await repo.createItem(input);
  expect(onChange).toHaveBeenCalledTimes(4);
});

test('signIn rejects the password "falsch"', async () => {
  const repo = createMemoryRepository();
  await expect(repo.signIn('a@b.de', 'falsch')).rejects.toThrow();
  await repo.signIn('a@b.de', 'geheim');
  expect(await repo.getSession()).toEqual({ email: 'a@b.de' });
});

describe('households', () => {
  test('default profile is an admin in their own household', async () => {
    const profile = await setup().getProfile();
    expect(profile).toMatchObject({ email: 'ich@example.de', isAdmin: true });
    expect(profile?.household?.name).toBe('Unser Haushalt');
    expect(profile?.activeHousehold).toEqual(profile?.household);
  });

  test('createHousehold lists the household with no members', async () => {
    const repo = setup();
    const mueller = await repo.createHousehold('Müller');
    expect((await repo.listHouseholds()).find((h) => h.id === mueller.id)).toEqual({ ...mueller, memberCount: 0 });
    expect((await repo.listHouseholds()).find((h) => h.name === 'Unser Haushalt')?.memberCount).toBe(1);
  });

  test('empty names are rejected', async () => {
    await expect(setup().createHousehold('  ')).rejects.toThrow('Name darf nicht leer sein');
  });

  test('setActiveHousehold switches the visible data, null returns to the own one', async () => {
    const repo = setup();
    const mueller = await repo.createHousehold('Müller');
    await repo.setActiveHousehold(mueller.id);
    expect(await repo.listFreezers()).toEqual([]);
    const categories = await repo.listCategories();
    expect(categories).toHaveLength(9);
    expect(categories.find((c) => c.name === 'Gemüse')?.max_months).toBe(12);
    expect((await repo.getProfile())?.activeHousehold?.name).toBe('Müller');
    await repo.setActiveHousehold(null);
    expect((await repo.listFreezers()).map((f) => f.id)).toEqual([cellar.id, kitchen.id]);
    expect((await repo.getProfile())?.activeHousehold?.name).toBe('Unser Haushalt');
  });

  test('deleteHousehold refuses members, freezers and items, in that order', async () => {
    const repo = setup();
    const own = (await repo.getProfile())!.household!;
    await expect(repo.deleteHousehold(own.id)).rejects.toThrow('Haushalt kann nicht gelöscht werden: noch Mitglieder');
    const h = await repo.createHousehold('Müller');
    await repo.setActiveHousehold(h.id);
    const f = await repo.saveFreezer({ name: 'Truhe', sort_order: 0 });
    await expect(repo.deleteHousehold(h.id)).rejects.toThrow('Haushalt kann nicht gelöscht werden: noch Gefriergeräte');
    await repo.deleteFreezer(f.id);
    await repo.deleteHousehold(h.id);
    expect((await repo.listHouseholds()).some((x) => x.id === h.id)).toBe(false);
    expect((await repo.getProfile())?.activeHousehold?.name).toBe('Unser Haushalt');
  });

  test('deleteHousehold refuses households that still hold items', async () => {
    const repo = setup();
    const h = await repo.createHousehold('Müller');
    await repo.setActiveHousehold(h.id);
    const cat = (await repo.listCategories())[0];
    const comp = await repo.saveCompartment({ freezer_id: 'x', name: 'Fach', sort_order: 0 });
    await repo.createItem({ ...input, category_id: cat.id, compartment_id: comp.id });
    // freezer-less compartment keeps this test focused on the items check
    await expect(repo.deleteHousehold(h.id)).rejects.toThrow('Haushalt kann nicht gelöscht werden: noch Lebensmittel');
  });

  test('setMemberHousehold changes listProfiles and memberCount', async () => {
    const repo = setup();
    const h = await repo.createHousehold('Müller');
    const me = (await repo.listProfiles())[0];
    await repo.setMemberHousehold(me.userId, h.id);
    expect((await repo.listProfiles())[0].householdId).toBe(h.id);
    expect((await repo.listHouseholds()).find((x) => x.id === h.id)?.memberCount).toBe(1);
  });

  test('setMemberHousehold on self keeps an open foreign household active', async () => {
    const repo = setup();
    const x = await repo.createHousehold('X');
    const y = await repo.createHousehold('Y');
    const me = (await repo.listProfiles())[0];
    await repo.setActiveHousehold(x.id);
    await repo.setMemberHousehold(me.userId, y.id);
    const profile = await repo.getProfile();
    expect(profile?.household).toEqual(y);
    expect(profile?.activeHousehold).toEqual(x);
    expect(await repo.listFreezers()).toEqual([]);
    await repo.setActiveHousehold(null);
    expect((await repo.getProfile())?.activeHousehold).toEqual(y);
  });

  test('setMemberHousehold on self moves the active household along when none is open', async () => {
    const repo = setup();
    const y = await repo.createHousehold('Y');
    const me = (await repo.listProfiles())[0];
    await repo.setMemberHousehold(me.userId, y.id);
    expect((await repo.getProfile())?.activeHousehold).toEqual(y);
    expect(await repo.listFreezers()).toEqual([]);
  });

  test('non-admins cannot call admin methods', async () => {
    const repo = createMemoryRepository({
      profile: { userId: 'u', email: 'x@y.de', isAdmin: false, household: { id: 'h', name: 'H' }, activeHousehold: null },
    });
    await expect(repo.listHouseholds()).rejects.toThrow('Nur für Admins');
    await expect(repo.setActiveHousehold(null)).rejects.toThrow('Nur für Admins');
  });
});
