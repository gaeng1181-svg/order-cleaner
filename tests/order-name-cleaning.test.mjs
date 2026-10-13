import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
function createElement() {
  const element = {
    addEventListener() {},
    appendChild() {},
    click() {},
    remove() {},
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    style: {},
    files: [],
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false
  };
  return element;
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
vm.runInNewContext(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), context, { filename: 'app.js' });

const {
  buildAlias,
  cleanAlias,
  finalizeAlias,
  normalizeGender,
  removeDuplicateOrderQuantityTokens,
  isNumericOnlyAliasValue,
  resolveFinalAliasValue
} = context.__ORDER_CLEANER_TEST__;

const quantityCases = [
  ['50개:1세트/0원/2개', 2, '50개:1세트'],
  ['1개:1세트/1개', 1, '1개:1세트'],
  ['2개:1세트/2개', 2, '2개:1세트'],
  ['3개:1세트/3개', 3, '3개:1세트'],
  ['블랙/2개', 2, '블랙'],
  ['블랙/2개', 3, '블랙/2개'],
  ['블랙/1개', 1, '블랙'],
  ['2P/2개', 2, '2P'],
  ['2개입/2개', 2, '2개입'],
  ['2종세트/2개', 2, '2종세트'],
  ['100매/2개', 2, '100매'],
  ['1+1/2개', 2, '1+1']
];

for (const [input, quantity, expected] of quantityCases) {
  assert.equal(removeDuplicateOrderQuantityTokens(input, quantity), expected, `${input} + Q=${quantity}`);
}

const genderCases = [
  ['남성용 블랙 XL', '남 블랙 XL'],
  ['남자 블랙 XL', '남 블랙 XL'],
  ['남성 블랙 XL', '남 블랙 XL'],
  ['여성용 블랙 M', '여 블랙 M'],
  ['여자 블랙 M', '여 블랙 M'],
  ['여성 블랙 M', '여 블랙 M']
];

for (const [input, expected] of genderCases) {
  assert.equal(normalizeGender(input), expected, input);
  assert.equal(buildAlias('', '', input, 1), expected, `buildAlias: ${input}`);
}

const productName = '땡처리 일회용 종이접시 원형 20cm 50개 캠핑 피크닉 행사 접시 종이용기 테이크아웃 포장용기 트레이';
assert.equal(
  buildAlias(productName, '50개:1세트/0원/2개', '일회용접시 원형 20cm/50개:1세트/0원/2개', 2),
  '일회용접시 원형 20cm 50개 1세트'
);

// 기존 규칙 회귀: N → M → L 우선순위, 가격 제거, 카테고리 prefix와 1+1 결과를 유지합니다.
assert.equal(buildAlias('일반 상품', '블랙/2개', '', 2), '블랙');
assert.equal(buildAlias('일반 상품', '블랙/2개', '기존 별칭', 2), '기존 별칭');
assert.equal(cleanAlias('01. 블랙/12,000원', 1), '블랙');
assert.equal(buildAlias('버팔로 구명조끼 1+1', '', '정품(1+1) 레드XL+레드XL', 2), '4_정품(1+1) 레드XL+레드XL');
assert.equal(buildAlias('래쉬가드', '', '블랙 XL', 1), '2_블랙 XL');
assert.equal(buildAlias('국내산 농산물', '', '감자 3kg', 1), '5_감자 3kg');

// numeric-only N은 무효 후보이며 M/L fallback 뒤에도 동일한 최종 정리를 적용합니다.
assert.equal(isNumericOnlyAliasValue('273'), true);
assert.equal(isNumericOnlyAliasValue('00027'), true);
for (const valid of ['1_블랙라벨 M', '2P', '1+1', '30cmx8개', '2200mm 2P', 'L-XL', '2XL']) {
  assert.equal(isNumericOnlyAliasValue(valid), false, `${valid} must remain meaningful`);
}
assert.equal(
  buildAlias('BUCK703 접이식 캠핑화로대', '색상:접이식 캠핑화로대 420x420', '273', 1, '1011030666918'),
  '접이식 캠핑화로대 420x420'
);
assert.equal(resolveFinalAliasValue('273', '색상:옵션D', '상품D'), '옵션D');
assert.equal(resolveFinalAliasValue('', '', '상품C'), '상품C');

// 모든 N 생성 경로에 적용되는 공통 cleanup입니다.
assert.equal(finalizeAlias('색상:사이즈:그레이(남성용):2XL'), '그레이(남) 2XL');
assert.equal(finalizeAlias('1_접이식 +(1+1)   블랙XL+그레이L'), '1_접이식(1+1) 블랙XL+그레이L');
for (const value of ['블랙XL+그레이L', '레드L+블랙XL', '1+1', '2+1']) {
  assert.equal(finalizeAlias(value), value, `${value} plus must be preserved`);
}

const tiesoProduct = '[BUCK703]땡가격 SALE 국내생산 티에소 사각드로즈 팬티(남녀) 여성사각팬티 남자사각팬티 드로즈팬티';
assert.equal(
  buildAlias(tiesoProduct, '색상:사이즈:그레이(남성용):2XL', '273', 2, '1011030533709'),
  '티에소 사각드로즈 그레이(남) 2XL'
);
assert.equal(
  buildAlias(tiesoProduct, '색상:사이즈:블랙(남성용):2XL', '273', 3, '1011030533709'),
  '티에소 사각드로즈 블랙(남) 2XL'
);
assert.notEqual(
  buildAlias('다른 사각드로즈 상품', '색상:사이즈:블랙(남성용):2XL', '273', 1, '999'),
  '티에소 사각드로즈 블랙(남) 2XL'
);

// 상품번호 exact match 예외: 다른 상품에는 동일한 기본명을 붙이지 않습니다.
assert.equal(
  buildAlias('BUCK703 땀복상의', '색상:블랙/사이즈:XL', '', 1, '3545935886'),
  '2_땀복상의'
);
assert.equal(
  buildAlias('BUCK703 국내생산 남녀공용 땀복 상의', '', '', 1, '3545935886'),
  '2_땀복상의'
);
assert.equal(
  buildAlias('벅703 체크무늬 식탁보 2~4인용', '블루 140 x 100 cm 140cm', '', 1, '7802128959'),
  '체크무늬 식탁보 블루 140 x 100 cm 140cm'
);
assert.equal(
  buildAlias('벅703 체크무늬 식탁보 2~4인용', '레드 140 x 100 cm 140cm', '', 1, '7802128959'),
  '체크무늬 식탁보 레드 140 x 100 cm 140cm'
);
assert.doesNotMatch(
  buildAlias('일반 상품', '블루 140 x 100 cm 140cm', '', 1, '9999999999'),
  /체크무늬 식탁보/
);
assert.notEqual(
  buildAlias('BUCK703 국내생산 남녀공용 땀복 상의', '', '', 1, '9999999999'),
  '2_땀복상의'
);

// 상품번호 exact match 분류가 혼재된 키워드보다 우선합니다.
assert.equal(
  buildAlias(
    'BUCK703 국내산 남여 비치팬츠 비치웨어 반바지 비치반바지 수영복바지 여성 남성 래쉬가드 구명조끼',
    '주노(남성용) 팜블루 L',
    '1_주노(남) 팜블루 L',
    1,
    '21325340'
  ),
  '2_주노(남) 팜블루 L'
);
assert.equal(buildAlias('프리미엄 블랙라벨 구명조끼', '', '블랙라벨 L', 1, '999'), '1_블랙라벨 L');

// 포천은 농장/산지 직송 문맥과 결합할 때만 농수산물 신호로 사용합니다.
assert.match(buildAlias('햇수세미 국내산 생수세미 포천 농장직송 10kg', '', '생수세미 10kg', 1, '999'), /^5_/);
assert.match(buildAlias('국산 맷돌애호박 포천 산지직송', '', '맷돌애호박 3kg', 1, '999'), /^5_/);
assert.doesNotMatch(buildAlias('일반 의류 국내산', '', '블랙 XL', 1, '999'), /^5_/);
assert.doesNotMatch(buildAlias('포천 여행 기념 티셔츠', '', '블랙 XL', 1, '999'), /^5_/);
assert.match(buildAlias('BUCK703 국내산 남여 비치팬츠', '', '비치팬츠', 1, '21325340'), /^2_/);

// 가격 제거 뒤 내용 없이 남은 괄호/플러스만 제거하고 구성 기호는 보존합니다.
assert.equal(cleanAlias('선택:형광스트링 6파이 8m 2P-3개 (+3000원)', 1), '형광스트링 6파이 8m 2P-3개');
assert.equal(buildAlias('', '선택:형광스트링 6파이 8m 2P-3개 (+3000원)', '', 1), '형광스트링 6파이 8m 2P-3개');
assert.equal(finalizeAlias('형광스트링 6파이 8m 2P-3개 (+)'), '형광스트링 6파이 8m 2P-3개');
for (const value of ['블랙XL+그레이L', '(1+1)', '30cmx8개 + 가죽팩가방']) {
  assert.equal(finalizeAlias(value), value, `${value} symbols must be preserved`);
}

console.log('order name cleaning: requested cases and regressions passed');
