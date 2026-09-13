import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const printSource = read('src/modules/printing/PrintWorkspace.tsx');
const qrSource = read('src/modules/qr/QrPrintingPage.tsx');

function loadSanitizer() {
  const start = printSource.indexOf('export function sanitizeInitialQuantities');
  const endMarker = '\n}\n\nfunction cloneConfig';
  const end = printSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'sanitizeInitialQuantities must exist');

  const source = printSource.slice(start, end + 3);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.sanitizeInitialQuantities;
}

const sanitizeInitialQuantities = loadSanitizer();
const products = [
  { id: 'productA' },
  { id: 'productB' },
  { id: 'productC' },
  { id: 'productD' },
  { id: 'productE' },
];
const plain = (value) => JSON.parse(JSON.stringify(value));

test('no route state keeps printing selection empty', () => {
  assert.deepEqual(plain(sanitizeInitialQuantities(products, undefined)), {});
});

test('one Product can be preselected with default quantity 1', () => {
  assert.deepEqual(
    plain(sanitizeInitialQuantities(products, { productA: 1 })),
    { productA: 1 },
  );
});

test('multiple Products can be preselected', () => {
  assert.deepEqual(
    plain(sanitizeInitialQuantities(products, { productA: 1, productB: 1 })),
    { productA: 1, productB: 1 },
  );
});

test('initial quantities reject invalid values and unknown Product IDs', () => {
  assert.deepEqual(
    plain(sanitizeInitialQuantities(products, {
      productA: Number.NaN,
      productB: Number.POSITIVE_INFINITY,
      productC: '2',
      unknownProduct: 1,
    })),
    {},
  );
});

test('initial quantities floor decimals and clamp to 0..999', () => {
  assert.deepEqual(
    plain(sanitizeInitialQuantities(products, {
      productA: 3.9,
      productB: 1500,
      productC: -4,
    })),
    { productA: 3, productB: 999, productC: 0 },
  );
});

test('PrintWorkspace initializes handoff only once and does not reset user edits on rerender', () => {
  assert.match(
    printSource,
    /useState<Record<string, number>>\(\s*\(\) => sanitizeInitialQuantities\(products, initialQuantities\),\s*\)/s,
  );
  const initializerCalls = printSource.match(/sanitizeInitialQuantities\(products, initialQuantities\)/g) ?? [];
  assert.equal(initializerCalls.length, 1);
});

test('preview remains driven by editable quantities and existing LabelPreview', () => {
  assert.match(printSource, /const quantity = quantities\[product\.id\] \?\? 0/);
  assert.match(printSource, /<LabelPreview labels=\{labels\} config=\{config\} options=\{options\} \/>/);
});

test('QrPrintingPage validates location state before passing it to PrintWorkspace', () => {
  assert.match(qrSource, /useLocation\(\)/);
  assert.match(qrSource, /getRouteInitialQuantities\(location\.state\)/);
  assert.match(qrSource, /sanitizeInitialQuantities\(products, routeInitialQuantities\)/);
  assert.match(qrSource, /initialQuantities=\{validatedInitialQuantities\}/);
  assert.match(qrSource, /!loading \? \(/);
});
