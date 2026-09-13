import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as tsNamespace from 'typescript';

const ts = tsNamespace.default ?? tsNamespace;

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function loadPresenceModule() {
  const source = read('src/modules/qr/presenceRearm.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', 'require', output);
  execute(module.exports, module, () => {
    throw new Error('presenceRearm.ts must not require runtime dependencies');
  });
  return module.exports;
}

const { createPresenceRearmGate } = loadPresenceModule();
const code = (value, observedAt, engine = 'barcode-detector') => ({
  kind: 'codes',
  engine,
  observedAt,
  results: [{ value, engine }],
});
const codes = (values, observedAt, engine = 'barcode-detector') => ({
  kind: 'codes',
  engine,
  observedAt,
  results: values.map((value) => ({ value, engine })),
});
const empty = (observedAt, engine = 'barcode-detector') => ({ kind: 'empty', engine, observedAt });
const uncertain = (observedAt, engine = 'barcode-detector') => ({ kind: 'uncertain', engine, observedAt });

function collect(gate, observations, threshold) {
  return observations
    .map((observation) => gate.observe(observation, threshold))
    .filter((outcome) => outcome.accepted)
    .map((outcome) => outcome.accepted.value);
}

test('A is accepted once and holding it for 10 seconds never repeats', () => {
  const gate = createPresenceRearmGate();
  const observations = [];
  for (let at = 0; at <= 10_000; at += 240) observations.push(code('A', at));
  assert.deepEqual(collect(gate, observations, 480), ['A']);
});

test('short absence below threshold does not rearm', () => {
  const gate = createPresenceRearmGate();
  const accepted = collect(gate, [code('A', 0), empty(240), empty(600), code('A', 601)], 480);
  assert.deepEqual(accepted, ['A']);
  assert.equal(gate.getState(), 'LOCKED');
});

test('qualifying absence rearms and allows the same code again', () => {
  const gate = createPresenceRearmGate();
  const accepted = collect(gate, [code('A', 0), empty(240), empty(720), code('A', 721)], 480);
  assert.deepEqual(accepted, ['A', 'A']);
});

test('ZXing-style 900ms absence requires a longer clear gap before rearm', () => {
  const gate = createPresenceRearmGate();
  assert.equal(gate.observe(code('A', 0, 'zxing'), 900).accepted.value, 'A');
  gate.observe(empty(240, 'zxing'), 900);
  assert.equal(gate.observe(empty(960, 'zxing'), 900).rearmed, false);
  assert.equal(gate.observe(empty(1_200, 'zxing'), 900).rearmed, true);
  assert.equal(gate.observe(code('A', 1_201, 'zxing'), 900).accepted.value, 'A');
});

test('A clear A repeated ten times produces exactly ten accepted scans', () => {
  const gate = createPresenceRearmGate();
  const accepted = [];
  let at = 0;
  for (let index = 0; index < 10; index += 1) {
    const result = gate.observe(code('A', at), 480);
    if (result.accepted) accepted.push(result.accepted.value);
    if (index < 9) {
      gate.observe(empty(at + 240), 480);
      gate.observe(empty(at + 720), 480);
    }
    at += 721;
  }
  assert.equal(accepted.length, 10);
  assert.deepEqual(new Set(accepted), new Set(['A']));
});

test('A clear B produces A1 B1', () => {
  const gate = createPresenceRearmGate();
  const accepted = collect(gate, [code('A', 0), empty(240), empty(720), code('B', 721)], 480);
  assert.deepEqual(accepted, ['A', 'B']);
});

test('READY with multiple distinct codes accepts none and does not depend on array order', () => {
  const gate = createPresenceRearmGate();
  const first = gate.observe(codes(['A', 'B'], 0), 480);
  const second = gate.observe(codes(['B', 'A'], 240), 480);
  assert.equal(first.accepted, undefined);
  assert.equal(first.multiCode, true);
  assert.equal(second.accepted, undefined);
  assert.equal(second.multiCode, true);
  assert.equal(gate.getState(), 'READY');
});

test('trimmed raw-code equality is case-sensitive', () => {
  const gate = createPresenceRearmGate();
  const first = gate.observe(codes([' ABC ', 'ABC'], 0), 480);
  assert.equal(first.accepted.value, 'ABC');
  gate.reset();
  const second = gate.observe(codes(['ABC', 'abc'], 0), 480);
  assert.equal(second.accepted, undefined);
  assert.equal(second.multiCode, true);
});

test('uncertain observations reset absence progress', () => {
  const gate = createPresenceRearmGate();
  assert.equal(gate.observe(code('A', 0), 480).accepted.value, 'A');
  gate.observe(empty(240), 480);
  gate.observe(uncertain(600), 480);
  gate.observe(empty(720), 480);
  const notRearmed = gate.observe(empty(1_199), 480);
  assert.equal(notRearmed.rearmed, false);
  assert.equal(gate.observe(code('A', 1_200), 480).accepted, undefined);
});

test('reset models manual stop/start and camera switch as a fresh session', () => {
  const gate = createPresenceRearmGate();
  assert.equal(gate.observe(code('A', 0), 480).accepted.value, 'A');
  gate.reset();
  assert.equal(gate.observe(code('A', 1), 480).accepted.value, 'A');
  gate.reset();
  assert.equal(gate.observe(code('A', 2), 480).accepted.value, 'A');
});

test('visibility pause preserves the lock but discards transient absence progress', () => {
  const gate = createPresenceRearmGate();
  assert.equal(gate.observe(code('A', 0), 480).accepted.value, 'A');
  gate.observe(empty(240), 480);
  gate.pause();
  assert.equal(gate.getState(), 'LOCKED');
  assert.equal(gate.observe(code('A', 10_000), 480).accepted, undefined);
  gate.observe(empty(10_240), 480);
  assert.equal(gate.observe(empty(10_720), 480).rearmed, true);
  assert.equal(gate.observe(code('A', 10_721), 480).accepted.value, 'A');
});

test('BarcodeScanner keeps time-window as the default and leave-to-rearm as opt-in', () => {
  const source = read('src/modules/qr/BarcodeScanner.tsx');
  assert.match(source, /duplicateWindowMs\s*=\s*1400/);
  assert.match(source, /scanPolicy\s*=\s*'time-window'/);
  assert.match(source, /scanPolicy\?:\s*ScanPolicy/);
  assert.match(source, /absenceThresholdMs\?:\s*number/);
  assert.match(source, /NATIVE_ABSENCE_THRESHOLD_MS\s*=\s*480/);
  assert.match(source, /ZXING_ABSENCE_THRESHOLD_MS\s*=\s*900/);
  assert.match(source, /ZXING_PRESENCE_ATTEMPT_DELAY_MS\s*=\s*240/);
  assert.match(source, /stop\(true, true\)/);
  assert.match(source, /start\(selectedCameraIdRef\.current, true\)/);
});

test('scannerService emits native frame observations and classifies ZXing NotFound only as empty', () => {
  const source = read('src/modules/qr/scannerService.ts');
  assert.match(source, /NATIVE_SCAN_INTERVAL_MS\s*=\s*240/);
  assert.match(source, /kind:\s*'codes'.*engine:\s*'barcode-detector'/s);
  assert.match(source, /kind:\s*'empty'.*engine:\s*'barcode-detector'/s);
  assert.match(source, /kind:\s*'uncertain'.*engine:\s*'barcode-detector'/s);
  assert.match(source, /zxingErrorKind\(error\)\s*===\s*'NotFoundException'/);
  assert.match(source, /kind:\s*'empty',\s*engine:\s*'zxing'/);
  assert.match(source, /kind:\s*'uncertain',\s*engine:\s*'zxing'/);
  assert.match(source, /delayBetweenScanAttempts/);
  assert.match(source, /delayBetweenScanSuccess/);
});

test('legacy duplicate suppressor remains time-window based and trim-only', () => {
  const source = read('src/modules/qr/productLookup.ts');
  const start = source.indexOf('export function createDuplicateSuppressor');
  const body = source.slice(start);
  assert.match(body, /windowMs\s*=\s*1400/);
  assert.match(body, /code\.trim\(\)/);
  assert.match(body, /now\s*-\s*lastAcceptedAt\s*<\s*windowMs/);
  assert.doesNotMatch(body, /toLocaleLowerCase/);
});
