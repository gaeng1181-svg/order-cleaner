const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const ExcelJS=require('../vendor/exceljs.min.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[],loaded=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>loaded.push(r.url()));
    const existing=['2688717725','26887177250',...Array.from({length:74},(_,i)=>String(9900000000+i))];
    await page.addInitScript(seed=>{if(localStorage.getItem('orderCleaner.outOfStockSkus.v1')===null)localStorage.setItem('orderCleaner.outOfStockSkus.v1',JSON.stringify(seed));if(localStorage.getItem('test-marker')===null)localStorage.setItem('test-marker','keep');},existing);
    await page.goto('http://localhost:8765');
    assert.equal(await page.getByRole('button',{name:'CS 답변',exact:true}).count(),0);
    for(const name of ['주문서 정리','쿠팡 발주 정리','쉽먼트·송장','쿠팡 쉽먼트 송장관리','PDF 정리','주소 관리']){await page.getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('.tabpanel:visible').count(),1);}
    await page.getByRole('button',{name:'쿠팡 발주 정리',exact:true}).click();await page.locator('.oos-manager summary').click();
    assert.match(await page.locator('#oosCount').textContent(),/76개/);
    const csv='발주번호,SKU ID,SKU 이름,SKU Barcode,물류센터,확정수량,매입가\n11,2688717725,테스트 상품,ABC,센터A,1,1000\n10,26887177250,다른 상품,DEF,센터A,1,1000';
    await page.locator('#poInput').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    let download=page.waitForEvent('download');await page.locator('#poRun').click();await download;
    assert.equal(await page.locator('#poResultTable tr.is-out-of-stock').count(),2);
    await page.locator('#oosDeleteInput').fill(' 2688717725\n2688717725, 9999999999 ');await page.locator('#oosDelete').click();
    assert.match(await page.locator('#oosMessage').textContent(),/삭제 1개 · 목록에 없음 1개 · 현재 품절 SKU 75개/);
    assert.equal(await page.locator('#poResultTable tr.is-out-of-stock').count(),1,'highlight updates without reupload');
    assert.match(await page.locator('#poResultTable tr.is-out-of-stock').textContent(),/26887177250/);
    download=page.waitForEvent('download');await page.locator('#poRun').click();const result=await download;const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await result.path());
    const rows=[];wb.worksheets[0].eachRow(r=>{if(['2688717725','26887177250'].includes(String(r.getCell(3).value)))rows.push(r);});assert.equal(rows.length,2);assert.ok(!rows[0].getCell(1).fill?.fgColor);assert.equal(rows[1].getCell(1).fill.fgColor.argb,'FFFFF2CC');
    await page.reload();await page.getByRole('button',{name:'쿠팡 발주 정리',exact:true}).click();await page.locator('.oos-manager summary').click();
    assert.match(await page.locator('#oosCount').textContent(),/75개/);assert.equal(await page.evaluate(()=>localStorage.getItem('test-marker')),'keep');
    assert.ok(!(await page.evaluate(()=>JSON.parse(localStorage.getItem('orderCleaner.outOfStockSkus.v1')))).includes('2688717725'));
    await page.locator('#oosSkuInput').fill('00123,00124');await page.locator('#oosAdd').click();await page.locator('#oosDeleteInput').fill('00123\n00124');await page.locator('#oosDelete').click();assert.match(await page.locator('#oosMessage').textContent(),/삭제 2개/);
    await page.locator('#oosDeleteInput').fill('');await page.locator('#oosDelete').click();assert.match(await page.locator('#oosMessage').textContent(),/입력해주세요/);
    // Existing Excel import stays available and parses only SKU ID.
    const imports=new ExcelJS.Workbook(),sheet=imports.addWorksheet('synthetic');sheet.getCell('D4').value='SKU ID';sheet.getCell('D5').value='00077';sheet.getCell('D7').value='00078';
    await page.locator('#oosExcelInput').setInputFiles({name:'synthetic-skus.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await imports.xlsx.writeBuffer())});
    await page.waitForFunction(()=>document.getElementById('oosMessage').textContent.includes('등록 완료'));
    await page.getByRole('button',{name:'00077 삭제',exact:true}).click();assert.ok(!(await page.evaluate(()=>JSON.parse(localStorage.getItem('orderCleaner.outOfStockSkus.v1')))).includes('00077'));
    page.once('dialog',d=>d.dismiss());await page.locator('#oosClearAll').click();assert.match(await page.locator('#oosCount').textContent(),/76개/);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(!loaded.some(url=>/cs-ui|cs-core|cs-config|api.openai.com|workers.dev/.test(url)));
    assert.deepEqual(errors,[]);
    console.log('Browser passed: six tabs, CS removal, 76 saved SKUs preserved, direct exact/multiple/missing deletion, immediate highlight, persisted deletion, updated XLSX fill, add/Excel/X/confirmation and mobile layout.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
