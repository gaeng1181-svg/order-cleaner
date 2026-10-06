import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, StandardFonts, rgb } from '../vendor/pdf-lib.min.mjs';
import { A4_HEIGHT, A4_WIDTH, createFourUpPdf } from '../pdf-four-up-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = path.join(root, 'tmp', 'pdfs');
await mkdir(tempDir, { recursive: true });

async function createFixture(name, pageCount) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    const marker = `${name}-P${pageNumber}`;
    page.drawRectangle({ x: 16, y: 16, width: A4_WIDTH - 32, height: A4_HEIGHT - 32, borderColor: rgb(0.1, 0.35, 0.25), borderWidth: 4 });
    page.drawText(marker, { x: 72, y: A4_HEIGHT / 2, size: 42, font, color: rgb(0.08, 0.12, 0.1) });
    page.drawText(`fixture ${name} / original page ${pageNumber}`, { x: 72, y: A4_HEIGHT / 2 - 54, size: 18, font });
  }
  const filePath = path.join(tempDir, `${name}.pdf`);
  await writeFile(filePath, await document.save());
  return { name: `${name}.pdf`, path: filePath, pageCount };
}

const fixtures = {
  F1: await createFixture('F1', 1),
  F3: await createFixture('F3', 3),
  F5: await createFixture('F5', 5)
};

async function runCase(caseName, fixtureNames, expectedInputPages, expectedSheets) {
  const inputs = await Promise.all(fixtureNames.map(async key => ({
    name: fixtures[key].name,
    bytes: new Uint8Array(await readFile(fixtures[key].path))
  })));
  const result = await createFourUpPdf(inputs);
  assert.equal(result.totalInputPages, expectedInputPages);
  assert.equal(result.placedPages, expectedInputPages);
  assert.equal(result.outputSheets, expectedSheets);
  assert.deepEqual(result.verification, { missing: 0, duplicates: 0, unexpected: 0 });

  const expectedIds = [];
  const expectedMarkers = [];
  fixtureNames.forEach((key, fileIndex) => {
    for (let pageNumber = 1; pageNumber <= fixtures[key].pageCount; pageNumber++) {
      expectedIds.push(`${fileIndex + 1}:${pageNumber}`);
      expectedMarkers.push(`${key}-P${pageNumber}`);
    }
  });
  assert.deepEqual(result.placements.map(item => item.id), expectedIds);

  const outputPath = path.join(tempDir, `${caseName}.pdf`);
  await writeFile(outputPath, result.bytes);
  const reopened = await PDFDocument.load(result.bytes.slice());
  reopened.getPages().forEach((page, pageIndex) => {
    const contents = page.node.Contents();
    assert.ok(contents instanceof PDFArray, `A4 ${pageIndex + 1}의 콘텐츠 스트림을 확인할 수 있어야 합니다.`);
    const guideRef = contents.get(contents.size() - 1);
    const guideStream = reopened.context.lookup(guideRef);
    assert.ok(guideStream instanceof PDFRawStream, `A4 ${pageIndex + 1}에 재단선 스트림이 있어야 합니다.`);
    const guideOperators = new TextDecoder().decode(decodePDFRawStream(guideStream).decode());
    assert.match(guideOperators, /297\.64 0 m\s+297\.64 841\.89 l/, `A4 ${pageIndex + 1}에 중앙 세로 재단선이 있어야 합니다.`);
    assert.match(guideOperators, /0 420\.945 m\s+595\.28 420\.945 l/, `A4 ${pageIndex + 1}에 중앙 가로 재단선이 있어야 합니다.`);
  });
  const info = execFileSync('pdfinfo', [outputPath], { encoding: 'utf8' });
  assert.match(info, new RegExp(`Pages:\\s+${expectedSheets}\\b`));
  assert.match(info, /Page size:\s+595\.28 x 841\.89 pts \(A4\)/);
  const text = execFileSync('pdftotext', [outputPath, '-'], { encoding: 'utf8' });
  let previousMarkerOffset = -1;
  expectedMarkers.forEach(marker => {
    assert.equal(text.split(marker).length - 1, 1, `${marker}가 출력 PDF에 정확히 한 번 있어야 합니다.`);
    const markerOffset = text.indexOf(marker);
    assert.ok(markerOffset > previousMarkerOffset, `${marker}가 파일·페이지 순서대로 배치되어야 합니다.`);
    previousMarkerOffset = markerOffset;
  });
  const images = execFileSync('pdfimages', ['-list', outputPath], { encoding: 'utf8' });
  assert.doesNotMatch(images, /^\s*\d+\s+\d+\s+\w+/m, '벡터 fixture가 페이지 전체 이미지로 래스터화되면 안 됩니다.');
  return { caseName, inputPages: expectedInputPages, outputSheets: expectedSheets, missing: 0, duplicates: 0, outputPath };
}

const results = [];
results.push(await runCase('one-page', ['F1'], 1, 1));
results.push(await runCase('three-pages', ['F3'], 3, 1));
results.push(await runCase('five-pages', ['F5'], 5, 2));
results.push(await runCase('one-plus-three', ['F1', 'F3'], 4, 1));
results.push(await runCase('one-plus-three-plus-five', ['F1', 'F3', 'F5'], 9, 3));
console.log(JSON.stringify(results, null, 2));
