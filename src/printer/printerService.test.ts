import { canPrint, createPrinterService, type PrinterState } from './printerService';
import { createFakeHid } from '../test/fakeHid';
import { makeItem } from '../test/fixtures';

const ready: PrinterState = { status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } };

async function readyPrinter(options?: Parameters<typeof createFakeHid>[0]) {
  const fake = createFakeHid(options);
  const printer = createPrinterService({ hid: fake.hid });
  await printer.init();
  return { fake, printer };
}

function containsInOrder(all: number[], expected: number[]) {
  let i = 0;
  for (const c of all) if (c === expected[i]) i++;
  return i === expected.length;
}

afterEach(() => {
  vi.useRealTimers();
});

test('is unsupported without WebHID and Web Bluetooth', () => {
  expect(createPrinterService({}).getState()).toEqual({ status: 'unsupported' });
});

describe('canPrint', () => {
  test.each<[PrinterState, boolean]>([
    [{ status: 'ready', model: 'T50M Pro', media: null }, true],
    [{ status: 'disconnected', connectOnPrint: true }, true],
    [{ status: 'disconnected', connectOnPrint: false }, false],
    [{ status: 'printing', model: 'T50M Pro', media: null }, false],
    [{ status: 'error', message: 'x' }, false],
    [{ status: 'unsupported' }, false],
  ])('%j → %s', (state, expected) => {
    expect(canPrint(state)).toBe(expected);
  });
});

test('USB: ensureConnected reports whether a printer is ready', async () => {
  const { printer } = await readyPrinter();
  await expect(printer.ensureConnected()).resolves.toBe(true);
  const { printer: none } = await readyPrinter({ granted: false });
  await expect(none.ensureConnected()).resolves.toBe(false);
});

test('connects to a previously granted printer on start and closes it again', async () => {
  const { fake, printer } = await readyPrinter();
  expect(printer.getState()).toEqual(ready);
  expect(fake.device.opened).toBe(false);
});

test('stays disconnected when the permission was withdrawn', async () => {
  const { printer } = await readyPrinter({ granted: false });
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: false });
});

test('rejects Supvan printers of other families', async () => {
  const { printer } = await readyPrinter({ productId: 0x203e });
  expect(printer.getState()).toEqual({
    status: 'error',
    message: 'Dieses Druckermodell wird nicht unterstützt (USB-ID 0x203e).',
  });
});

test('is ready without a label size when the printer is busy elsewhere', async () => {
  const { printer } = await readyPrinter({ openFails: true });
  expect(printer.getState()).toEqual({ status: 'ready', model: 'T50M Pro', media: null });
});

test('prints a label with the expected command sequence', async () => {
  const { fake, printer } = await readyPrinter();
  const states: string[] = [];
  printer.subscribe((s) => states.push(s.status));
  await printer.print(makeItem());
  expect(containsInOrder(fake.commands(), [0x30, 0x12, 0x11, 0x13, 0x5c, 0x10])).toBe(true);
  expect(states).toContain('printing');
  expect(printer.getState()).toEqual(ready);
  expect(fake.device.opened).toBe(false);
});

test('reports an open cover and stays ready', async () => {
  const { fake, printer } = await readyPrinter({ status: [0, 0, 0x08, 0, 0, 0, 0, 0] });
  await expect(printer.print(makeItem())).rejects.toThrow('Der Deckel des Druckers ist offen.');
  expect(printer.getState()).toEqual(ready);
  expect(fake.commands()).not.toContain(0x13);
});

test('reports a printer that does not answer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fake = createFakeHid({ silent: true });
  const printer = createPrinterService({ hid: fake.hid });
  const init = printer.init();
  await vi.advanceTimersByTimeAsync(6000);
  await init;
  const print = printer.print(makeItem());
  const assertion = expect(print).rejects.toThrow('Drucker antwortet nicht. Ist er eingeschaltet und per USB verbunden?');
  await vi.advanceTimersByTimeAsync(6000);
  await assertion;
});

test('refuses to print without a recognized label roll', async () => {
  const { printer } = await readyPrinter({ media: { lengthMm: 0, widthMm: 0, paperType: 1, gap: 3 } });
  await expect(printer.print(makeItem())).rejects.toThrow('Etikettenrolle nicht erkannt.');
});

test('prints only once when asked twice at the same time', async () => {
  const { fake, printer } = await readyPrinter();
  const first = printer.print(makeItem());
  await expect(printer.print(makeItem())).rejects.toThrow('Es wird bereits gedruckt.');
  await first;
  expect(fake.commands().filter((c) => c === 0x13)).toHaveLength(1);
});

test('follows the printer being unplugged and plugged in again', async () => {
  const { fake, printer } = await readyPrinter();
  fake.unplug();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: false });
  fake.plug();
  await vi.waitFor(() => expect(printer.getState()).toEqual(ready));
});

test('connects after the user picks the printer', async () => {
  const { fake, printer } = await readyPrinter({ granted: false });
  await printer.connect();
  expect(fake.hid.requestDevice).toHaveBeenCalledWith({ filters: [{ vendorId: 0x1820 }] });
  expect(printer.getState()).toEqual(ready);
});

test('forgets the printer on disconnect', async () => {
  const { fake, printer } = await readyPrinter();
  await printer.disconnect();
  expect(fake.device.forget).toHaveBeenCalled();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: false });
});

test('reports a printer unplugged during a print and stays disconnected', async () => {
  const { fake, printer } = await readyPrinter();
  const print = printer.print(makeItem());
  const assertion = expect(print).rejects.toThrow('Drucker wurde getrennt.');
  await vi.waitFor(() => expect(fake.commands()).toContain(0x13));
  fake.unplug();
  await assertion;
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: false });
});
