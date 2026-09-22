/* global ExcelJS */
// 파일을 앱 밖에 놓았을 때 브라우저가 파일을 열거나 다운로드하는 기본 동작을 막습니다.
["dragenter", "dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  }, false);
});
(() => {
  "use strict";

  const fileInput = document.getElementById("fileInput");
  const selectButton = document.getElementById("selectButton");
  const runButton = document.getElementById("runButton");
  const dropZone = document.getElementById("dropZone");
  const fileName = document.getElementById("fileName");
  const fileDetail = document.getElementById("fileDetail");
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const errorBox = document.getElementById("errorBox");
  let selectedFile = null;

  const LIFE_KEYWORDS = ["구명조끼", "구명 조끼", "라이프자켓", "라이프 자켓", "라이프재킷", "라이프 재킷", "부력조끼", "부력 조끼"];
  const CLOTHING_KEYWORDS = [
    "래쉬가드", "수영복", "티셔츠", "티 셔츠", "반팔", "긴팔", "민소매", "셔츠", "남방", "블라우스",
    "바지", "팬츠", "레깅스", "스커트", "치마", "원피스", "후드", "맨투맨", "점퍼", "자켓", "재킷",
    "코트", "패딩", "트레이닝복", "트레이닝 복", "상하복", "상하세트", "상하 세트", "조거", "카디건", "가디건",
    "드로즈", "브라", "슬리브리스", "땀복", "상의", "하의", "비치반바지", "비치 반바지", "의류"
  ];
  const AGRICULTURE_KEYWORDS = [
    "호박", "애호박", "단호박", "손질호박", "여주", "생여주", "하늘마", "고구마", "감자", "양파", "마늘",
    "배추", "무우", "당근", "고추", "대파", "쪽파", "부추", "오이", "가지", "토마토", "방울토마토",
    "상추", "깻잎", "시금치", "브로콜리", "양배추", "버섯", "옥수수", "강낭콩", "완두콩", "검은콩", "서리태", "현미", "보리",
    "사과", "신고배", "복숭아", "포도", "단감", "홍시", "곶감", "귤", "감귤", "참외", "수박", "딸기", "자두", "매실", "대추",
    "수세미"
  ];
  const AGRICULTURE_EXCLUSIONS = [
    "수세미 거치", "주방 수세미", "주방용 수세미", "청소 수세미", "설거지 수세미",
    "재배망", "재배 망", "지지대", "화분", "모종삽", "삽", "감자칼", "필러", "씨앗", "종자", "비료", "농약"
  ];
  const SIZE_ORDER = new Map([["FREE", 0], ["XS", 1], ["S", 2], ["M", 3], ["L", 4], ["XL", 5]]);

  function setError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setStatus(state, message) {
    status.dataset.state = state;
    statusText.textContent = message;
  }

  function allowScreenUpdate() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)));
  }

  function chooseFile(file) {
    setError("");
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      selectedFile = null;
      runButton.disabled = true;
      setError(".xlsx 형식의 엑셀 파일만 선택할 수 있습니다.");
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileDetail.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · 준비 완료`;
    setStatus("ready", "주문서 정리를 실행할 수 있습니다.");
    runButton.disabled = false;
  }

  selectButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  }));
  dropZone.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));

  function cellText(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
      if (value.text != null) return String(value.text);
      if (value.result != null) return String(value.result);
    }
    return String(value);
  }

  function cleanAlias(value) {
    return cellText(value)
      // 옵션 입력용 라벨은 실제 별칭으로 가공하는 행에서만 제거합니다.
      .replace(/^\s*선택\s*[:：]\s*/i, "")
      .replace(/^\s*색상\s*[:：]\s*사이즈\s*[:：]\s*/i, "")
      .replace(/^\s*(?:색상|사이즈)\s*[:：]\s*/i, "")
      // 01., 02_, 04-, 5. 같은 맨 앞 관리번호를 제거합니다.
      .replace(/^\s*\d{1,2}\s*[._-]\s*/, "")
      .replace(/\(\s*공용\s*\)/gi, " ")
      .replace(/래쉬\s*가드/gi, " ")
      .replace(/\d[\d,]*\s*원/g, " ")
      .replace(/제품|상품/g, " ")
      .replace(/[\/:]/g, " ")
      .replace(/\s+\d+\s*개\s*$/g, " ")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function shouldPreserveOriginalAlias(aliasValue) {
    const original = cellText(aliasValue).trim();
    if (!original) return false;

    // 예: "색상:사이즈:모던블랙:110"처럼 상품명 없이 옵션 라벨과
    // 옵션값만 들어 있는 N은 상품명을 추측하지 않고 원문 그대로 둡니다.
    const startsWithOptionLabels = /^\s*색상\s*[:：]\s*사이즈\s*[:：]/i.test(original);
    if (!startsWithOptionLabels) return false;

    const aliasSearch = normalizedSearchText(original);
    const hasKnownProductSignal =
      hasKeyword(aliasSearch, LIFE_KEYWORDS) ||
      hasKeyword(aliasSearch, CLOTHING_KEYWORDS) ||
      isAgricultureProduct("", "", original);

    return !hasKnownProductSignal;
  }

  function finalizeAlias(value) {
    return cellText(value)
      .replace(/\(\s*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedSearchText(...values) {
    return values.map(cellText).join(" ").replace(/\s+/g, " ").toLowerCase();
  }

  function hasKeyword(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  function hasStandaloneKoreanKeyword(text, keyword) {
    const source = cellText(text).toLowerCase();
    const target = cellText(keyword).toLowerCase();
    let start = source.indexOf(target);
    while (start >= 0) {
      const before = start > 0 ? source[start - 1] : "";
      const afterIndex = start + target.length;
      const after = afterIndex < source.length ? source[afterIndex] : "";
      const beforeIsKorean = /[가-힣]/.test(before);
      const afterIsKorean = /[가-힣]/.test(after);
      if (!beforeIsKorean && !afterIsKorean) return true;
      start = source.indexOf(target, start + 1);
    }
    return false;
  }

  function isOptionOnlyText(value) {
    const original = cellText(value).trim();
    if (!original) return false;
    // 색상/사이즈 같은 옵션 라벨로 시작하는 값은 상품명이 확인되지 않는 한 별칭으로 만들지 않습니다.
    return /^\s*(?:색상\s*[:：]\s*사이즈|사이즈\s*[:：]\s*색상|색상|사이즈)\s*[:：]/i.test(original);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripPrefix(alias) {
    return alias.replace(/^[1245]_\s*/, "").trim();
  }

  function parseSize(text) {
    const match = text.toUpperCase().match(/(?:^|\s|[-,(])((?:[2-9]|1\d)XL|XL|XS|S|M|L|FREE)(?=$|\s|[-,)])/);
    if (!match) return null;
    const label = match[1];
    const numeric = label.match(/^(\d+)XL$/);
    return { label, rank: numeric ? 5 + Number(numeric[1]) - 1 : (SIZE_ORDER.get(label) ?? -1), index: match.index + match[0].indexOf(label) };
  }

  function extractChoice(optionText, number) {
    const pattern = new RegExp(`선택\\s*${number}\\s*[:：]\\s*([\\s\\S]*?)(?=\\s*(?:/|선택\\s*[12]\\s*[:：]|$))`, "i");
    const match = optionText.match(pattern);
    if (!match) return null;
    const raw = match[1].replace(/\([^)]*원[^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const size = parseSize(` ${raw} `);
    if (!raw || !size) return null;
    const before = raw.slice(0, Math.max(0, size.index - 1)).replace(/[-,]+$/g, "").trim();
    if (!before) return null;
    return { color: before, size: size.label, rank: size.rank };
  }

  function parseChoice(rawValue) {
    const raw = cellText(rawValue).replace(/^\s*(?:선택\s*[12]\s*[:：])?\s*/i, "").replace(/\([^)]*원[^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const size = parseSize(` ${raw} `);
    if (!raw || !size) return null;
    const color = raw.slice(0, Math.max(0, size.index - 1)).replace(/[-,]+$/g, "").trim();
    return color ? { color, size: size.label, rank: size.rank } : null;
  }

  function extractChoicePair(optionText, aliasText) {
    const labeled = [extractChoice(optionText, 1), extractChoice(optionText, 2)];
    if (labeled[0] && labeled[1]) return labeled;
    for (const source of [optionText, aliasText]) {
      const parts = cellText(source).split("/").map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 2) continue;
      const pair = parts.map(parseChoice);
      if (pair[0] && pair[1]) return pair;
    }
    return null;
  }

  function productNameFromProductColumn(productName) {
    const beforeLifeJacket = cellText(productName).split(/구명\s*조끼|라이프\s*(?:자켓|재킷)|부력\s*조끼/i)[0];
    const cleaned = cleanAlias(beforeLifeJacket).replace(/1\s*\+\s*1/gi, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const ignored = /^(?:BUFFALO|버팔로|BUCK703|SALE|세일)$/i;
    const candidates = cleaned.split(" ").filter((word) => word && !ignored.test(word));
    return candidates.length ? candidates[candidates.length - 1] : "";
  }

  function onePlusOneAlias(productName, optionText, currentAlias) {
    if (!/1\s*\+\s*1/.test(`${productName} ${optionText} ${currentAlias}`)) return null;
    const preserved = stripPrefix(cleanAlias(currentAlias));
    const markerIndex = preserved.search(/\(\s*1\s*\+\s*1\s*\)/i);
    if (markerIndex >= 0) {
      const existingName = finalizeAlias(preserved.slice(0, markerIndex)).replace(/^\++|\++$/g, "").trim();
      if (existingName) return preserved;
    }
    const pair = extractChoicePair(optionText, currentAlias);
    if (!pair) return null;
    const choices = pair.sort((a, b) => b.rank - a.rank);
    const productMatch = optionText.match(/제품\s*선택\s*[:：]\s*([\s\S]*?)(?=\s*(?:\/|선택\s*1\s*[:：]|$))/i);
    const compactChoices = choices.map((item) => `${escapeRegExp(item.color)}\\s*${escapeRegExp(item.size)}`).join("|");
    const choicePattern = new RegExp(compactChoices, "gi");
    const source = productMatch ? productMatch[1] : stripPrefix(currentAlias).replace(choicePattern, " ");
    let base = cleanAlias(source)
      .replace(/1\s*\+\s*1/gi, " ")
      .replace(/구명\s*조끼/gi, " ")
      .replace(/라이프\s*(?:자켓|재킷)/gi, " ")
      .replace(/부력\s*조끼/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) base = productNameFromProductColumn(productName);
    if (!base) return null;
    return `${base}(1+1) ${choices.map((item) => `${item.color}${item.size}`).join("+")}`;
  }

  function firstAliasSource(productValue, optionValue, aliasValue) {
    const alias = cellText(aliasValue).trim();
    if (alias) return alias;
    const option = cellText(optionValue).trim();
    if (option) return option;
    return cellText(productValue).trim();
  }

  function isAgricultureProduct(productValue, optionValue, aliasValue) {
    const productText = cellText(productValue).trim();
    const search = normalizedSearchText(productValue, optionValue, aliasValue);
    if (hasKeyword(search, AGRICULTURE_EXCLUSIONS)) return false;

    // L 상품명 어디에든 '농산물'이 명시되어 있으면 농산물로 확정합니다.
    // 문장 중간에 있어도 동일하게 처리합니다. (예: 국내산 농산물, 신선농산물, 제철농산물)
    if (productText.includes("농산물")) return true;

    // 그 외에는 실제 품목 키워드만 독립 단어/경계 기준으로 판별하여
    // '핵센귤러' 안의 '귤' 같은 부분문자열 오탐을 방지합니다.
    return AGRICULTURE_KEYWORDS.some((keyword) => hasStandaloneKoreanKeyword(search, keyword));
  }

  function moveDefectTagToEnd(value) {
    const text = cellText(value);
    if (!/(?:^|[\s_])이염(?:$|[\s_])/.test(` ${text} `)) return text;
    const withoutTag = text.replace(/(?:^|[\s_])이염(?=$|[\s_])/g, " ").replace(/\s+/g, " ").trim();
    return `${withoutTag.replace(/_이염$/g, "")}_이염`;
  }

  function buildAlias(productValue, optionValue, aliasValue, quantityValue) {
    const originalAlias = cellText(aliasValue);

    // N에 이미 값이 있어도 상품명 없는 옵션 전용 문자열이면 손대지 않습니다.
    // L열을 보고 임의의 내부 별칭을 추측하거나 1_/2_/4_/5_를 붙이지 않습니다.
    if (shouldPreserveOriginalAlias(originalAlias)) return originalAlias;

    const sourceAlias = firstAliasSource(productValue, optionValue, aliasValue);

    // N이 비어 M을 fallback으로 쓰는 경우에도 M이 "색상:사이즈:..." 같은 옵션 전용 값이면
    // 상품명을 추측해 새 별칭을 만들지 않습니다. N이 원래 있으면 원문 유지, 없으면 공란 유지합니다.
    if (isOptionOnlyText(sourceAlias)) {
      return originalAlias.trim() ? originalAlias : "";
    }

    const cleaned = cleanAlias(sourceAlias);
    const search = normalizedSearchText(productValue, optionValue, aliasValue);
    const isLife = hasKeyword(search, LIFE_KEYWORDS);
    const isClothing = !isLife && hasKeyword(search, CLOTHING_KEYWORDS);
    const isAgriculture = !isLife && !isClothing && isAgricultureProduct(productValue, optionValue, aliasValue);

    let bare = stripPrefix(cleaned);
    const onePlusOneSource = originalAlias.trim() ? originalAlias : sourceAlias;
    const special = isLife ? onePlusOneAlias(cellText(productValue), cellText(optionValue), onePlusOneSource) : null;
    let body = special || bare;
    if (!body) return "";

    if (isClothing) body = moveDefectTagToEnd(body);

    let prefix = "";
    if (isLife) {
      const quantity = Number(quantityValue);
      prefix = Number.isFinite(quantity) && quantity >= 2 ? "4_" : "1_";
    } else if (isClothing) {
      prefix = "2_";
    } else if (isAgriculture) {
      prefix = "5_";
    }
    return finalizeAlias(`${prefix}${body}`);
  }

  function clonePlain(value) {
    if (value == null || typeof value !== "object") return value;
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function copyCellStyle(source, target) {
    if (source.hasStyle) target.style = source.style;
    if (source.note) target.note = source.note;
  }

  function copyWorkbookSheet(sourceSheet, targetSheet) {
    targetSheet.properties = clonePlain(sourceSheet.properties || {});
    targetSheet.pageSetup = clonePlain(sourceSheet.pageSetup || {});
    targetSheet.headerFooter = clonePlain(sourceSheet.headerFooter || {});
    targetSheet.views = clonePlain(sourceSheet.views || []);
    targetSheet.state = sourceSheet.state;

    for (let columnNumber = 1; columnNumber <= sourceSheet.columnCount; columnNumber += 1) {
      const sourceColumn = sourceSheet.getColumn(columnNumber);
      const targetColumn = targetSheet.getColumn(columnNumber);
      targetColumn.width = sourceColumn.width;
      targetColumn.hidden = sourceColumn.hidden;
      targetColumn.outlineLevel = sourceColumn.outlineLevel;
      targetColumn.style = sourceColumn.style || {};
    }

    const sourceRows = sourceSheet.getRows(1, sourceSheet.rowCount) || [];
    const rowValues = sourceRows.map((sourceRow, index) => {
      const values = sourceRow.values.slice();
      if (index > 0) {
        values[14] = buildAlias(values[12], values[13], values[14], values[17]);
      }
      return values;
    });
    targetSheet.addRows(rowValues);
    // 후속 매크로 호환: N1은 공백 문자조차 없는 실제 빈 셀이어야 합니다.
    targetSheet.getCell("N1").value = null;

    sourceRows.forEach((sourceRow, index) => {
      const sourceRowNumber = index + 1;
      const targetRowNumber = sourceRowNumber;
      const targetRow = targetSheet.getRow(targetRowNumber);
      targetRow.height = sourceRow.height;
      targetRow.hidden = sourceRow.hidden;
      targetRow.outlineLevel = sourceRow.outlineLevel;
      targetRow.style = sourceRow.style || {};
      sourceRow.eachCell({ includeEmpty: false }, (sourceCell, columnNumber) => {
        copyCellStyle(sourceCell, targetSheet.getCell(targetRowNumber, columnNumber));
      });
    });

    for (const range of sourceSheet.model.merges || []) {
      try { targetSheet.mergeCells(range); } catch (_) { /* 겹치는 병합은 원본 구조를 우선합니다. */ }
    }

    const lastRow = Math.max(1, targetSheet.rowCount);
    const lastColumnLetter = targetSheet.getColumn(Math.max(1, sourceSheet.columnCount)).letter;
    targetSheet.autoFilter = { from: "A1", to: `${lastColumnLetter}${lastRow}` };
    ["B", "D", "E", "F"].forEach((column) => {
      if (lastRow < 2) return;
      targetSheet.addConditionalFormatting({
        ref: `${column}2:${column}${lastRow}`,
        rules: [{
          type: "expression",
          formulae: [`AND(${column}2<>\"\",COUNTIF(${column}:${column},${column}2)>1)`],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" }, fgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" } } }
        }]
      });
    });
  }

  function safeDownloadName(name) {
    return `${name.replace(/\.xlsx$/i, "")}_정리.xlsx`;
  }

  async function run() {
    if (!selectedFile || runButton.disabled) return;
    setError("");
    runButton.disabled = true;
    selectButton.disabled = true;
    setStatus("processing", "처리 중 · 엑셀 파일을 읽고 있습니다…");

    try {
      await allowScreenUpdate();
      if (typeof ExcelJS === "undefined") throw new Error("엑셀 처리 구성요소를 불러오지 못했습니다. 프로그램 폴더 안의 파일을 함께 보관해 주세요.");
      const workbook = new ExcelJS.Workbook();
      workbook.calcProperties.fullCalcOnLoad = true;
      await workbook.xlsx.load(await selectedFile.arrayBuffer());
      if (!workbook.worksheets.length) throw new Error("처리할 시트가 없습니다.");
      if (workbook.getWorksheet("작업")) throw new Error("이미 ‘작업’ 시트가 있습니다. 데이터 보호를 위해 덮어쓰지 않았습니다. 기존 시트 이름을 바꾼 뒤 다시 실행해 주세요.");

      const sourceSheet = workbook.worksheets[0];
      if (sourceSheet.columnCount < 17) throw new Error("필요한 L·M·N·Q열을 찾을 수 없습니다. 주문서 출력양식 파일인지 확인해 주세요.");

      // 원본은 데이터/행 순서를 유지하고, 요청한 예외인 N1 공란 + 필터만 적용합니다.
      sourceSheet.getCell("N1").value = null;
      const sourceLastRow = Math.max(1, sourceSheet.rowCount);
      const sourceLastColumnLetter = sourceSheet.getColumn(Math.max(1, sourceSheet.columnCount)).letter;
      sourceSheet.autoFilter = { from: "A1", to: `${sourceLastColumnLetter}${sourceLastRow}` };
      setStatus("processing", "처리 중 · ‘작업’ 시트를 만들고 정리하고 있습니다…");
      await allowScreenUpdate();
      const targetSheet = workbook.addWorksheet("작업");
      copyWorkbookSheet(sourceSheet, targetSheet);
      setStatus("processing", "처리 중 · 결과 엑셀을 저장하고 있습니다…");
      await allowScreenUpdate();
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeDownloadName(selectedFile.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus("complete", `완료 · ${safeDownloadName(selectedFile.name)} 파일을 다운로드했습니다.`);
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "파일 처리 중 문제가 발생했습니다.");
      setStatus("error", "오류 · 처리하지 못했습니다. 아래 안내를 확인해 주세요.");
    } finally {
      runButton.disabled = false;
      selectButton.disabled = false;
    }
  }

  runButton.addEventListener("click", run);
})();

/* v2.0 Coupang workflow */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const download = (blob, name) => { const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000); };
  const text = (v) => v == null ? "" : (typeof v === "object" && v.text != null ? String(v.text) : String(v)).trim();

  function compareNumericText(a,b){
    const left=text(a),right=text(b);
    if(/^\d+$/.test(left)&&/^\d+$/.test(right)){
      const leftNumber=BigInt(left),rightNumber=BigInt(right);
      if(leftNumber<rightNumber)return -1;
      if(leftNumber>rightNumber)return 1;
    }
    return left.localeCompare(right,'ko',{numeric:true});
  }

  function sortCoupangRows(rows){
    const poSets=new Map();
    rows.forEach(x=>{if(!poSets.has(x.center))poSets.set(x.center,new Set());poSets.get(x.center).add(text(x.po));});
    rows.sort((a,b)=>(poSets.get(b.center).size-poSets.get(a.center).size)||a.center.localeCompare(b.center,'ko')||compareNumericText(a.po,b.po)||compareNumericText(a.sku,b.sku)||((a.sourceIndex??0)-(b.sourceIndex??0)));
    return poSets;
  }

  document.querySelectorAll('#tabs .tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs .tab').forEach(x=>x.classList.toggle('is-active',x===btn));
    document.querySelectorAll('.tabpanel').forEach(p=>p.hidden=true);
    $('panel-'+btn.dataset.tab).hidden=false;
    if(btn.dataset.tab==='address') renderAddresses();
  }));

  function cleanCoupangPoName(value){
    let s=text(value);
    // 쿠팡 발주서 출력 전용 정리 규칙. 기존 주문서 정리 로직과 분리한다.
    s=s.replace(/BUFFALO\s+/gi,'');
    s=s.replace(/버팔로\s+/g,'');
    s=s.replace(/블랙벅\s+/g,'');
    s=s.replace(/\s+부력보조복(?=\s|$|[,/])/g,'');
    s=s.replace(/\s+구명조끼(?=\s|$|[,/])/g,'');
    s=s.replace(/2\s*종\s*세트/g,'(1+1)');
    const commaParts=s.split(/\s*,\s*/);
    const optionPart=/^(?:(?:옵션|색상|사이즈)\s*[:：]\s*)?(?:(?:블랙|화이트|레드|네이비|그레이|회색|차콜|베이지|브라운|카키|그린|블루|옐로우|오렌지|핑크|퍼플|민트|아이보리|검정|흰색|빨강|파랑|노랑|초록)\s*)?(?:(?:FREE|XS|S|M|L|(?:[2-9]|1\d)XL|\d{2,3})(?:\s*(?:FREE|XS|S|M|L|(?:[2-9]|1\d)XL|\d{2,3}))*)?$/i;
    const firstOption=commaParts.findIndex(part=>optionPart.test(part.trim())&&part.trim());
    if(commaParts.length>1){
      s=commaParts.map((part,index)=>index===0?part:`${firstOption>=0&&index>firstOption?'+':' '}${part}`).join('');
    }
    s=s.replace(/\s*\+\s*/g,'+');
    return s.replace(/\s+/g,' ').trim();
  }

  // ---------- PO CSV ----------
  let poFile=null;
  function setPoFile(file){
    if(!file)return;
    if(!/\.csv$/i.test(file.name)){ $('poStatus').textContent='오류 · CSV 파일만 사용할 수 있습니다.'; return; }
    poFile=file;
    $('poName').textContent=file.name;
    $('poStatus').textContent='준비 완료 · 발주서 생성을 눌러주세요.';
    $('poRun').disabled=false;
  }
  $('poInput').onchange=()=>setPoFile($('poInput').files[0]);
  const poDrop=$('poDropZone');
  ['dragenter','dragover'].forEach(name=>poDrop.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();poDrop.classList.add('is-dragging');}));
  ['dragleave','drop'].forEach(name=>poDrop.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();poDrop.classList.remove('is-dragging');}));
  poDrop.addEventListener('drop',e=>setPoFile(e.dataTransfer.files[0]));
  function parseCSV(src){
    src=src.replace(/^\uFEFF/, '');
    const rows=[];let row=[],field='',q=false;
    for(let i=0;i<src.length;i++){const c=src[i];if(q){if(c==='"'&&src[i+1]==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}else{if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}}
    if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);} return rows;
  }
  $('poRun').onclick=async()=>{
    if(!poFile)return; $('poRun').disabled=true;$('poStatus').textContent='처리 중…';
    try{
      const rows=parseCSV(await poFile.text()); if(rows.length<2)throw new Error('CSV 데이터가 없습니다.');
      const h=rows[0], idx=(n)=>h.indexOf(n); const req=['발주번호','SKU ID','SKU 이름','SKU Barcode','물류센터','확정수량','매입가'];
      for(const n of req) if(idx(n)<0) throw new Error(`필수 열 '${n}'을 찾을 수 없습니다.`);
      const data=[]; rows.slice(1).forEach((r,sourceIndex)=>{const center=text(r[idx('물류센터')]),qty=Number(String(r[idx('확정수량')]).replace(/,/g,''));if(!center||!qty)return;data.push({center,po:Number(r[idx('발주번호')]),sku:text(r[idx('SKU ID')]),name:cleanCoupangPoName(r[idx('SKU 이름')]),qty,price:Number(String(r[idx('매입가')]).replace(/,/g,''))||0,barcode:text(r[idx('SKU Barcode')]),sourceIndex});});
      const poSets=sortCoupangRows(data);
      const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('발주정리'); ws.columns=[{width:14},{width:15},{width:15},{width:62},{width:11},{width:8},{width:13},{width:20}];
      ws.addRow(['물류센터','발주번호','SKU ID','SKU 이름','확정수량','','매입가','SKU Barcode']); ws.getRow(1).font={bold:true,size:16};
      let lastKey=''; for(const x of data){const key=x.center+'|'+x.po;if(key!==lastKey){const rr=ws.addRow(['','','',`${x.center} - ${x.po}`,'','','','']);rr.getCell(4).font={bold:true,color:{argb:'FFFF0000'},size:16};lastKey=key;} ws.addRow([x.center,x.po,x.sku,x.name,x.qty,'',x.price,x.barcode]);}
      // 쿠팡 발주정리 출력물은 전체 셀 16pt. 섹션 제목의 빨강/굵게 속성은 유지한다.
      ws.eachRow({includeEmpty:true}, row=>row.eachCell({includeEmpty:true}, cell=>{cell.font={...cell.font,size:16};}));
      ws.getColumn(2).numFmt='0'; ws.views=[{state:'frozen',ySplit:1}]; ws.autoFilter={from:'A1',to:`H${ws.rowCount}`};
      const buf=await wb.xlsx.writeBuffer();download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),poFile.name.replace(/\.csv$/i,'')+'_발주정리.xlsx');
      $('poStatus').textContent=`완료 · ${data.length}개 SKU / ${poSets.size}개 센터`;
    }catch(e){$('poStatus').textContent='오류 · '+e.message;}finally{$('poRun').disabled=false;}
  };

  // ---------- Address book ----------
  const ADDR_KEY='orderCleaner.coupangAddresses.v2';
  function loadAddresses(){try{const v=JSON.parse(localStorage.getItem(ADDR_KEY)||'null');if(Array.isArray(v))return v;}catch(_){}return (window.DEFAULT_COUPANG_ADDRESSES||[]).map(x=>({...x}));}
  let addresses=loadAddresses(); const saveAddresses=()=>localStorage.setItem(ADDR_KEY,JSON.stringify(addresses));
  function renderAddresses(){const tb=$('addrTable').querySelector('tbody');tb.innerHTML='';addresses.slice().sort((a,b)=>a.center.localeCompare(b.center,'ko')).forEach(a=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(a.center)}</td><td>${esc(a.phone)}</td><td class="wrap">${esc(a.address)}</td><td><button class="mini danger">삭제</button></td>`;tr.querySelector('button').onclick=()=>{if(confirm(`${a.center} 주소를 삭제할까요?`)){addresses=addresses.filter(x=>x.center!==a.center);saveAddresses();renderAddresses();}};tb.appendChild(tr);});}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  $('addrAdd').onclick=()=>{const center=$('addrCenter').value.trim(),phone=$('addrPhone').value.trim(),address=$('addrAddress').value.trim();if(!center||!address)return alert('센터명과 주소를 입력해주세요.');const old=addresses.find(x=>x.center===center);if(old){old.phone=phone;old.address=address;}else addresses.push({center,phone,address});saveAddresses();$('addrCenter').value=$('addrPhone').value=$('addrAddress').value='';renderAddresses();};
  $('addrUpload').onclick=()=>$('addrInput').click();
  $('addrInput').onchange=async()=>{const f=$('addrInput').files[0];if(!f)return;try{const wb=new ExcelJS.Workbook();await wb.xlsx.load(await f.arrayBuffer());const ws=wb.getWorksheet('주소')||wb.worksheets[0];const arr=[];ws.eachRow((r,n)=>{if(n===1)return;const center=text(r.getCell(2).value),phone=text(r.getCell(3).value),address=text(r.getCell(6).value);if(center)arr.push({center,phone,address});});if(!arr.length)throw new Error('주소 데이터를 찾지 못했습니다.');addresses=arr;saveAddresses();renderAddresses();alert(`${arr.length}개 센터 주소를 등록했습니다.`);}catch(e){alert('주소 업로드 오류: '+e.message);}finally{$('addrInput').value='';}};
  $('addrDownload').onclick=async()=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('주소');ws.addRow(['','수령자','수령자전화번호','수령자휴대폰번호','우편번호','주소','배송방법','쇼핑몰']);addresses.slice().sort((a,b)=>a.center.localeCompare(b.center,'ko')).forEach(a=>ws.addRow(['',a.center,a.phone,'','',a.address,'신용','쿠팡로켓']));const buf=await wb.xlsx.writeBuffer();download(new Blob([buf]),'쿠팡로켓주소_백업.xlsx');};
  $('addrReset').onclick=()=>{if(confirm('현재 주소록을 기본 주소 48개로 되돌릴까요?')){addresses=(window.DEFAULT_COUPANG_ADDRESSES||[]).map(x=>({...x}));saveAddresses();renderAddresses();}};

  // ---------- Shipment split ----------
  let shipmentRows=[];
  $('shipSelect').onclick=()=>$('shipInput').click();
  $('shipInput').onchange=async()=>{const f=$('shipInput').files[0];if(!f)return;try{const wb=new ExcelJS.Workbook();await wb.xlsx.load(await f.arrayBuffer());const ws=wb.getWorksheet('발주정리')||wb.worksheets[0];const arr=[];for(let r=2;r<=ws.rowCount;r++){const center=text(ws.getCell(r,1).value),po=text(ws.getCell(r,2).value);if(!center||!po)continue;arr.push({center,po,sku:text(ws.getCell(r,3).value),name:text(ws.getCell(r,4).value),qty:Number(ws.getCell(r,5).value)||0,barcode:text(ws.getCell(r,8).value),sourceIndex:r,splits:[{box:'',qty:''}]});}if(!arr.length)throw new Error('발주 상품행을 찾지 못했습니다.');sortCoupangRows(arr);shipmentRows=arr;renderShipment();$('shipSave').disabled=false;$('addressExport').disabled=false;}catch(e){alert('불러오기 오류: '+e.message);}finally{$('shipInput').value='';}};
  function renderShipment(){const tb=$('shipTable').querySelector('tbody');tb.innerHTML='';let total=0,done=0;shipmentRows.forEach((item,i)=>{item.splits.forEach((sp,j)=>{const tr=document.createElement('tr');if(j===0){tr.innerHTML=`<td>${esc(item.center)}</td><td>${esc(item.po)}</td><td>${esc(item.sku)}</td><td class="wrap">${esc(item.name)}</td><td>${esc(item.barcode)}</td><td>${item.qty}</td>`;}else tr.innerHTML='<td></td><td></td><td></td><td class="wrap">↳ 박스 분할</td><td></td><td></td>';const tdBox=document.createElement('td'),ib=document.createElement('input');ib.type='number';ib.min='1';ib.value=sp.box;ib.oninput=()=>{sp.box=ib.value;updateShipSummary();};tdBox.appendChild(ib);const tdQty=document.createElement('td'),iq=document.createElement('input');iq.type='number';iq.min='0';iq.value=sp.qty;iq.oninput=()=>{sp.qty=iq.value;updateShipSummary();};tdQty.appendChild(iq);const act=document.createElement('td'),btn=document.createElement('button');btn.className='mini';btn.textContent=j===0?'+ 분할':'삭제';btn.onclick=()=>{if(j===0)item.splits.push({box:'',qty:''});else item.splits.splice(j,1);renderShipment();};act.appendChild(btn);tr.append(tdBox,tdQty,act);tb.appendChild(tr);});total++;if(splitSum(item)===item.qty&&item.splits.every(s=>s.box&&Number(s.qty)>0))done++;});$('shipSummary').textContent=`상품 ${total}건 · 수량/박스 입력 완료 ${done}건`;}
  const splitSum=(item)=>item.splits.reduce((s,x)=>s+(Number(x.qty)||0),0);
  function updateShipSummary(){let done=0;shipmentRows.forEach(i=>{if(splitSum(i)===i.qty&&i.splits.every(s=>s.box&&Number(s.qty)>0))done++;});$('shipSummary').innerHTML=`상품 ${shipmentRows.length}건 · 완료 ${done}건`+(done<shipmentRows.length?' <span class="warn">(수량 합계 또는 박스번호 확인 필요)</span>':' <span class="ok">완료</span>');}
  $('shipSave').onclick=async()=>{if(!shipmentRows.length)return;const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('박스작업');ws.addRow(['센터','발주번호','상품번호','SKU 명','바코드','총수량','박스번호','박스수량']);shipmentRows.forEach(i=>i.splits.forEach(s=>ws.addRow([i.center,i.po,i.sku,i.name,i.barcode,i.qty,Number(s.box)||'',Number(s.qty)||''])));const buf=await wb.xlsx.writeBuffer();download(new Blob([buf]),'쿠팡_박스작업.xlsx');};
  $('addressExport').onclick=async()=>{if(!shipmentRows.length)return;const bad=shipmentRows.filter(i=>splitSum(i)!==i.qty||i.splits.some(s=>!s.box||Number(s.qty)<=0));if(bad.length&&!confirm(`${bad.length}개 상품의 박스수량 합계/박스번호가 완성되지 않았습니다. 그래도 생성할까요?`))return;const missing=[...new Set(shipmentRows.map(i=>i.center).filter(c=>!addresses.some(a=>a.center===c)))];if(missing.length)return alert('주소 미등록 센터: '+missing.join(', ')+'\n주소 관리에서 먼저 등록해주세요.');const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('쿠팡주소');ws.addRow(['센터입력','수하인명','번호','수령자휴대폰번호','우편번호','주소','신용','쿠팡로켓','운송장번호','배송기재사항','상품명','옵션','합계금액','총수량']);const out=[];shipmentRows.forEach(i=>i.splits.forEach(s=>{if(!s.box||Number(s.qty)<=0)return;const a=addresses.find(x=>x.center===i.center);out.push({center:i.center,box:Number(s.box),po:i.po,row:[i.center,`${i.center}_${Number(s.box)}`,a.phone,'','',a.address,'신용','쿠팡로켓','','',i.name,'','',Number(s.qty)]});}));out.sort((a,b)=>a.center.localeCompare(b.center,'ko')||a.box-b.box||Number(a.po)-Number(b.po));out.forEach(x=>ws.addRow(x.row));ws.columns=[{width:14},{width:18},{width:16},{width:14},{width:10},{width:52},{width:10},{width:12},{width:18},{width:16},{width:55},{width:12},{width:12},{width:10}];const buf=await wb.xlsx.writeBuffer();download(new Blob([buf]),'쿠팡주소_송장작업.xlsx');};

  // ---------- Tracking ----------
  let trackingRows=[];
  $('trackingSelect').onclick=()=>$('trackingInput').click();
  $('trackingInput').onchange=async()=>{const f=$('trackingInput').files[0];if(!f)return;try{const wb=new ExcelJS.Workbook();await wb.xlsx.load(await f.arrayBuffer());const ws=wb.worksheets[0],map=new Map(),conflicts=new Set();for(let r=2;r<=ws.rowCount;r++){const way=text(ws.getCell(r,7).value),recipient=text(ws.getCell(r,16).value);if(!recipient||!way)continue;if(map.has(recipient)&&map.get(recipient)!==way)conflicts.add(recipient);else map.set(recipient,way);}trackingRows=[...map].map(([recipient,waybill])=>({recipient,waybill,status:conflicts.has(recipient)?'확인 필요':'정상'})).sort((a,b)=>a.recipient.localeCompare(b.recipient,'ko',{numeric:true}));renderTracking();$('trackingDownload').disabled=!trackingRows.length;}catch(e){alert('송장 파일 오류: '+e.message);}finally{$('trackingInput').value='';}};
  function renderTracking(){const tb=$('trackingTable').querySelector('tbody');tb.innerHTML='';trackingRows.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(x.recipient)}</td><td>${esc(x.waybill)}</td><td class="${x.status==='정상'?'ok':'warn'}">${x.status}</td>`;tb.appendChild(tr);});$('trackingSummary').textContent=`중복 제거 후 ${trackingRows.length}개 수하인명`;}
  $('trackingDownload').onclick=async()=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('운송장매칭');ws.addRow(['수하인명','운송장번호','상태']);trackingRows.forEach(x=>ws.addRow([x.recipient,x.waybill,x.status]));const buf=await wb.xlsx.writeBuffer();download(new Blob([buf]),'쿠팡_운송장매칭.xlsx');};
})();
