import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  VND_STEP,
  getSteppedVndValue,
  parseVndInteger,
} from '../src/shared/numeric/vndMoneyStep.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function sourceFilesWithNumberInputs(directory) {
  const matches = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...sourceFilesWithNumberInputs(target));
    else if (entry.isFile() && entry.name.endsWith('.tsx') && read(path.relative(root, target)).includes('type="number"')) {
      matches.push(path.relative(root, target).replaceAll(path.sep, '/'));
    }
  }
  return matches.sort();
}

test('all interactive type=number surfaces are audited by the global numeric-step contract', () => {
  assert.deepEqual(sourceFilesWithNumberInputs(path.join(root, 'src')), [
    'src/modules/printing/PrintWorkspace.tsx',
    'src/modules/products/ProductEditorForm.tsx',
    'src/modules/purchases/PurchaseEditor.tsx',
    'src/modules/sales/SalesPage.tsx',
    'src/modules/stockout/StockOutPage.tsx',
    'src/modules/stocktake/StocktakePage.tsx',
    'src/shared/numeric/VndMoneyInput.tsx',
  ]);
});

test('transaction quantity inputs keep their module-specific precision contracts', () => {
  const purchase = read('src/modules/purchases/PurchaseEditor.tsx');
  const sales = read('src/modules/sales/SalesPage.tsx');
  const stockout = read('src/modules/stockout/StockOutPage.tsx');
  const stocktake = read('src/modules/stocktake/StocktakePage.tsx');

  assert.match(purchase, /inputMode="numeric" min="1" step="1" value=\{line\.quantity\}/);
  assert.match(sales, /className="sales-qty-control"[\s\S]*?<input[\s\S]*?type="number"[\s\S]*?inputMode="decimal"[\s\S]*?min="0\.001"[\s\S]*?step="0\.001"/);
  assert.doesNotMatch(sales, /className="sales-qty-control"[\s\S]*?<input[\s\S]*?inputMode="numeric"[\s\S]*?min="1"[\s\S]*?step="1"/);
  assert.match(stockout, /Số lượng<input type="number" inputMode="numeric" min="1" step="1"/);
  assert.equal((stocktake.match(/type="number"\s+inputMode="numeric"\s+min="0"\s+step="1"/g) ?? []).length, 2);
});

test('existing explicit quantity buttons remain exact plus or minus one', () => {
  const sales = read('src/modules/sales/SalesPage.tsx');
  const stocktake = read('src/modules/stocktake/StocktakePage.tsx');

  assert.match(sales, /setLineQuantity\(product, line\.quantity - 1\)/);
  assert.match(sales, /setLineQuantity\(product, line\.quantity \+ 1\)/);
  assert.match(stocktake, /adjustQuantity\(product\.id, -1\)/);
  assert.match(stocktake, /adjustQuantity\(product\.id, 1\)/);
});

test('non-target numeric controls stay on their original contracts', () => {
  const product = read('src/modules/products/ProductEditorForm.tsx');
  const printing = read('src/modules/printing/PrintWorkspace.tsx');

  assert.match(product, /Tồn tối thiểu<input type="number" min="0" step="1"/);

  const quantityStart = printing.indexOf('className="print-quantity"');
  const quantityBlock = printing.slice(quantityStart, printing.indexOf('</label>', quantityStart));
  assert.match(quantityBlock, /type="number"/);
  assert.doesNotMatch(quantityBlock, /step=/);

  assert.match(printing, /step="0\.1"[^\n]*labelWidthMm/);
  assert.match(printing, /step="0\.1"[^\n]*labelHeightMm/);
  assert.match(printing, /step="1"[^\n]*columns/);
  assert.match(printing, /step="0\.1"[^\n]*gapHorizontalMm/);
  assert.match(printing, /step="0\.1"[^\n]*gapVerticalMm/);
  assert.match(printing, /step="0\.05"[^\n]*marginMm/);
  assert.match(printing, /step="0\.5"[\s\S]*?qrSizeMm/);
});

test('all six VND inputs reuse one shared exact-10k primitive', () => {
  const product = read('src/modules/products/ProductEditorForm.tsx');
  const purchase = read('src/modules/purchases/PurchaseEditor.tsx');
  const sales = read('src/modules/sales/SalesPage.tsx');
  const expense = read('src/modules/expenses/ExpensesPage.tsx');

  assert.equal((product.match(/<VndMoneyInput/g) ?? []).length, 2);
  assert.match(product, /label="Giá vốn hiện tại \(VND\)"/);
  assert.match(product, /label="Giá bán \(VND\)"/);

  assert.equal((purchase.match(/<VndMoneyInput/g) ?? []).length, 2);
  assert.match(purchase, /label="Giá nhập"/);
  assert.match(purchase, /label="Giá bán"/);

  assert.equal((sales.match(/<VndMoneyInput/g) ?? []).length, 1);
  assert.match(sales, /label="Giảm giá đơn \(VND\)"/);

  assert.equal((expense.match(/<VndMoneyInput/g) ?? []).length, 1);
  assert.match(expense, /label="Số tiền \(VND\) \*"/);
  assert.match(expense, /min=\{1\}/);
});

test('VND stepping is relative to the current arbitrary integer, never a 10k grid snap', () => {
  assert.equal(VND_STEP, 10_000);
  assert.equal(getSteppedVndValue(40_740, 1), 50_740);
  assert.equal(getSteppedVndValue(80_724, 1), 90_724);
  assert.equal(getSteppedVndValue(125_580, 1), 135_580);
  assert.equal(getSteppedVndValue(999_999, 1), 1_009_999);
  assert.equal(getSteppedVndValue(50_740, -1), 40_740);
  assert.equal(getSteppedVndValue(10_000, -1), 0);
  assert.equal(getSteppedVndValue(9_999, -1), null);
  assert.equal(getSteppedVndValue(10_000, -1, 1), null);
});

test('manual arbitrary integer VND remains intact and is not rounded to 10k multiples', () => {
  for (const value of [40_740, 80_724, 125_580, 999_999]) {
    assert.equal(parseVndInteger(String(value)), value);
  }
  assert.equal(parseVndInteger('40740.5'), null);

  const helper = read('src/shared/numeric/vndMoneyStep.ts');
  const component = read('src/shared/numeric/VndMoneyInput.tsx');
  assert.doesNotMatch(helper, /Math\.round|%\s*VND_STEP/);
  assert.match(component, /step="any"/);
  assert.doesNotMatch(component, /step="10000"/);
});

test('money controls replace native spinner behavior with keyboard-accessible 44px exact-step controls', () => {
  const component = read('src/shared/numeric/VndMoneyInput.tsx');
  const css = read('src/shared/numeric/vndMoneyInput.css');

  assert.match(component, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /applyStep\(event\.key === 'ArrowUp' \? 1 : -1\)/);
  assert.match(component, /aria-label=\{`Giảm \$\{accessibleName\} 10\.000 VND`\}/);
  assert.match(component, /aria-label=\{`Tăng \$\{accessibleName\} 10\.000 VND`\}/);
  assert.match(css, /vnd-money-input__step\{[^}]*min-width:44px;min-height:44px/);
  assert.match(css, /webkit-inner-spin-button\{[^}]*-webkit-appearance:none/);
  assert.match(css, /vnd-money-input__field\{[^}]*min-width:0[^}]*min-height:44px/);
});

test('shared money control stays a native labeled number input without formatting the value', () => {
  const component = read('src/shared/numeric/VndMoneyInput.tsx');
  assert.match(component, /<label[^>]*htmlFor=\{inputId\}>\{label\}<\/label>/);
  assert.match(component, /type="number"/);
  assert.match(component, /inputMode="numeric"/);
  assert.match(component, /aria-label=\{accessibleName\}/);
  assert.doesNotMatch(component, /Intl\.NumberFormat|toLocaleString/);
});
