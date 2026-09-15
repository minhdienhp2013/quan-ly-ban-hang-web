import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QR / printing page prioritizes printing and does not render the camera scanner', () => {
  const page = read('src/modules/qr/QrPrintingPage.tsx');

  assert.doesNotMatch(page, /BarcodeScanner/);
  assert.doesNotMatch(page, /handleScan|ScanHistoryItem|scannerService|productLookup/);
  assert.doesNotMatch(page, /Bật camera|Scanner vẫn tiếp tục quét|Sản phẩm quét được/);

  const printWorkspaceIndex = page.indexOf('<PrintWorkspace');
  const generatorIndex = page.indexOf('<section className="qr-generator"');
  assert.ok(printWorkspaceIndex >= 0, 'PrintWorkspace must remain rendered');
  assert.ok(generatorIndex >= 0, 'QR / barcode generator must remain rendered');
  assert.ok(printWorkspaceIndex < generatorIndex, 'Printing workspace must appear before QR / barcode preview');
});

test('shared scanner implementation remains available for other workflows', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/modules/qr/BarcodeScanner.tsx')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/qr/scannerService.ts')), true);

  const purchaseEditor = read('src/modules/purchases/PurchaseEditor.tsx');
  assert.match(purchaseEditor, /import BarcodeScanner from ['"]\.\.\/qr\/BarcodeScanner['"]/);
  assert.match(purchaseEditor, /<BarcodeScanner onScan=/);
});
