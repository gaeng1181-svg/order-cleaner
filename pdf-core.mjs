import * as pdfjs from './vendor/pdf.min.mjs';
import { PDFDocument } from './vendor/pdf-lib.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

// Unknown pages are excluded until a Submission heading is actually observed.
export function selectPages(pageTexts) {
  let state = 'unknown';
  let submissions = 0;
  let vendorPages = 0;
  let unknownPages = 0;
  const included = [];
  pageTexts.forEach((text, index) => {
    const normalized = text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const submission = normalized.includes('coupangsubmissioncopy');
    const vendor = normalized.includes('vendorstoragecopy');
    if (submission && vendor) {
      throw new Error(`${index + 1}페이지에 제출용·보관용 표시가 모두 있어 자동 분리할 수 없습니다.`);
    }
    if (submission) { state = 'include'; submissions++; }
    else if (vendor) state = 'exclude';
    if (state === 'include') included.push(index);
    else if (state === 'exclude') vendorPages++;
    else unknownPages++;
  });
  if (!submissions) throw new Error('쿠팡 제출용 페이지를 찾지 못했습니다.');
  return { included, vendorPages, unknownPages, totalPages: pageTexts.length };
}

export async function cleanPdf(bytes, progress = () => {}) {
  // Keep separate buffers: PDF.js may transfer its buffer to its worker.
  const source = await PDFDocument.load(bytes.slice());
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false,
    useSystemFonts: true, disableFontFace: true, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages !== source.getPageCount()) throw new Error('PDF 페이지 수를 확인할 수 없습니다.');
    const texts = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map(item => item.str || '').join(' '));
      page.cleanup();
      progress(pageNumber, document.numPages);
    }
    const selection = selectPages(texts);
    const output = await PDFDocument.create();
    // Copy PDF page objects and resources; never rasterize or redraw pages.
    const pages = await output.copyPages(source, selection.included);
    pages.forEach(page => output.addPage(page));
    return { ...selection, bytes: await output.save() };
  } finally {
    await task.destroy();
  }
}
