import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ExcelJS=require('../vendor/exceljs.min.js');

function element(){return {value:'',files:[],hidden:false,disabled:false,textContent:'',innerHTML:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},append(){},appendChild(){},click(){},querySelector(){return element();},querySelectorAll(){return []}};}
const elements=new Map(),document={body:element(),createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return [];}};
const context={__ORDER_CLEANER_TEST_MODE__:true,ExcelJS,addEventListener(){},alert(){},confirm(){return true;},Blob,URL,console,document,localStorage:{getItem(){return null;},setItem(){}},requestAnimationFrame(cb){cb();},setTimeout,clearTimeout,structuredClone};context.window=context;
vm.runInNewContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context,{filename:'app.js'});
const api=context.__RETURN_CLEANUP_TEST__;
for(const [input,expected] of [
  ['2571-7026-0922','257170260922'],
  ['2631-3414-4781','263134144781'],
  ['2622-3508-8662','262235088662'],
  [' 2571-7026-0922 ','257170260922'],
  ['2571 7026 0922','257170260922'],
  ['0123-4567-8901','012345678901']
])assert.equal(api.normalizeWaybillIdentifier(input),expected);

function fixture(columns){
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('집하실적');
  ws.getCell(4,columns.original).value=' 원운송장번호 ';ws.getCell(4,columns.sender).value='송하인명';ws.getCell(4,columns.current).value='운송장번호';
  return {wb,ws};
}

const fixed=fixture({original:45,sender:29,current:5});
fixed.ws.getCell(5,45).value='100000000001';fixed.ws.getCell(5,29).value='홍길동';fixed.ws.getCell(5,5).value='200000000001';
fixed.ws.getCell(6,45).value='';fixed.ws.getCell(6,29).value='제외';fixed.ws.getCell(6,5).value='999';
fixed.ws.getCell(7,45).value='1234567890123456789012345';fixed.ws.getCell(7,29).value='';fixed.ws.getCell(7,5).value='9876543210987654321098765';
fixed.ws.getCell(8,45).value='100000000001';fixed.ws.getCell(8,29).value='중복';fixed.ws.getCell(8,5).value='200000000001';
const fixedRows=api.extractReturnRows(fixed.wb).rows;
assert.deepEqual(JSON.parse(JSON.stringify(fixedRows)),[
  {originalWaybill:'100000000001',senderName:'홍길동',waybill:'200000000001'},
  {originalWaybill:'1234567890123456789012345',senderName:'',waybill:'9876543210987654321098765'},
  {originalWaybill:'100000000001',senderName:'중복',waybill:'200000000001'}
]);

const moved=fixture({original:2,sender:8,current:26});moved.ws.getCell(5,2).value='0012-3456-7890-1234-5678';moved.ws.getCell(5,8).value='이순신';moved.ws.getCell(5,26).value='0098 7654 3210 9876 5432';
assert.equal(api.extractReturnRows(moved.wb).rows[0].originalWaybill,'00123456789012345678');
const output=api.createReturnWorkbook(api.extractReturnRows(moved.wb).rows),outputWs=output.getWorksheet('반품정리');assert.equal(outputWs.rowCount,2);
assert.deepEqual(Array.from(outputWs.getRow(2).values).slice(1,5),['00123456789012345678','이순신','','00987654321098765432']);
assert.equal(outputWs.getCell('A2').numFmt,'@');assert.equal(outputWs.getCell('D2').numFmt,'@');
for(let r=1;r<=2;r++)for(let c=1;c<=4;c++)assert.deepEqual(JSON.parse(JSON.stringify(outputWs.getCell(r,c).alignment)),{horizontal:'center',vertical:'middle'});
const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await output.xlsx.writeBuffer());const reopenedWs=reopened.getWorksheet('반품정리');
assert.equal(reopenedWs.getCell('A2').value,'00123456789012345678');assert.equal(reopenedWs.getCell('D2').value,'00987654321098765432');
assert.equal(reopenedWs.getCell('A2').numFmt,'@');assert.equal(reopenedWs.getCell('D2').numFmt,'@');
assert.equal(reopenedWs.getCell('B2').value,'이순신');assert.equal(reopenedWs.getCell('C2').value,'');
for(let r=1;r<=2;r++)for(let c=1;c<=4;c++)assert.deepEqual(reopenedWs.getCell(r,c).alignment,{horizontal:'center',vertical:'middle'});

const missing=new ExcelJS.Workbook(),missingWs=missing.addWorksheet('오류');missingWs.addRow(['원운송장번호','송하인명']);
assert.throws(()=>api.extractReturnRows(missing),/필수 열을 찾을 수 없습니다: 운송장번호/);
console.log('return cleanup: header discovery, row rules, order, duplicates, and text identifiers passed');

