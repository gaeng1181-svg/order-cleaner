import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createHarness() {
  const elements = new Map();
  function createElement() {
    const listeners = new Map();
    const children = [];
    const childBySelector = new Map();
    return {
      addEventListener(name, handler) { listeners.set(name, handler); },
      append(...items) { children.push(...items); },
      appendChild(item) { children.push(item); return item; },
      click() { listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); },
      remove() {},
      setAttribute(name, value) { this[name] = value; },
      querySelector(selector) {
        if (!childBySelector.has(selector)) childBySelector.set(selector, createElement());
        return childBySelector.get(selector);
      },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {},
      style: {},
      files: [],
      value: '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      children,
      listeners
    };
  }
  const document = {
    body: createElement(),
    createElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; }
  };
  const context = {
    __ORDER_CLEANER_TEST_MODE__: true,
    addEventListener() {},
    alert() {},
    confirm() { return true; },
    Blob,
    URL,
    console,
    document,
    localStorage: { getItem() { return null; }, setItem() {} },
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    clearTimeout,
    structuredClone
  };
  context.window = context;
  return { context, document, elements };
}

const appHarness = createHarness();
vm.runInNewContext(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), appHarness.context, { filename: 'app.js' });
const order = appHarness.context.__ORDER_CLEANER_TEST__;
const uploads = appHarness.context.__UPLOAD_STATE_TEST__;

const orderFile = { name: 'A.xlsx', size: 1024 };
order.chooseFile(orderFile);
assert.equal(order.getSelectedFileName(), 'A.xlsx');
appHarness.document.getElementById('errorBox').textContent = '이미 작업 시트가 있습니다.';
appHarness.document.getElementById('errorBox').hidden = false;
order.resetOrderFile();
assert.equal(order.getSelectedFileName(), '');
assert.equal(appHarness.document.getElementById('fileInput').value, '');
assert.equal(appHarness.document.getElementById('errorBox').textContent, '');
assert.equal(appHarness.document.getElementById('runButton').disabled, true);
order.chooseFile(orderFile);
assert.equal(order.getSelectedFileName(), 'A.xlsx', 'same file can be selected after clearing');

uploads.setPoFile({ name: 'A.csv' });
assert.equal(uploads.getPoFileName(), 'A.csv');
uploads.clearPoFile();
assert.equal(uploads.getPoFileName(), '');
assert.equal(appHarness.document.getElementById('poInput').value, '');
assert.equal(appHarness.document.getElementById('poRun').disabled, true);

for (const [clear, inputId, stateId, buttonId] of [
  [uploads.clearAddrFile, 'addrInput', 'addrFileState', null],
  [uploads.clearShipmentFile, 'shipInput', 'shipFileState', 'shipSave'],
  [uploads.clearTrackingFile, 'trackingInput', 'trackingFileState', 'trackingDownload']
]) {
  appHarness.document.getElementById(inputId).value = 'selected';
  appHarness.document.getElementById(stateId).hidden = false;
  clear();
  assert.equal(appHarness.document.getElementById(inputId).value, '');
  assert.equal(appHarness.document.getElementById(stateId).hidden, true);
  if (buttonId) assert.equal(appHarness.document.getElementById(buttonId).disabled, true);
}

const pdfHarness = createHarness();
vm.runInNewContext(fs.readFileSync(new URL('../pdf-ui.js', import.meta.url), 'utf8'), pdfHarness.context, { filename: 'pdf-ui.js' });
const pdf = pdfHarness.context.__PDF_FILE_TEST__;
pdf.setFourFilesForTest([{ name: 'A.pdf' }, { name: 'B.pdf' }, { name: 'C.pdf' }]);
pdf.removeFourFileAt(1, false);
assert.deepEqual(Array.from(pdf.getFourFileNames()), ['A.pdf', 'C.pdf']);
pdf.clearFourSelection();
assert.deepEqual(Array.from(pdf.getFourFileNames()), []);
assert.equal(pdfHarness.document.getElementById('pdfFourInput').value, '');
assert.equal(pdfHarness.document.getElementById('pdfFourError').hidden, true);
assert.equal(pdfHarness.document.getElementById('pdfFourDownload').disabled, true);

pdfHarness.document.getElementById('pdfInput').value = 'selected';
pdfHarness.document.getElementById('pdfError').hidden = false;
pdf.clearPdfSelection();
assert.equal(pdfHarness.document.getElementById('pdfInput').value, '');
assert.equal(pdfHarness.document.getElementById('pdfError').hidden, true);
assert.equal(pdfHarness.document.getElementById('pdfDownload').disabled, true);

console.log('file selection reset: order, PO, shipment, tracking, address, and PDF cases passed');
