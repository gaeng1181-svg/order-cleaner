import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ExcelJS=require('../vendor/exceljs.min.js');

function harness(stored=null){
  const elements=new Map();
  function element(){const children=[];return {addEventListener(){},append(...v){children.push(...v);},appendChild(v){children.push(v);return v;},click(){},remove(){},setAttribute(n,v){this[n]=v;},querySelector(){return element();},querySelectorAll(){return[];},classList:{add(){},remove(){},toggle(){}},dataset:{},style:{},files:[],value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,children};}
  const document={body:element(),createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return[];}};
  const storage=new Map(stored===null?[]:[['orderCleaner.outOfStockSkus.v1',JSON.stringify(stored)]]);
  const context={__ORDER_CLEANER_TEST_MODE__:true,ExcelJS,addEventListener(){},alert(){},confirm(){return true;},Blob,URL,console,document,localStorage:{getItem(k){return storage.has(k)?storage.get(k):null;},setItem(k,v){storage.set(k,v);}},requestAnimationFrame(cb){cb();},setTimeout,clearTimeout,structuredClone};context.window=context;
  vm.runInNewContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context,{filename:'app.js'});return {api:context.__OOS_SKU_TEST__,storage};
}

const fresh=harness();
assert.equal(fresh.api.DEFAULT_OOS_SKUS.length,42);
assert.equal(fresh.api.getSkus().length,42,'seed only when storage is absent');
assert.deepEqual(Array.from(fresh.api.parseSkuInput(' 2688717725\n2688717893, 2688717725 ;\t2688720942 ')),['2688717725','2688717893','2688720942']);
assert.equal(fresh.api.isOutOfStockSku('2688717725'),true);
assert.equal(fresh.api.isOutOfStockSku('26887177250'),false,'exact match only');
const styleWb=new ExcelJS.Workbook(),styleWs=styleWb.addWorksheet('발주정리'),styled=styleWs.addRow(['센터','1','2688717725','상품',1,'',100,'barcode']),normal=styleWs.addRow(['센터','1','26887177250','상품',1,'',100,'barcode']);
assert.equal(fresh.api.applyOutOfStockFill(styled,'2688717725'),true);
assert.equal(styled.getCell(1).fill.fgColor.argb,'FFFFF2CC');
assert.equal(fresh.api.applyOutOfStockFill(normal,'26887177250'),false);
assert.equal(normal.getCell(1).fill?.fgColor,undefined);
const reopenedStyleWb=new ExcelJS.Workbook();await reopenedStyleWb.xlsx.load(await styleWb.xlsx.writeBuffer());
assert.equal(reopenedStyleWb.getWorksheet('발주정리').getRow(1).getCell(1).fill.fgColor.argb,'FFFFF2CC','yellow fill survives XLSX save and reopen');
assert.equal(reopenedStyleWb.getWorksheet('발주정리').getRow(2).getCell(1).fill?.fgColor,undefined,'normal row style stays unchanged');
const orderRows=[{center:'B',po:'9',sku:'2',sourceIndex:0},{center:'A',po:'10',sku:'1',sourceIndex:1},{center:'A',po:'11',sku:'3',sourceIndex:2}];
fresh.api.sortCoupangRows(orderRows);assert.deepEqual(orderRows.map(x=>`${x.center}-${x.po}-${x.sku}`),['A-11-3','A-10-1','B-9-2']);
const empty=harness([]);
assert.equal(empty.api.getSkus().length,0,'an intentionally cleared list must not be reseeded');

function workbookAt(headerRow,headerCol,count,{blankRow=0,duplicate=false,withCompanions=false}={}){
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('테스트');
  ws.getCell(headerRow,headerCol).value=' SKU ID ';
  if(withCompanions){ws.getCell(headerRow,headerCol+1).value='상품명';ws.getCell(headerRow,headerCol+2).value='생산여부';}
  for(let i=1;i<=count;i++){const row=headerRow+i+(blankRow&&i>=blankRow?1:0),value=String(100000+i);ws.getCell(row,headerCol).value=duplicate&&i===count?'100001':value;if(withCompanions)ws.getCell(row,headerCol+1).value=`상품 ${i}`;}
  return wb;
}
for(const count of [3,50,200]){const result=fresh.api.extractSkuIdsFromWorkbook(workbookAt(5,4,count));assert.equal(result.readCount,count);assert.equal(result.skus.length,count);}
const middle=fresh.api.extractSkuIdsFromWorkbook(workbookAt(18,2,4,{blankRow:3,withCompanions:true}));assert.equal(middle.skus.length,4,'middle blank row does not stop import');
const dup=fresh.api.extractSkuIdsFromWorkbook(workbookAt(2,3,2,{duplicate:true}));assert.equal(dup.readCount,2);assert.equal(dup.skus.length,1);
const noHeader=new ExcelJS.Workbook();noHeader.addWorksheet('숫자').getCell('A1').value=123;
assert.throws(()=>fresh.api.extractSkuIdsFromWorkbook(noHeader),/SKU ID 열을 찾을 수 없습니다/);
console.log('out-of-stock SKU: 42 seed, input parsing, exact match, variable Excel ranges, blanks, moved headers, duplicates, and missing-header cases passed');


const direct=harness(['2688717725','26887177250','2688717893','00123']);
let deletion=direct.api.removeOutOfStockSkus([' 2688717725 ','2688717725','9999999999','']);
assert.deepEqual(JSON.parse(JSON.stringify(deletion)),{deletedCount:1,missingCount:1,totalCount:3});
assert.equal(direct.api.isOutOfStockSku('26887177250'),true);
assert.equal(direct.api.isOutOfStockSku('00123'),true);
const restored=harness(JSON.parse(direct.storage.get(direct.api.OOS_KEY)));
assert.equal(restored.api.isOutOfStockSku('2688717725'),false,'deleted seed is not recreated on reload');
for(const input of ['2688717893\n00123','2688717893, 00123']){
  const h=harness(['2688717893','00123','keep']);
  const result=h.api.removeOutOfStockSkus(h.api.parseSkuInput(input));
  assert.equal(result.deletedCount,2);assert.deepEqual(Array.from(h.api.getSkus()),['keep']);
}
assert.equal(restored.api.removeOutOfStockSkus(['not-present']).deletedCount,0);
const afterDeleteWb=new ExcelJS.Workbook(),afterDeleteWs=afterDeleteWb.addWorksheet('発注');
assert.equal(restored.api.applyOutOfStockFill(afterDeleteWs.addRow(['data']),'2688717725'),false,'new XLSX output no longer highlights deleted SKU');
console.log('direct SKU deletion: exact match, multiple separators, deduplication, missing IDs, leading zeros and persistent deletion passed');
