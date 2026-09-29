(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let generation = 0;
  let resultUrl = null;
  let resultName = '';
  let printFrame = null;
  let core;
  const resetResult = () => {
    $('pdfDownload').disabled = true;
    $('pdfPrint').disabled = true;
    if (printFrame) printFrame.remove();
    printFrame = null;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  };
  const preparePrintFrame = () => {
    if (!resultUrl) return;
    const url = resultUrl;
    const frame = document.createElement('iframe');
    frame.className = 'pdf-print-frame';
    frame.title = '정리된 PDF 인쇄 준비';
    frame.addEventListener('load', () => {
      if (frame === printFrame && resultUrl === url) $('pdfPrint').disabled = false;
    }, { once: true });
    frame.src = url;
    document.body.appendChild(frame);
    printFrame = frame;
  };
  const showPrintFailure = () => {
    $('pdfStatus').textContent = '바로 인쇄를 열지 못했습니다. PDF 다운로드를 이용해 주세요.';
    $('pdfError').textContent = '브라우저가 인쇄창을 차단했습니다. PDF 다운로드 기능은 계속 사용할 수 있습니다.';
    $('pdfError').hidden = false;
  };
  async function choosePdf(file) {
    if (!file) return;
    const current = ++generation;
    resetResult();
    $('pdfName').textContent = file.name;
    $('pdfError').hidden = true;
    $('pdfPages').textContent = '';
    ['pdfTotal', 'pdfIncluded', 'pdfExcluded'].forEach(id => $(id).textContent = '—');
    try {
      if (!/\.pdf$/i.test(file.name)) throw new Error('PDF 파일만 선택할 수 있습니다.');
      $('pdfStatus').textContent = 'PDF 분석 준비 중…';
      core ||= import('./pdf-core.mjs').catch(error => { core = null; throw error; });
      const { cleanPdf } = await core;
      const result = await cleanPdf(new Uint8Array(await file.arrayBuffer()), (page, total) => {
        if (current === generation) {
          $('pdfTotal').textContent = total;
          $('pdfStatus').textContent = `PDF 분석 중 · ${page} / ${total}페이지`;
        }
      });
      if (current !== generation) return;
      $('pdfTotal').textContent = result.totalPages;
      $('pdfIncluded').textContent = result.included.length;
      $('pdfExcluded').textContent = result.vendorPages;
      $('pdfPages').textContent = `출력 페이지: ${result.included.map(index => index + 1).join(', ')}` +
        (result.unknownPages ? ` · 첫 제출용 표시 이전 ${result.unknownPages}페이지 제외` : '');
      resultUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
      resultName = file.name.replace(/\.pdf$/i, '') + '_제출용.pdf';
      $('pdfDownload').disabled = false;
      preparePrintFrame();
      $('pdfStatus').textContent = '완료 · PDF를 다운로드하거나 바로 인쇄하세요.';
    } catch (error) {
      if (current !== generation) return;
      resetResult();
      $('pdfStatus').textContent = '오류 · PDF를 생성하지 않았습니다.';
      $('pdfError').textContent = /password|encrypt/i.test(error.message)
        ? '암호화된 PDF는 처리할 수 없습니다. 암호가 없는 PDF를 선택해 주세요.'
        : (error.message || 'PDF를 읽지 못했습니다. 파일을 확인해 주세요.');
      $('pdfError').hidden = false;
    }
  }
  $('pdfSelect').addEventListener('click', () => $('pdfInput').click());
  $('pdfInput').addEventListener('change', () => {
    choosePdf($('pdfInput').files[0]);
    $('pdfInput').value = '';
  });
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
    $('pdfDropZone').addEventListener(name, event => {
      event.preventDefault();
      event.stopPropagation();
      $('pdfDropZone').classList.toggle('is-dragging', name === 'dragenter' || name === 'dragover');
      if (name === 'drop') choosePdf(event.dataTransfer.files[0]);
    });
  });
  $('pdfDownload').addEventListener('click', () => {
    if (!resultUrl) return;
    const anchor = document.createElement('a');
    anchor.href = resultUrl;
    anchor.download = resultName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });
  $('pdfPrint').addEventListener('click', () => {
    if (!resultUrl) return;
    $('pdfError').hidden = true;
    try {
      const target = printFrame && printFrame.contentWindow;
      if (!target || typeof target.print !== 'function') throw new Error('인쇄 프레임을 열 수 없습니다.');
      target.focus();
      target.print();
      $('pdfStatus').textContent = '인쇄창을 열었습니다. 인쇄를 취소해도 PDF 결과는 유지됩니다.';
    } catch (_) {
      showPrintFailure();
    }
  });
  window.addEventListener('pagehide', resetResult);
})();
