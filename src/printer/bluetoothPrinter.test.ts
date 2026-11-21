import { createPrinterService } from './printerService';
import { installFakeBluetooth, type FakeBluetoothOptions } from '../test/fakeBluetooth';
import { makeItem } from '../test/fixtures';

const ready = { status: 'ready', model: 'T50M Pro', media: { lengthMm: 40, widthMm: 30 } };
let fake: ReturnType<typeof installFakeBluetooth>;

function setup(options?: FakeBluetoothOptions) {
  fake = installFakeBluetooth(options);
  return createPrinterService({ bluetooth: navigator.bluetooth });
}

function containsInOrder(all: number[], expected: number[]) {
  let i = 0;
  for (const c of all) if (c === expected[i]) i++;
  return i === expected.length;
}

afterEach(() => {
  fake.uninstall();
  vi.useRealTimers();
});

test('uses Bluetooth when there is no WebHID and asks for the printer on print', () => {
  expect(setup().getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: false });
});

test('connects to the chosen printer', async () => {
  const printer = setup();
  await printer.connect();
  expect(printer.getState()).toEqual(ready);
});

test('asks for the printer on the first print and prints', async () => {
  const printer = setup();
  await printer.print(makeItem());
  expect(fake.requestDevice).toHaveBeenCalledTimes(1);
  expect(containsInOrder(fake.commands(), [0x11, 0x30, 0x12, 0x13, 0x5c, 0x10])).toBe(true);
  expect(printer.getState()).toEqual(ready);
});

test('keeps the connection for the next print', async () => {
  const printer = setup();
  await printer.print(makeItem());
  await printer.print(makeItem());
  expect(fake.requestDevice).toHaveBeenCalledTimes(1);
  expect(fake.connect).toHaveBeenCalledTimes(1);
});

test('reconnects without the chooser after the link dropped', async () => {
  const printer = setup();
  await printer.connect();
  fake.dropConnection();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: true });
  await printer.print(makeItem());
  expect(fake.requestDevice).toHaveBeenCalledTimes(1);
  expect(fake.connect).toHaveBeenCalledTimes(2);
  expect(printer.getState()).toEqual(ready);
});

test('does nothing when the chooser is cancelled', async () => {
  const printer = setup({ cancel: true });
  await expect(printer.print(makeItem())).resolves.toBeUndefined();
  expect(fake.commands()).toEqual([]);
  await expect(printer.ensureConnected()).resolves.toBe(false);
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: false });
});

test('says when Bluetooth is off', async () => {
  const printer = setup({ bluetoothOff: true });
  await expect(printer.print(makeItem())).rejects.toThrow('Bluetooth ist ausgeschaltet. Bitte am Handy einschalten.');
});

test('retries on the next tap when the printer was unreachable', async () => {
  const printer = setup();
  await printer.connect();
  fake.dropConnection();
  fake.options.connectFails = true;
  await expect(printer.print(makeItem())).rejects.toThrow(
    'Drucker per Bluetooth nicht erreichbar. Ist er eingeschaltet und in der Nähe?',
  );
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: true });
  fake.options.connectFails = false;
  await printer.print(makeItem());
  expect(fake.requestDevice).toHaveBeenCalledTimes(1);
  expect(printer.getState()).toEqual(ready);
});

test('rejects other printers and forgets them', async () => {
  const printer = setup({ name: 'T0999X123' });
  await expect(printer.connect()).rejects.toThrow('Dieses Druckermodell wird nicht unterstützt.');
  await expect(printer.print(makeItem())).rejects.toThrow('Dieses Druckermodell wird nicht unterstützt.');
  expect(fake.requestDevice).toHaveBeenCalledTimes(2);
  expect(fake.connect).not.toHaveBeenCalled();
});

test('reports an open cover and stays connected', async () => {
  const printer = setup({ status: [0, 0, 0x08, 0, 0, 0, 0, 0] });
  await printer.connect();
  await expect(printer.print(makeItem())).rejects.toThrow('Der Deckel des Druckers ist offen.');
  expect(printer.getState()).toEqual(ready);
});

test('says when the printer does not answer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const printer = setup({ silent: true });
  const connect = expect(printer.connect()).rejects.toThrow('Drucker antwortet nicht. Ist er eingeschaltet und in der Nähe?');
  await vi.advanceTimersByTimeAsync(20000);
  await connect;
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: true });
});

test('prints only once when asked twice at the same time', async () => {
  const printer = setup();
  await printer.connect();
  const first = printer.print(makeItem());
  await expect(printer.print(makeItem())).rejects.toThrow('Es wird bereits gedruckt.');
  await first;
  expect(fake.commands().filter((c) => c === 0x13)).toHaveLength(1);
});

test('reports a link lost during a print', async () => {
  const printer = setup();
  await printer.connect();
  const print = printer.print(makeItem());
  const assertion = expect(print).rejects.toThrow('Drucker wurde getrennt.');
  await vi.waitFor(() => expect(fake.commands()).toContain(0x13));
  fake.dropConnection();
  await assertion;
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: true });
});

test('forgets the printer on disconnect', async () => {
  const printer = setup();
  await printer.connect();
  await printer.disconnect();
  expect(fake.device.forget).toHaveBeenCalled();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: false });
  await printer.print(makeItem());
  expect(fake.requestDevice).toHaveBeenCalledTimes(2);
});

test('reconnects when the link is gone without a disconnect event', async () => {
  const printer = setup();
  await printer.connect();
  fake.device.gatt.connected = false; // e.g. page frozen in the background, event never delivered
  await printer.print(makeItem());
  expect(fake.connect).toHaveBeenCalledTimes(2);
  expect(fake.requestDevice).toHaveBeenCalledTimes(1);
  expect(printer.getState()).toEqual(ready);
});

test('lets the user pick another printer from the settings while the remembered one is unreachable', async () => {
  const printer = setup();
  await printer.connect();
  fake.dropConnection();
  await printer.connect();
  expect(fake.requestDevice).toHaveBeenCalledTimes(2);
  expect(printer.getState()).toEqual(ready);
});

test('a late disconnect event of an old link does not drop the current connection', async () => {
  const printer = setup();
  await printer.connect();
  await printer.connect(); // same printer picked again; Chrome may deliver the old link's event later
  fake.fireDisconnectEvent();
  expect(printer.getState()).toEqual(ready);
  await printer.print(makeItem());
  expect(fake.connect).toHaveBeenCalledTimes(2);
});

test('tells whether a printer is remembered', async () => {
  const printer = setup();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: false });
  await printer.connect();
  fake.dropConnection();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: true });
  await printer.disconnect();
  expect(printer.getState()).toEqual({ status: 'disconnected', connectOnPrint: true, printerKnown: false });
});
