import { PDFDocument, degrees } from './vendor/pdf-lib.min.mjs';

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
const CELL_WIDTH = A4_WIDTH / 2;
const CELL_HEIGHT = A4_HEIGHT / 2;

function pageId(fileIndex, pageNumber) {
  return `${fileIndex + 1}:${pageNumber}`;
}

function cellPosition(slot) {
  return {
    x: slot % 2 === 0 ? 0 : CELL_WIDTH,
    y: slot < 2 ? CELL_HEIGHT : 0
  };
}

function normalizedRotation(angle) {
  return ((Number(angle) % 360) + 360) % 360;
}

function drawOptions(embeddedPage, sourcePage, slot) {
  const cell = cellPosition(slot);
  const rotation = normalizedRotation(sourcePage.getRotation().angle);
  const quarterTurn = rotation === 90 || rotation === 270;
  const displayWidth = quarterTurn ? embeddedPage.height : embeddedPage.width;
  const displayHeight = quarterTurn ? embeddedPage.width : embeddedPage.height;
  const scale = Math.min(CELL_WIDTH / displayWidth, CELL_HEIGHT / displayHeight);
  const width = embeddedPage.width * scale;
  const height = embeddedPage.height * scale;
  const placedWidth = displayWidth * scale;
  const placedHeight = displayHeight * scale;
  const left = cell.x + (CELL_WIDTH - placedWidth) / 2;
  const bottom = cell.y + (CELL_HEIGHT - placedHeight) / 2;

  if (rotation === 90) return { x: left + placedWidth, y: bottom, width, height, rotate: degrees(90) };
  if (rotation === 180) return { x: left + placedWidth, y: bottom + placedHeight, width, height, rotate: degrees(180) };
  if (rotation === 270) return { x: left, y: bottom + placedHeight, width, height, rotate: degrees(270) };
  return { x: left, y: bottom, width, height };
}

export function verifyPlacements(expectedIds, placementIds) {
  const expected = new Set(expectedIds);
  const seen = new Set();
  const duplicates = [];
  const unexpected = [];
  placementIds.forEach(id => {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
    if (!expected.has(id)) unexpected.push(id);
  });
  const missing = expectedIds.filter(id => !seen.has(id));
  if (missing.length || duplicates.length || unexpected.length || expectedIds.length !== placementIds.length) {
    throw new Error(`PDF 페이지 검증 실패 · 누락 ${missing.length} / 중복 ${duplicates.length} / 예상 외 ${unexpected.length}`);
  }
  return { missing: 0, duplicates: 0, unexpected: 0 };
}

export async function createFourUpPdf(inputFiles, progress = () => {}) {
  if (!Array.isArray(inputFiles) || !inputFiles.length) throw new Error('합칠 PDF 파일을 선택해 주세요.');
  const output = await PDFDocument.create();
  const expectedIds = [];
  const placements = [];
  const files = [];
  let outputPage = null;
  let totalInputPages = 0;

  for (let fileIndex = 0; fileIndex < inputFiles.length; fileIndex++) {
    const input = inputFiles[fileIndex];
    const name = String(input.name || `PDF ${fileIndex + 1}`);
    const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    let source;
    try {
      source = await PDFDocument.load(bytes.slice());
    } catch (error) {
      throw new Error(`${name}: ${/password|encrypt/i.test(error.message) ? '암호화된 PDF는 처리할 수 없습니다.' : 'PDF를 읽지 못했습니다.'}`);
    }
    const pageCount = source.getPageCount();
    if (!pageCount) throw new Error(`${name}: PDF 페이지가 없습니다.`);
    files.push({ fileIndex, name, pageCount });
    totalInputPages += pageCount;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageNumber = pageIndex + 1;
      const id = pageId(fileIndex, pageNumber);
      expectedIds.push(id);
      const slot = placements.length % 4;
      if (slot === 0) outputPage = output.addPage([A4_WIDTH, A4_HEIGHT]);
      const sourcePage = source.getPage(pageIndex);
      const crop = sourcePage.getCropBox();
      const embeddedPage = await output.embedPage(sourcePage, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height
      });
      outputPage.drawPage(embeddedPage, drawOptions(embeddedPage, sourcePage, slot));
      placements.push({ id, fileIndex, fileName: name, pageNumber, sheetNumber: Math.floor((placements.length) / 4) + 1, slot });
      progress({ fileIndex, fileName: name, pageNumber, filePages: pageCount, placedPages: placements.length, totalInputPages });
    }
  }

  const verification = verifyPlacements(expectedIds, placements.map(item => item.id));
  const bytes = await output.save();
  const reopened = await PDFDocument.load(bytes.slice());
  const outputSheets = Math.ceil(totalInputPages / 4);
  if (reopened.getPageCount() !== outputSheets) throw new Error('출력 A4 페이지 수 검증에 실패했습니다.');
  if (placements.length !== totalInputPages) throw new Error('입력 페이지 수와 배치 페이지 수가 일치하지 않습니다.');

  return {
    bytes,
    files,
    totalInputPages,
    placedPages: placements.length,
    outputSheets,
    placements,
    verification
  };
}
