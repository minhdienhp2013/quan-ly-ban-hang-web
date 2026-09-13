import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const presetsSource = read('src/modules/printing/labelPresets.ts');
const previewSource = read('src/modules/printing/LabelPreview.tsx');
const workspaceSource = read('src/modules/printing/PrintWorkspace.tsx');
const cssSource = read('src/modules/printing/printing.css');
const printServiceSource = read('src/modules/printing/printService.ts');
const codeGraphicsSource = read('src/modules/printing/codeGraphics.tsx');
const qrPageSource = read('src/modules/qr/QrPrintingPage.tsx');

function loadGroupingFunction() {
  const start = previewSource.indexOf('export function groupLabelsIntoRowPages');
  const endMarker = '\n}\n\nfunction LabelCard';
  const end = previewSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'groupLabelsIntoRowPages must exist');

  const executable = previewSource
    .slice(start, end + 3)
    .replace('export function ', 'function ')
    .replace('<T>', '')
    .replace('items: readonly T[]', 'items')
    .replace('): T[][] {', ') {')
    .replace('const pages: T[][] = [];', 'const pages = [];');

  return vm.runInNewContext(`${executable}\ngroupLabelsIntoRowPages;`);
}

const groupLabelsIntoRowPages = loadGroupingFunction();

test('74x22 preset describes the whole 74mm row and two 35x22 labels', () => {
  assert.match(presetsSource, /LABEL_74X22_PAGE_WIDTH_MM = 74/);
  assert.match(presetsSource, /LABEL_74X22_PAGE_HEIGHT_MM = 22/);
  assert.match(presetsSource, /id: LABEL_74X22_PRESET_ID,[\s\S]*?labelWidthMm: 35,[\s\S]*?labelHeightMm: 22,[\s\S]*?columns: 2,[\s\S]*?gapHorizontalMm: 0\.1,[\s\S]*?gapVerticalMm: 0,[\s\S]*?marginMm: 1\.95/);
  assert.ok(Math.abs((1.95 + 35 + 0.1 + 35 + 1.95) - 74) < 0.001);
});

test('74x22 QR defaults to 19mm and input is clamped to 12..19mm', () => {
  assert.match(presetsSource, /LABEL_74X22_QR_MIN_MM = 12/);
  assert.match(presetsSource, /LABEL_74X22_QR_MAX_MM = 19/);
  assert.match(presetsSource, /LABEL_74X22_QR_DEFAULT_MM = 19/);
  assert.match(presetsSource, /Math\.max\(LABEL_74X22_QR_MIN_MM, Math\.min\(LABEL_74X22_QR_MAX_MM, value\)\)/);
  assert.match(workspaceSource, /showBarcode: false/);
  assert.match(workspaceSource, /qrSizeMm: LABEL_74X22_QR_DEFAULT_MM/);
  assert.match(workspaceSource, /clamp74x22QrSizeMm\(Number\(event\.target\.value\)\)/);
  assert.match(cssSource, /\.product-label--74x22 \.label-qr[\s\S]*?width: var\(--qr-size\);[\s\S]*?height: var\(--qr-size\);[\s\S]*?max-width: 19mm;[\s\S]*?max-height: 19mm;/);
});

test('74x22 label hard-clips content and long names use adaptive multi-line clamping', () => {
  assert.match(cssSource, /\.product-label \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;[\s\S]*?box-sizing: border-box;[\s\S]*?overflow: hidden;/);
  assert.match(cssSource, /\.product-label--74x22 \{[\s\S]*?width: 35mm;[\s\S]*?height: 22mm;[\s\S]*?overflow: hidden;/);
  assert.match(cssSource, /\.product-label__text--74x22 \{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/);
  assert.match(cssSource, /-webkit-line-clamp: 4;/);
  assert.match(cssSource, /text-overflow: ellipsis;/);
  assert.match(previewSource, /getAdaptiveNameClass/);
  assert.match(cssSource, /product-label__name--short/);
  assert.match(cssSource, /product-label__name--medium/);
  assert.match(cssSource, /product-label__name--long/);
  assert.match(cssSource, /product-label__name--xlong/);
  assert.doesNotMatch(cssSource, /transform:\s*scale\(/);
});

test('labels are grouped into physical row pages with exactly two slots', () => {
  const pages = groupLabelsIntoRowPages(['A', 'B', 'C', 'D', 'E'], 2);
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), [['A', 'B'], ['C', 'D'], ['E']]);
  assert.match(previewSource, /groupLabelsIntoRowPages\(labels, 2\)/);
  assert.match(previewSource, /className="label-print-page"/);
  assert.match(previewSource, /page\.length < 2 \? <div className="product-label product-label--empty"/);
});

test('print page count is ceil(labelCount / 2) for required cases', () => {
  const expected = new Map([[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [10, 5]]);
  for (const [labelCount, pageCount] of expected) {
    const labels = Array.from({ length: labelCount }, (_, index) => index);
    assert.equal(groupLabelsIntoRowPages(labels, 2).length, pageCount);
    assert.equal(pageCount, Math.ceil(labelCount / 2));
  }
});

test('74x22 print page height is fixed and last page does not force a trailing blank page', () => {
  assert.match(cssSource, /\.label-print-page \{[\s\S]*?width: var\(--page-width\);[\s\S]*?height: var\(--page-height\);[\s\S]*?margin: 0;[\s\S]*?padding: 0 var\(--label-margin\);[\s\S]*?overflow: hidden;/);
  assert.match(cssSource, /\.label-print-page:not\(:last-child\) \{[\s\S]*?break-after: page !important;[\s\S]*?page-break-after: always !important;/);
  assert.match(cssSource, /\.label-print-page:last-child \{[\s\S]*?break-after: auto !important;[\s\S]*?page-break-after: auto !important;/);
  assert.match(workspaceSource, /widthMm: LABEL_74X22_PAGE_WIDTH_MM, heightMm: LABEL_74X22_PAGE_HEIGHT_MM/);
  assert.match(printServiceSource, /@page \{ size: \$\{pageSize\.widthMm\}mm \$\{pageSize\.heightMm\}mm; margin: 0; \}/);
});

test('screen preview and print share the same row-page geometry variables', () => {
  assert.match(previewSource, /'--page-width': `\$\{sheetWidthMm\}mm`/);
  assert.match(previewSource, /'--page-height': `\$\{rowPage74x22 \? LABEL_74X22_PAGE_HEIGHT_MM : config\.labelHeightMm\}mm`/);
  const printMedia = cssSource.indexOf('@media print');
  assert.match(cssSource.slice(0, printMedia), /\.label-print-page \{[\s\S]*?grid-template-columns: repeat\(2, var\(--label-width\)\)/);
  assert.match(cssSource.slice(printMedia), /\.label-print-page \{[\s\S]*?grid-template-columns: repeat\(2, var\(--label-width\)\) !important/);
});

test('Product preselection handoff remains intact', () => {
  assert.match(workspaceSource, /initialQuantities\?: Readonly<Record<string, number>>/);
  assert.match(workspaceSource, /sanitizeInitialQuantities\(products, initialQuantities\)/);
  assert.match(qrPageSource, /initialQuantities=\{validatedInitialQuantities\}/);
});

test('CODE128, EAN13 validation, QR SVG contract and browser print remain intact', () => {
  assert.match(codeGraphicsSource, /BarcodeKind = 'CODE128' \| 'EAN13'/);
  assert.match(codeGraphicsSource, /export function isValidEan13/);
  assert.match(codeGraphicsSource, /type: 'svg'/);
  assert.match(codeGraphicsSource, /errorCorrectionLevel: 'M'/);
  assert.match(codeGraphicsSource, /margin: 1/);
  assert.match(printServiceSource, /window\.print\(\)/);
});

test('50x30 preset and custom configuration path are preserved', () => {
  assert.match(presetsSource, /id: '50x30-1',[\s\S]*?labelWidthMm: 50,[\s\S]*?labelHeightMm: 30,[\s\S]*?columns: 1/);
  assert.match(workspaceSource, /id: 'custom', name: 'Khổ tùy chỉnh'/);
  assert.match(workspaceSource, /LABEL_PRESETS\.find/);
});
