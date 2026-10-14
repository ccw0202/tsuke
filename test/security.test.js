const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const security = require('../src/Security.js');
const schema = require('../src/Schema.js');

test('formula triggers are stored as text', () => {
  assert.equal(security.guardSheetText('=1+1'), "'=1+1");
  assert.equal(security.guardSheetText('+1'), "'+1");
  assert.equal(security.guardSheetText('-1'), "'-1");
  assert.equal(security.guardSheetText('@cmd'), "'@cmd");
  assert.equal(security.guardSheetText('＝cmd'), "'＝cmd");
  assert.equal(security.guardSheetText('  =HYPERLINK("https://evil.example")'), "'  =HYPERLINK(\"https://evil.example\")");
  assert.equal(security.guardSheetText('早餐'), '早餐');
  assert.equal(security.guardSheetText('ChatGPT'), 'ChatGPT');
});

test('html escaping covers the characters used in markup', () => {
  assert.equal(security.escapeHtml(`<img alt="x" src='y'>&`), '&lt;img alt=&quot;x&quot; src=&#39;y&#39;&gt;&amp;');
});

test('the TWD formula only references the amount and currency cells', () => {
  const formula = security.buildEstimatedTwdFormula(8);
  assert.match(formula, /^=IF\(C8="","",IF\(UPPER\(D8\)="TWD",C8,/);
  assert.match(formula, /GOOGLEFINANCE\("CURRENCY:"&UPPER\(D8\)&"TWD"\)/);
  assert.equal(formula.includes('http'), false);
  assert.equal(formula.includes('IMPORTRANGE'), false);
  assert.throws(() => security.buildEstimatedTwdFormula('8);=IMPORTRANGE("https://evil.example","A1")'));
  assert.throws(() => security.buildEstimatedTwdFormula(1));
});

test('entry rows cannot smuggle formulas into text columns', () => {
  const row = security.buildEntryRow({
    row: 4,
    date: '2026-10-14',
    name: '=HYPERLINK("https://evil.example","早餐")',
    amount: 80,
    currency: 'TWD',
    category: '吃',
    paymentCode: 'cube',
    paymentName: '範例信用卡 Cube',
    accountCode: '',
    cardCode: 'cube',
    tag: '@範例',
    note: '+note',
    merchantKey: '早餐',
    createdAt: '2026-10-14 09:00:00'
  });
  assert.equal(row.length, schema.ENTRY_HEADERS.length);
  assert.equal(row[schema.ENTRY_COL.NAME - 1].startsWith("'="), true);
  assert.equal(row[schema.ENTRY_COL.TAG - 1].startsWith("'@"), true);
  assert.equal(row[schema.ENTRY_COL.NOTE - 1].startsWith("'+"), true);
  assert.equal(row[schema.ENTRY_COL.AMOUNT - 1], 80);
  assert.equal(row[schema.ENTRY_COL.CURRENCY - 1], 'TWD');
  assert.match(row[schema.ENTRY_COL.TWD - 1], /GOOGLEFINANCE/);
  assert.equal(row[schema.ENTRY_COL.TWD - 1].includes('HYPERLINK'), false);
  assert.throws(() => security.buildEntryRow({
    row: 4,
    date: '2026-10-14',
    name: '早餐',
    amount: 80,
    currency: 'NOT',
    category: '吃',
    paymentCode: 'cube',
    paymentName: '現金',
    accountCode: '',
    cardCode: '',
    tag: '',
    note: '',
    merchantKey: '早餐',
    createdAt: '2026-10-14 09:00:00'
  }));
});

test('summary formulas are built from column letters, not user text', () => {
  const monthly = security.monthlySheetFormulas();
  const tags = security.tagTotalFormulas();
  const blob = JSON.stringify(monthly) + JSON.stringify(tags);
  assert.equal(blob.includes('http'), false);
  assert.equal(blob.includes('IMPORTRANGE'), false);
  assert.equal(blob.includes('IMPORTDATA'), false);
  assert.match(monthly.months, /帳目!A2:A/);
  assert.match(monthly.total, /帳目!E2:E/);
  assert.equal(monthly.categories.length, schema.CATEGORY_NAMES.length);
  assert.match(tags.total, /帳目!K2:K/);
  monthly.categories.forEach((formula, index) => {
    assert.equal(formula.includes(schema.CATEGORY_NAMES[index]), true);
  });
});

test('ids and web app urls have a closed shape', () => {
  assert.equal(security.isSpreadsheetIdShape_('a'.repeat(20)), true);
  assert.equal(security.isSpreadsheetIdShape_('https://evil.example'), false);
  assert.equal(security.isSpreadsheetIdShape_(''), false);
  assert.equal(security.isScriptWebAppUrl_('https://script.google.com/macros/s/abcDEF_123/exec'), true);
  assert.equal(security.isScriptWebAppUrl_('https://evil.example/exec'), false);
  assert.equal(security.isCalendarIdShape_('abc123@group.calendar.google.com'), true);
});

test('the web app does not interpolate user text into HTML', () => {
  const html = fs.readFileSync('src/Index.html', 'utf8');
  assert.equal(html.includes('innerHTML'), false);
  assert.equal(html.includes('<?'), false);
  assert.equal(html.includes('9425'), false);
  assert.equal(html.includes('document.write'), false);
});

test('future sheets keep payment and account link columns', () => {
  assert.equal(schema.FUTURE_SHEETS.cards.headers.includes('卡片代碼'), true);
  assert.equal(schema.FUTURE_SHEETS.accounts.headers.includes('帳戶代碼'), true);
  assert.equal(schema.ENTRY_HEADERS.includes('付款代碼'), true);
  assert.equal(schema.ENTRY_HEADERS.includes('帳戶代碼'), true);
  assert.equal(schema.ENTRY_HEADERS.includes('卡片代碼'), true);
});
