import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLegacyProductCode } from '../src/modules/products/productLegacyCode.ts';

const goldenExamples = [
  ['bàn cafe bàn tròn mây nhựa', 'bcbtmn'],
  ['bàn k min 1m', 'bkm1m'],
  ['bàn k min 1m2', 'bkm1m2'],
  ['bàn k min 80', 'bkm80'],
  ['bàn kim cương khung vàng kính đen', 'bkckvkd'],
  ['bàn phấn gỗ 1m cổ điển', 'bpg1mcd'],
  ['bàn phấn gỗ 1m2 cổ điển', 'bpg1m2cd'],
  ['Bộ bàn ăn chân soi mặt đá ghế 1 lá ngang sồi màu óc chó', 'bbacsmdg1lnsmoc'],
  ['bộ bàn ghế cafe bàn tròn mây nhựa ( 1 bàn 4 ghế)', 'bbgcbtmn1b4g'],
  ['bộ đối thuyền sồi óc chó + đệm da 12p 5 gối tựa', 'bdtsoc+dd12p5gt'],
  ['Tủ 3c + cua nhựa cocoplast', 't3c+cnc'],
  ['Trạn 1,2m', 't12m'],
  ['Tủ giày vinco 1.2', 'tgv1.2'],
  ['treo min 80x80 màu óc chó', 'tm80x80moc'],
];

test('historical VBA golden examples remain byte-for-byte compatible', () => {
  for (const [name, expected] of goldenExamples) {
    assert.equal(generateLegacyProductCode(name), expected, name);
  }
});

test('Vietnamese accents and Đ/đ normalize with historical initials behavior', () => {
  assert.equal(generateLegacyProductCode('Đệm đỏ gỗ Óc Chó'), 'ddgoc');
  assert.equal(generateLegacyProductCode('đèn điện'), 'dd');
});

test('WorksheetFunction.Trim intent trims edges and collapses repeated whitespace', () => {
  assert.equal(generateLegacyProductCode('   bàn   cafe\ttròn\n mây   nhựa   '), 'bctmn');
});

test('historical separators become spaces', () => {
  assert.equal(generateLegacyProductCode('bàn-cafe'), 'bc');
  assert.equal(generateLegacyProductCode('bàn(cafe)'), 'bc');
  assert.equal(generateLegacyProductCode('bàn/cafe'), 'bc');
  assert.equal(generateLegacyProductCode('bàn,cafe'), 'bc');
});

test('plus is preserved as a standalone token', () => {
  assert.equal(generateLegacyProductCode('tủ 3c + cua nhựa'), 't3c+cn');
});

test('numeric-leading tokens are preserved in full including punctuation', () => {
  const cases = [
    ['bàn 1m', 'b1m'],
    ['bàn 1m2', 'b1m2'],
    ['bàn 80', 'b80'],
    ['bàn 80.5t', 'b80.5t'],
    ['bàn 70*90', 'b70*90'],
    ['bàn 12p', 'b12p'],
    ['bàn 1.2', 'b1.2'],
  ];

  for (const [name, expected] of cases) {
    assert.equal(generateLegacyProductCode(name), expected, name);
  }
});

test('generator is pure code generation and never invents collision suffixes', () => {
  assert.equal(generateLegacyProductCode('bàn cafe'), 'bc');
  assert.equal(generateLegacyProductCode('bộ chăn'), 'bc');
  assert.equal(generateLegacyProductCode('bàn cafe').includes('-2'), false);
});

test('empty and whitespace-only names return empty code', () => {
  assert.equal(generateLegacyProductCode(''), '');
  assert.equal(generateLegacyProductCode('   \t\n  '), '');
});
