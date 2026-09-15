import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const formModelPath = 'src/modules/products/productFormModel.ts';
const formModel = await import(`../${formModelPath}?test=${Date.now()}`);

const {
  createProductFormState,
  getProductFormValidationError,
  productFormToInput,
  productToFormState,
} = formModel;

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'SKU-001',
    name: 'Sản phẩm mẫu',
    barcode: '893000001',
    qrCode: 'QR-001',
    unit: 'Cái',
    costPrice: 10000,
    salePrice: 15000,
    stockQuantity: 7,
    stockVersion: 3,
    minStock: 2,
    active: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

test('create form defaults match current Products form contract', () => {
  assert.deepEqual(createProductFormState(), {
    sku: '',
    name: '',
    barcode: '',
    qrCode: '',
    unit: '',
    costPrice: '0',
    salePrice: '0',
    minStock: '',
    active: true,
  });
});

test('edit initial values map Product metadata without stock editor state', () => {
  const state = productToFormState(product({ active: false, minStock: 4 }));
  assert.deepEqual(state, {
    sku: 'SKU-001',
    name: 'Sản phẩm mẫu',
    barcode: '893000001',
    qrCode: 'QR-001',
    unit: 'Cái',
    costPrice: '10000',
    salePrice: '15000',
    minStock: '4',
    active: false,
  });
  assert.equal('stockQuantity' in state, false);
  assert.equal('stockVersion' in state, false);
});

test('ProductInput mapping trims optional values and preserves minStock and active', () => {
  const input = productFormToInput(createProductFormState({
    sku: '  SKU-NEW  ',
    name: '  Hàng mới  ',
    barcode: '  BAR-1  ',
    qrCode: '  QR-1  ',
    unit: '  Bộ  ',
    costPrice: '12000',
    salePrice: '18000',
    minStock: '5',
    active: false,
  }));

  assert.deepEqual(input, {
    sku: 'SKU-NEW',
    name: 'Hàng mới',
    barcode: 'BAR-1',
    qrCode: 'QR-1',
    unit: 'Bộ',
    costPrice: 12000,
    salePrice: 18000,
    minStock: 5,
    active: false,
  });
});

test('shared validation rejects duplicate SKU and ignores current edit row', () => {
  const existing = product();
  const duplicate = createProductFormState({ sku: ' sku-001 ', name: 'Khác' });
  assert.equal(getProductFormValidationError(duplicate, [existing]), 'SKU “sku-001” đã được sử dụng.');
  assert.equal(getProductFormValidationError(duplicate, [existing], existing.id), null);
});

test('shared validation rejects duplicate barcode', () => {
  const existing = product();
  const duplicate = createProductFormState({ sku: 'SKU-002', name: 'Khác', barcode: '893000001' });
  assert.equal(getProductFormValidationError(duplicate, [existing]), 'Barcode “893000001” đã được sử dụng.');
});

test('shared validation rejects duplicate QR code', () => {
  const existing = product();
  const duplicate = createProductFormState({ sku: 'SKU-002', name: 'Khác', qrCode: 'QR-001' });
  assert.equal(getProductFormValidationError(duplicate, [existing]), 'Mã QR “QR-001” đã được sử dụng.');
});

test('minStock validation and optional mapping keep the current behavior', () => {
  const invalid = createProductFormState({ sku: 'SKU-002', name: 'Khác', minStock: '-1' });
  assert.equal(getProductFormValidationError(invalid, []), 'Tồn tối thiểu phải là số từ 0 trở lên.');

  const withoutMinStock = productFormToInput(createProductFormState({ sku: 'SKU-002', name: 'Khác', minStock: '' }));
  assert.equal(withoutMinStock.minStock, undefined);
});

test('createProduct service contract still creates stock at zero', () => {
  const serviceSource = fs.readFileSync('src/modules/products/productService.ts', 'utf8');
  assert.match(serviceSource, /stockQuantity:\s*0/);
  assert.match(serviceSource, /stockVersion:\s*0/);
});

test('ProductsPage delegates the editor to the shared reusable form', () => {
  const page = fs.readFileSync('src/modules/products/ProductsPage.tsx', 'utf8');
  const editor = fs.readFileSync('src/modules/products/ProductEditorForm.tsx', 'utf8');

  assert.match(page, /import ProductEditorForm from '\.\/ProductEditorForm'/);
  assert.match(page, /<ProductEditorForm/);
  assert.match(page, /mode=\{editingProduct \? 'edit' : 'create'\}/);
  assert.match(page, /initialValues=\{editorInitialValues\}/);
  assert.match(page, /products=\{products\}/);
  assert.match(page, /onSubmit=\{handleSubmit\}/);
  assert.doesNotMatch(page, /interface ProductFormState/);
  assert.doesNotMatch(page, /function getValidationError/);
  assert.doesNotMatch(page, /function toProductInput/);

  for (const prop of ['mode', 'products', 'saving', 'error', 'onSubmit', 'onCancel']) {
    assert.match(editor, new RegExp(`${prop}:`));
  }
  assert.match(editor, /initialValues\?:/);
  assert.doesNotMatch(editor, /useNavigate|navigate\(/);
  assert.doesNotMatch(editor, /role="dialog"|modal-backdrop/);
});
