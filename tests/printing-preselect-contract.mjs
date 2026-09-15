import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const printSource = read('src/modules/printing/PrintWorkspace.tsx');
const qrSource = read('src/modules/qr/QrPrintingPage.tsx');

function loadSelectedFirstPartitioner() {
  const start = printSource.indexOf('export function partitionProductsSelectedFirst');
  const endMarker = '\n}\n\nexport function sanitizeInitialQuantities';
  const end = printSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'partitionProductsSelectedFirst must exist');

  const executable = printSource
    .slice(start, end + 3)
    .replace('export function ', 'function ')
    .replace('products: readonly Product[]', 'products')
    .replace('quantities: Readonly<Record<string, number>>', 'quantities')
    .replace('): Product[] {', ') {')
    .replace('const selected: Product[] = [];', 'const selected = [];')
    .replace('const unselected: Product[] = [];', 'const unselected = [];');

  return vm.runInNewContext(`${executable}\npartitionProductsSelectedFirst;`);
}

function loadSanitizer() {
  const start = printSource.indexOf('export function sanitizeInitialQuantities');
  const endMarker = '\n}\n\nfunction cloneConfig';
  const end = printSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'sanitizeInitialQuantities must exist');

  const executable = printSource
    .slice(start, end + 3)
    .replace('export function ', 'function ')
    .replace('products: readonly Product[]', 'products')
    .replace('initialQuantities: unknown', 'initialQuantities')
    .replace('): Record<string, number> {', ') {')
    .replace('const sanitized: Record<string, number> = {};', 'const sanitized = {};');

  return vm.runInNewContext(`${executable}\nsanitizeInitialQuantities;`);
}

const partitionProductsSelectedFirst = loadSelectedFirstPartitioner();
const sanitizeInitialQuantities = loadSanitizer();
const products = [
  { id: 'productA' },
  { id: 'productB' },
  { id: 'productC' },
  { id: 'productD' },
  { id: 'productE' },
];
const orderedProducts = [
  { id: 'A', name: 'Alpha' },
  { id: 'B', name: 'Beta' },
  { id: 'C', name: 'Charlie' },
  { id: 'D', name: 'Bravo' },
  { id: 'E', name: 'Echo' },
];
const ids = (items) => items.map((item) => item.id);
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

test('selected Products are first while both groups keep original order', () => {
  assert.deepEqual(
    ids(partitionProductsSelectedFirst(orderedProducts, { C: 1, D: 2 })),
    ['C', 'D', 'A', 'B', 'E'],
  );
});

test('quantity > 0 is selected and quantity 0 returns to the stable unselected group', () => {
  assert.deepEqual(
    ids(partitionProductsSelectedFirst(orderedProducts, { C: 0, D: 3 })),
    ['D', 'A', 'B', 'C', 'E'],
  );
});

test('search filters first, then selected-first partition applies only inside matching results', () => {
  const matching = orderedProducts.filter((product) => product.name.toLowerCase().includes('b'));
  assert.deepEqual(ids(matching), ['B', 'D']);
  assert.deepEqual(
    ids(partitionProductsSelectedFirst(matching, { A: 1, D: 1 })),
    ['D', 'B'],
  );
  assert.match(
    printSource,
    /const matchingProducts = !normalized[\s\S]*?products\.filter[\s\S]*?return partitionProductsSelectedFirst\(matchingProducts, quantities\);/,
  );
});

test('route initialQuantities put selected Products first immediately', () => {
  const initial = sanitizeInitialQuantities(products, { productC: 2, productE: 1 });
  assert.deepEqual(
    ids(partitionProductsSelectedFirst(products, initial)),
    ['productC', 'productE', 'productA', 'productB', 'productD'],
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

test('selected-first is list-only: print labels keep original Product ordering contract', () => {
  const labelsStart = printSource.indexOf('const labels = useMemo');
  const labelsEnd = printSource.indexOf('const validationErrors', labelsStart);
  assert.ok(labelsStart >= 0 && labelsEnd > labelsStart, 'labels memo must exist');
  const labelsSource = printSource.slice(labelsStart, labelsEnd);
  assert.match(labelsSource, /for \(const product of products\)/);
  assert.match(labelsSource, /const quantity = quantities\[product\.id\] \?\? 0/);
  assert.doesNotMatch(labelsSource, /partitionProductsSelectedFirst|filteredProducts|matchingProducts/);
  assert.match(printSource, /<LabelPreview labels=\{labels\} config=\{config\} options=\{options\} \/>/);
});

test('reordered picker rows keep stable Product keys and scanner stays outside PrintWorkspace', () => {
  assert.match(printSource, /className="print-product-row" key=\{product\.id\}/);
  assert.doesNotMatch(printSource, /BarcodeScanner|scannerService|productLookup|presenceRearm/);
  assert.match(qrSource, /<PrintWorkspace[\s\S]*?initialQuantities=\{validatedInitialQuantities\}/);
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
