(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let generation = 0;
  let resultUrl = null;
  let resultName = '';
  let printFrame = null;
  let core;
  let fourGeneration = 0;
  let fourResultUrl = null;
  let fourResultName = '';
  let fourPrintFrame = null;
  let fourCore;
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
    // Chrome's built-in PDF viewer may not dispatch the iframe load event.
    // The Blob URL is already attached, so allow the user gesture to invoke print immediately.
    $('pdfPrint').disabled = false;
  };
  const showPrintFailure = () => {
    $('pdfStatus').textContent = '바로 인쇄를 열지 못했습니다. PDF 다운로드를 이용해 주세요.';
    $('pdfError').textContent = '브라우저가 인쇄창을 차단했습니다. PDF 다운로드 기능은 계속 사용할 수 있습니다.';
    $('pdfError').hidden = false;
  };
  const resetFourResult = () => {
    $('pdfFourDownload').disabled = true;
    $('pdfFourPrint').disabled = true;
    if (fourPrintFrame) fourPrintFrame.remove();
    fourPrintFrame = null;
    if (fourResultUrl) URL.revokeObjectURL(fourResultUrl);
    fourResultUrl = null;
  };
  const prepareFourPrintFrame = () => {
    if (!fourResultUrl) return;
    const url = fourResultUrl;
    const frame = document.createElement('iframe');
    frame.className = 'pdf-print-frame';
    frame.title = '쉽먼트 4분할 PDF 인쇄 준비';
    frame.addEventListener('load', () => {
      if (frame === fourPrintFrame && fourResultUrl === url) $('pdfFourPrint').disabled = false;
    }, { once: true });
    frame.src = url;
    document.body.appendChild(frame);
    fourPrintFrame = frame;
    $('pdfFourPrint').disabled = false;
  };
  const showFourPrintFailure = () => {
    $('pdfFourStatus').textContent = '바로 인쇄를 열지 못했습니다. 합본 PDF 다운로드를 이용해 주세요.';
    $('pdfFourError').textContent = '브라우저가 인쇄창을 차단했습니다. PDF 다운로드 기능은 계속 사용할 수 있습니다.';
    $('pdfFourError').hidden = false;
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
  async function chooseFourPdfs(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const current = ++fourGeneration;
    resetFourResult();
    $('pdfFourError').hidden = true;
    $('pdfFourVerification').textContent = '';
    ['pdfFourInputPages', 'pdfFourSheets', 'pdfFourPlaced'].forEach(id => $(id).textContent = '—');
    $('pdfFourFiles').textContent = files.length;
    $('pdfFourName').textContent = `${files.length}개 PDF 선택됨`;
    $('pdfFourList').textContent = files.map((file, index) => `${index + 1}. ${file.name}`).join('\n');
    try {
      const invalid = files.find(file => !/\.pdf$/i.test(file.name));
      if (invalid) throw new Error(`${invalid.name}: PDF 파일만 선택할 수 있습니다.`);
      $('pdfFourStatus').textContent = 'PDF 합본 준비 중…';
      fourCore ||= import('./pdf-four-up-core.mjs?v=cut-guides-1').catch(error => { fourCore = null; throw error; });
      const { createFourUpPdf } = await fourCore;
      const inputs = await Promise.all(files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      const result = await createFourUpPdf(inputs, progress => {
        if (current === fourGeneration) $('pdfFourStatus').textContent = `PDF 배치 중 · ${progress.placedPages}페이지`;
      });
      if (current !== fourGeneration) return;
      $('pdfFourInputPages').textContent = result.totalInputPages;
      $('pdfFourSheets').textContent = result.outputSheets;
      $('pdfFourPlaced').textContent = result.placedPages;
      $('pdfFourVerification').textContent = `자동 검증 통과 · 입력 ${result.totalInputPages} = 배치 ${result.placedPages} · 누락 ${result.verification.missing} / 중복 ${result.verification.duplicates}`;
      fourResultUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
      fourResultName = '쉽먼트_PDF_4분할.pdf';
      $('pdfFourDownload').disabled = false;
      prepareFourPrintFrame();
      $('pdfFourStatus').textContent = `완료 · A4 ${result.outputSheets}장에 원본 ${result.placedPages}페이지와 중앙 재단선을 배치했습니다.`;
    } catch (error) {
      if (current !== fourGeneration) return;
      resetFourResult();
      $('pdfFourStatus').textContent = '오류 · 4분할 PDF를 생성하지 않았습니다.';
      $('pdfFourError').textContent = error.message || 'PDF를 읽지 못했습니다. 파일을 확인해 주세요.';
      $('pdfFourError').hidden = false;
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
  $('pdfFourSelect').addEventListener('click', () => $('pdfFourInput').click());
  $('pdfFourInput').addEventListener('change', () => {
    chooseFourPdfs($('pdfFourInput').files);
    $('pdfFourInput').value = '';
  });
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
    $('pdfFourDropZone').addEventListener(name, event => {
      event.preventDefault();
      event.stopPropagation();
      $('pdfFourDropZone').classList.toggle('is-dragging', name === 'dragenter' || name === 'dragover');
      if (name === 'drop') chooseFourPdfs(event.dataTransfer.files);
    });
  });
  $('pdfFourDownload').addEventListener('click', () => {
    if (!fourResultUrl) return;
    const anchor = document.createElement('a');
    anchor.href = fourResultUrl;
    anchor.download = fourResultName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });
  $('pdfFourPrint').addEventListener('click', () => {
    if (!fourResultUrl) return;
    $('pdfFourError').hidden = true;
    try {
      const target = fourPrintFrame && fourPrintFrame.contentWindow;
      if (!target || typeof target.print !== 'function') throw new Error('인쇄 프레임을 열 수 없습니다.');
      target.focus();
      target.print();
      $('pdfFourStatus').textContent = '인쇄창을 열었습니다. 인쇄를 취소해도 합본 PDF 결과는 유지됩니다.';
    } catch (_) {
      showFourPrintFailure();
    }
  });
  window.addEventListener('pagehide', () => { resetResult(); resetFourResult(); });
})();
