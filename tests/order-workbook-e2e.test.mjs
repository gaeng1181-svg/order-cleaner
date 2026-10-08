import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ExcelJS = require('../vendor/exceljs.min.js');
const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error('usage: order-workbook-e2e.test.mjs INPUT_XLSX OUTPUT_XLSX');

const elements = new Map();
function createElement() {
  const children = new Map();
  return {
    addEventListener() {}, appendChild() {}, click() {}, remove() {},
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, createElement());
      return children.get(selector);
    },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {}, style: {}, files: [], value: '', textContent: '', innerHTML: '', hidden: false, disabled: false
  };
}
const document = {
  body: createElement(), createElement,
  getElementById(id) { if (!elements.has(id)) elements.set(id, createElement()); return elements.get(id); },
  querySelectorAll() { return []; }
};
const context = {
  __ORDER_CLEANER_TEST_MODE__: true,
  ExcelJS,
  addEventListener() {}, alert() {}, confirm() { return true; },
  Blob, URL, console, document,
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame(callback) { callback(); },
  setTimeout, clearTimeout, structuredClone
};
context.window = context;
vm.runInNewContext(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), context, { filename: 'app.js' });
const { processOrderWorkbook, applyFinalAliasesToSource } = context.__ORDER_CLEANER_TEST__;

const mismatchWorkbook = new ExcelJS.Workbook();
const mismatchSource = mismatchWorkbook.addWorksheet('원본');
const mismatchTarget = mismatchWorkbook.addWorksheet('작업');
mismatchSource.addRow(['사방넷주문번호']);
mismatchSource.addRow(['A']);
mismatchSource.getCell('N2').value = '원본값';
mismatchTarget.addRow(['사방넷주문번호']);
mismatchTarget.addRow(['B']);
mismatchTarget.getCell('N2').value = '잘못된값';
assert.throws(() => applyFinalAliasesToSource(mismatchSource, mismatchTarget), /사방넷주문번호가 일치하지 않아/);
assert.equal(mismatchSource.getCell('N2').value, '원본값', 'mismatch must abort before writing source N');

const protectedWorkbook = new ExcelJS.Workbook();
await protectedWorkbook.xlsx.load(await fs.promises.readFile(inputPath));
assert.ok(protectedWorkbook.getWorksheet('작업'), 'attached workbook must exercise existing 작업 protection');
assert.throws(
  () => processOrderWorkbook(protectedWorkbook),
  /이미 ‘작업’ 시트가 있습니다/,
  'existing 작업 sheet must never be overwritten or removed'
);
assert.ok(protectedWorkbook.getWorksheet('작업'), 'existing 작업 sheet remains after rejection');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await fs.promises.readFile(inputPath));
const existingWorkSheet = workbook.getWorksheet('작업');
workbook.removeWorksheet(existingWorkSheet.id); // test-only fixture preparation; production rejects this workbook above.
const source = workbook.worksheets[0];
const sourceName = source.name;
const rowCount = source.rowCount;
const columnCount = source.columnCount;

function comparable(value) {
  return JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);
}
const beforeCells = new Map();
for (let row = 1; row <= rowCount; row++) {
  for (let column = 1; column <= columnCount; column++) {
    const cell = source.getCell(row, column);
    beforeCells.set(`${row}:${column}`, { value: comparable(cell.value), style: comparable(cell.style) });
  }
}
const beforeRows = Array.from({ length: rowCount }, (_, index) => {
  const row = source.getRow(index + 1);
  return { height: row.height, hidden: row.hidden, outlineLevel: row.outlineLevel };
});
const beforeColumns = Array.from({ length: columnCount }, (_, index) => {
  const column = source.getColumn(index + 1);
  return { width: column.width, hidden: column.hidden, outlineLevel: column.outlineLevel };
});

const { sourceSheet, targetSheet } = processOrderWorkbook(workbook);
assert.equal(sourceSheet.name, sourceName);
assert.equal(targetSheet.name, '작업');
assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), [sourceName, '작업']);
assert.equal(sourceSheet.getCell('N1').value, null);
assert.equal(targetSheet.getCell('N1').value, null);

const expected = new Map([
  [2, '접이식 캠핑화로대 420x420'],
  [3, '티에소 사각드로즈 그레이(남) 2XL'],
  [4, '티에소 사각드로즈 블랙(남) 2XL'],
  [11, '1_접이식(1+1) 블랙XL+그레이L'],
  [39, '체크무늬 식탁보 블루 140 x 100 cm 140cm']
]);
for (const [row, value] of expected) {
  assert.equal(targetSheet.getCell(row, 14).value, value, `작업!N${row}`);
  assert.equal(sourceSheet.getCell(row, 14).value, value, `${sourceName}!N${row}`);
}

for (let row = 2; row <= rowCount; row++) {
  assert.equal(
    comparable(sourceSheet.getCell(row, 14).value),
    comparable(targetSheet.getCell(row, 14).value),
    `source/work N sync at row ${row}`
  );
  const finalN = String(targetSheet.getCell(row, 14).value ?? '');
  assert.doesNotMatch(finalN, /(?:색상|사이즈)\s*[:：]|남성용|남자|남성|여성용|여자|여성/, `unclean N${row}`);
}

for (let row = 1; row <= rowCount; row++) {
  for (let column = 1; column <= columnCount; column++) {
    const before = beforeCells.get(`${row}:${column}`);
    const after = sourceSheet.getCell(row, column);
    if (column !== 14) assert.equal(comparable(after.value), before.value, `source value changed at ${row}:${column}`);
    assert.equal(comparable(after.style), before.style, `source style changed at ${row}:${column}`);
  }
  assert.deepEqual(
    { height: sourceSheet.getRow(row).height, hidden: sourceSheet.getRow(row).hidden, outlineLevel: sourceSheet.getRow(row).outlineLevel },
    beforeRows[row - 1],
    `source row layout changed at ${row}`
  );
}
for (let column = 1; column <= columnCount; column++) {
  const current = sourceSheet.getColumn(column);
  assert.deepEqual({ width: current.width, hidden: current.hidden, outlineLevel: current.outlineLevel }, beforeColumns[column - 1]);
}

await fs.promises.writeFile(outputPath, await workbook.xlsx.writeBuffer());
const reopened = new ExcelJS.Workbook();
await reopened.xlsx.load(await fs.promises.readFile(outputPath));
assert.deepEqual(reopened.worksheets.map(sheet => sheet.name), [sourceName, '작업']);
for (const [row, value] of expected) {
  assert.equal(reopened.getWorksheet(sourceName).getCell(row, 14).value, value);
  assert.equal(reopened.getWorksheet('작업').getCell(row, 14).value, value);
}

console.log(`order workbook e2e: ${rowCount - 1} rows verified, source non-N values/styles preserved`);
