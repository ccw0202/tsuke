const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../src/Schema.js');
const parser = require('../src/Parser.js');

const TODAY = '2026-10-14';

function fixturePayments(extra) {
  const rows = schema.EXAMPLE_PAYMENTS.map((row) => row.slice());
  (extra || []).forEach((row) => rows.push(row));
  return parser.paymentsFromRows(rows);
}

function fixtureCategories() {
  return parser.categoriesFromRows(schema.DEFAULT_CATEGORIES);
}

function parse(line, extra) {
  return parser.parseEntry(line, Object.assign({
    today: TODAY,
    defaultCurrency: 'TWD',
    payments: fixturePayments(),
    categories: fixtureCategories(),
    logMarkers: ['日誌']
  }, extra || {}));
}

test('parses a bare amount with a name', () => {
  const result = parse('早餐 80');
  assert.equal(result.ok, true);
  assert.equal(result.type, 'expense');
  assert.equal(result.name, '早餐');
  assert.equal(result.amount, 80);
  assert.equal(result.currency, 'TWD');
  assert.equal(result.explicitPaymentCode, '');
  assert.equal(result.category, '吃');
  assert.equal(result.categorySource, 'keyword');
  assert.equal(result.date, TODAY);
  assert.equal(result.time, '');
});

test('reads a configured payment word from the line', () => {
  const result = parse('中餐 50 現金');
  assert.equal(result.explicitPaymentCode, '現金');
  assert.equal(result.explicitSynthetic, false);
  assert.equal(result.amount, 50);
  assert.equal(result.category, '吃');
});

test('reads currency and an example payment code', () => {
  const result = parse('ChatGPT 20 USD cube');
  assert.equal(result.name, 'ChatGPT');
  assert.equal(result.amount, 20);
  assert.equal(result.currency, 'USD');
  assert.equal(result.explicitPaymentCode, 'cube');
  assert.equal(result.category, 'AI工具');
});

test('payment codes are case-insensitive', () => {
  const result = parse('Claude 20 USD Cube');
  assert.equal(result.explicitPaymentCode, 'cube');
  assert.equal(result.currency, 'USD');
  assert.equal(result.category, 'AI工具');
});

test('bank-prefixed transfers use the transfer method without joining the chip list', () => {
  const result = parse('書 350 甲銀行轉帳');
  assert.equal(result.name, '書');
  assert.equal(result.amount, 350);
  assert.equal(result.explicitPaymentCode, '甲銀行轉帳');
  assert.equal(result.explicitSynthetic, true);
  assert.equal(result.category, '書');
  assert.equal(result.categorySource, 'keyword');
});

test('a category word that is the whole name stays the name', () => {
  const result = parse('書 350');
  assert.equal(result.name, '書');
  assert.equal(result.category, '書');
});

test('an explicit category token is removed only when a name remains', () => {
  const result = parse('吃 牛肉麵 180');
  assert.equal(result.category, '吃');
  assert.equal(result.categorySource, 'explicit');
  assert.equal(result.name, '牛肉麵');
  assert.equal(result.amount, 180);
});

test('amount is the last number so model numbers stay in the name', () => {
  const result = parse('iPhone 15 32000');
  assert.equal(result.amount, 32000);
  assert.equal(result.name, 'iPhone 15');
  assert.equal(result.category, '日常');
});

test('only an amount is required', () => {
  const result = parse('80');
  assert.equal(result.name, '（未命名）');
  assert.equal(result.amount, 80);
  assert.equal(result.category, '日常');
  assert.equal(result.categorySource, 'fallback');
});

test('thousands separators and notes', () => {
  const result = parse('房租 1,200 // 範例備註');
  assert.equal(result.amount, 1200);
  assert.equal(result.name, '房租');
  assert.equal(result.note, '範例備註');
});

test('fullwidth digits', () => {
  const result = parse('早餐　８０');
  assert.equal(result.amount, 80);
  assert.equal(result.name, '早餐');
});

test('keyword boundaries do not match inside latin words', () => {
  const result = parse('email 20');
  assert.equal(result.category, '日常');
});

test('longer keywords win', () => {
  const result = parse('電子書 300');
  assert.equal(result.category, '書');
});

test('relative and month-day dates', () => {
  assert.equal(parse('昨天 早餐 90').date, '2026-10-13');
  assert.equal(parse('前天 咖啡 70').date, '2026-10-12');
  assert.equal(parse('2/15 早餐 80').date, '2026-02-15');
  assert.equal(parse('12/31 禮物 10').date, '2025-12-31');
  assert.equal(parse('2026-02-15 午餐 20').date, '2026-02-15');
});

test('invalid calendar dates stay out of the date field', () => {
  const result = parse('2/31 早餐 80');
  assert.equal(result.date, TODAY);
  assert.equal(result.name, '2/31 早餐');
});

test('hash tags are explicit and not part of the name', () => {
  const result = parse('#範例旅行 午餐 200');
  assert.equal(result.tag, '範例旅行');
  assert.equal(result.name, '午餐');
  assert.equal(result.category, '吃');
});

test('daily log marker', () => {
  const log = parse('日誌 去公園散步');
  assert.equal(log.ok, true);
  assert.equal(log.type, 'log');
  assert.equal(log.text, '去公園散步');
  assert.equal(log.date, TODAY);
  const dated = parse('日誌：2/15 假的一天');
  assert.equal(dated.type, 'log');
  assert.equal(dated.date, '2026-02-15');
  assert.equal(dated.text, '假的一天');
});

test('log marker without a separator is not a log', () => {
  const result = parse('日誌早餐 80');
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 80);
});

test('rejects empty input, missing amounts, zero, and oversized fractions', () => {
  assert.equal(parse('').ok, false);
  assert.equal(parse('   ').message, '請輸入內容');
  assert.equal(parse('早餐').message, '請輸入金額');
  assert.equal(parse('現金').message, '請輸入金額');
  assert.equal(parse('早餐 0').message, '金額不合理');
  assert.equal(parse('早餐 1.1234567').message, '小數位數過多');
  assert.equal(parse('日誌').message, '請輸入日誌內容');
  assert.equal(parse('x'.repeat(501)).message, '輸入過長');
});

test('glued currency and a Taiwan dollar sign', () => {
  assert.equal(parse('咖啡 20USD').currency, 'USD');
  assert.equal(parse('咖啡 20USD').amount, 20);
  assert.equal(parse('$80 早餐').currency, 'TWD');
  assert.equal(parse('$80 早餐').amount, 80);
  assert.equal(parse('咖啡 €15').currency, 'EUR');
});

test('merchant keys ignore latin case and extra space', () => {
  assert.equal(parser.normalizeMerchantKey('  ChatGPT '), 'chatgpt');
  assert.equal(parser.normalizeMerchantKey('早餐'), '早餐');
});

test('Taipei civil dates', () => {
  assert.equal(parser.todayIsoInTimeZone(new Date('2026-10-13T16:30:00Z'), 'Asia/Taipei'), '2026-10-14');
  assert.equal(parser.todayIsoInTimeZone(new Date('2026-10-13T15:30:00Z'), 'Asia/Taipei'), '2026-10-13');
  assert.equal(parser.safeTimeZone('Not a zone'), 'Asia/Taipei');
  assert.match(parser.formatTaipeiTimestamp(new Date('2026-10-13T16:30:00Z')), /^2026-10-14 \d{2}:\d{2}:\d{2}$/);
});

test('sheet serials convert to civil dates', () => {
  const serial = Date.UTC(2026, 9, 14) / 86400000 + 25569;
  assert.equal(parser.sheetsSerialToIso(serial), '2026-10-14');
  assert.equal(parser.sheetsSerialToIso(25569), '1970-01-01');
});

test('a clock time is kept and removed from the name', () => {
  const morning = parse('早餐 8:30 80');
  assert.equal(morning.time, '08:30');
  assert.equal(morning.name, '早餐');
  assert.equal(morning.amount, 80);
  assert.equal(morning.date, TODAY);
  const evening = parse('昨天 晚餐 20:15 200');
  assert.equal(evening.time, '20:15');
  assert.equal(evening.name, '晚餐');
  assert.equal(evening.date, '2026-10-13');
  assert.equal(parse('早餐 80 8：05').time, '08:05');
  assert.equal(parse('早餐 25:00 80').time, '');
  assert.equal(parse('早餐 25:00 80').name, '早餐 25:00');
});

test('settings ignore formula-like calendar names and unknown currencies', () => {
  const settings = parser.settingsFromRows([
    ['預設幣別', 'usd'],
    ['預設付款代碼', 'ef'],
    ['日誌標記', '日誌'],
    ['日誌日曆', '=IMPORTRANGE("https://evil.example","A1")'],
    ['時區', 'Asia/Taipei']
  ]);
  assert.equal(settings.currency, 'USD');
  assert.equal(settings.payment, 'ef');
  assert.equal(settings.calendarName, 'Tsuke 日誌');
  assert.equal(settings.timeZone, 'Asia/Taipei');
  assert.equal(settings.spendEvents, true);
  assert.equal(parser.settingsFromRows([['花費日曆', 'FALSE']]).spendEvents, false);
  assert.equal(parser.settingsFromRows([['花費日曆', '關閉']]).spendEvents, false);
  assert.equal(parser.settingsFromRows([['花費日曆', '=TRUE()']]).spendEvents, true);
});

test('starter card rows are labeled as examples', () => {
  assert.match(schema.EXAMPLE_PAYMENTS[0][1], /範例/);
  assert.match(schema.EXAMPLE_PAYMENTS[1][1], /範例/);
  assert.equal(schema.EXAMPLE_PAYMENTS[0][0], 'cube');
  assert.equal(schema.EXAMPLE_PAYMENTS[1][0], 'ef');
  assert.equal(JSON.stringify(schema.EXAMPLE_PAYMENTS).includes('9425'), false);
});
