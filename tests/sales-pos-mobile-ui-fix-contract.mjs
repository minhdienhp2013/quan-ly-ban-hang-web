import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('POS/history transitions and scanner close paths restore deliberate focus', () => {
  const page = read('src/modules/sales/SalesPage.tsx');

  assert.match(page, /const scanToggleRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(page, /const historyBackButtonRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(page, /function openHistory\(\)[\s\S]*?setView\('history'\)[\s\S]*?historyBackButtonRef\.current\?\.focus\(\)/);
  assert.match(page, /function returnToPos\(\)[\s\S]*?setView\('pos'\)[\s\S]*?searchInputRef\.current\?\.focus\(\)/);
  assert.match(page, /ref=\{historyBackButtonRef\}[\s\S]*?onClick=\{returnToPos\}/);
  assert.match(page, /onClick=\{openHistory\}>Xem toàn bộ<\/button>/);

  assert.match(page, /function closeScanner\(\)[\s\S]*?setScannerOpen\(false\)[\s\S]*?searchInputRef\.current\?\.focus\(\)/);
  assert.match(page, /function toggleScanner\(\)[\s\S]*?if \(scannerOpen\)[\s\S]*?setScannerOpen\(false\)[\s\S]*?scanToggleRef\.current\?\.focus\(\)/);
  assert.match(page, /ref=\{scanToggleRef\}[\s\S]*?onClick=\{toggleScanner\}/);
  assert.match(page, /onClick=\{closeScanner\}>Đóng<\/button>/);
});

test('reviewed POS touch targets are at least 44px through the loaded override layer', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  const overrides = read('src/modules/sales/salesPosOverrides.css');

  assert.match(page, /import '\.\/sales\.css';\s*import '\.\/salesPosOverrides\.css';/);
  assert.match(overrides, /\.sales-discount-field \.vnd-money-input__field\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(overrides, /\.sales-error button,[\s\S]*?\.sales-recent-header > button,[\s\S]*?\.sales-remove-line\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
  assert.match(overrides, /\.sales-remove-line\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.doesNotMatch(overrides, /min-height:\s*(?:39|40)px/);
});
