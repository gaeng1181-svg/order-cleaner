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

const { buildAlias, cleanAlias, normalizeGender, removeDuplicateOrderQuantityTokens } = context.__ORDER_CLEANER_TEST__;

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

console.log(`order name cleaning: ${quantityCases.length + genderCases.length + 6} cases passed`);
