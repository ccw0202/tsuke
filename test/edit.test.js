const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const schema = require('../src/Schema.js');
const parser = require('../src/Parser.js');
const match = require('../src/Match.js');
const edit = require('../src/EntryEdit.js');

function resources() {
  return {
    payments: parser.paymentsFromRows(schema.EXAMPLE_PAYMENTS),
    categories: parser.categoriesFromRows(schema.DEFAULT_CATEGORIES),
    timeZone: 'Asia/Taipei'
  };
}

function existingRow(extra) {
  return Object.assign({
    rowNumber: 4,
    date: '2026-01-02',
    time: '08:30',
    name: 'ChatGPT',
    amount: 20,
    currency: 'USD',
    twd: 650,
    eventId: 'abcde12345',
    paymentCode: 'cube'
  }, extra || {});
}

test('an edit patches the money cells and leaves the event id on the row', () => {
  const plan = edit.planEntryUpdate_(existingRow(), {
    name: 'ChatGPT',
    amountText: '20',
    currency: 'USD',
    categoryName: 'AI工具',
    paymentCode: 'cube'
  }, resources());
  assert.equal(plan.ok, true);
  const columns = plan.cells.map((cell) => cell.column);
  [schema.ENTRY_COL.DATE, schema.ENTRY_COL.TAG, schema.ENTRY_COL.NOTE, schema.ENTRY_COL.CREATED_AT, schema.ENTRY_COL.TIME, schema.ENTRY_COL.EVENT_ID].forEach((column) => {
    assert.equal(columns.includes(column), false);
  });
  assert.equal(plan.calendar.twd, 650);
  assert.equal(plan.calendar.time, '08:30');
  assert.equal(Object.hasOwn(plan.calendar, 'eventId'), false);
  const twd = plan.cells.find((cell) => cell.column === schema.ENTRY_COL.TWD).value;
  assert.equal(twd.includes('USD'), false);
  assert.match(twd, /^=IF\(/);
});

test('a changed foreign amount drops the stale TWD estimate', () => {
  const plan = edit.planEntryUpdate_(existingRow(), {
    name: 'ChatGPT',
    amountText: '25',
    currency: 'USD',
    categoryName: '書',
    paymentCode: '現金'
  }, resources());
  assert.equal(plan.ok, true);
  assert.equal(plan.calendar.twd, null);
  assert.equal(plan.calendar.amount, 25);
  assert.equal(plan.cells.find((cell) => cell.column === schema.ENTRY_COL.CATEGORY).value, '書');
  assert.equal(plan.cells.find((cell) => cell.column === schema.ENTRY_COL.PAYMENT_CODE).value, '現金');
});

test('TWD edits store the amount as the TWD figure', () => {
  const plan = edit.planEntryUpdate_(existingRow({ currency: 'TWD', amount: 80, twd: 80 }), {
    name: '早餐',
    amountText: '90',
    currency: 'TWD',
    categoryName: '吃',
    paymentCode: 'cube'
  }, resources());
  assert.equal(plan.calendar.twd, 90);
  assert.equal(plan.calendar.currency, 'TWD');
});

test('formula-like names are stored as text and a blank name is unnamed', () => {
  const injected = edit.planEntryUpdate_(existingRow(), {
    name: '=HYPERLINK("https://evil.example")',
    amountText: '20',
    currency: 'USD',
    categoryName: 'AI工具',
    paymentCode: 'cube'
  }, resources());
  assert.equal(injected.cells.find((cell) => cell.column === schema.ENTRY_COL.NAME).value.startsWith("'"), true);
  const blank = edit.planEntryUpdate_(existingRow(), {
    name: '   ',
    amountText: '20',
    currency: 'USD',
    categoryName: '日常',
    paymentCode: 'cube'
  }, resources());
  assert.equal(blank.remember, null);
  assert.equal(blank.cells.find((cell) => cell.column === schema.ENTRY_COL.NAME).value, '（未命名）');
});

test('edit rejects a missing row, a bad amount, and an unknown category', () => {
  const bag = resources();
  assert.equal(edit.planEntryUpdate_({ rowNumber: 1 }, { amountText: '1', currency: 'TWD', categoryName: '吃', paymentCode: 'cube' }, bag).message, '找不到這一筆。');
  assert.equal(edit.planEntryUpdate_(existingRow(), { name: '早餐', amountText: '0', currency: 'TWD', categoryName: '吃', paymentCode: 'cube' }, bag).message, '金額不合理');
  assert.equal(edit.planEntryUpdate_(existingRow(), { name: '早餐', amountText: '10', currency: 'TWD', categoryName: '不存在', paymentCode: 'cube' }, bag).message, '請選擇分類。');
  assert.equal(edit.planEntryUpdate_(existingRow(), { name: '早餐', amountText: '10', currency: 'TWD', categoryName: '吃', paymentCode: 'nope' }, bag).message, '請選擇付款方式。');
});

test('the phone payload keeps the row number and the created time, and drops the event id', () => {
  const fields = match.publicEntryFields_({
    rowNumber: 5,
    date: '2026-01-02',
    name: '早餐',
    amount: 80,
    currency: 'TWD',
    category: '吃',
    paymentName: '現金',
    paymentCode: '現金',
    tag: '',
    twd: 80,
    createdAt: '2026-01-02 09:00:00',
    eventId: 'abcde12345'
  });
  assert.equal(fields.rowNumber, 5);
  assert.equal(fields.paymentCode, '現金');
  assert.equal(fields.createdAt, '2026-01-02 09:00:00');
  assert.equal(Object.hasOwn(fields, 'eventId'), false);
  assert.equal(Object.hasOwn(match.publicEntryFields_({ rowNumber: 1, name: 'x' }), 'rowNumber'), false);
});

test('a created time matches the same row and rejects a moved or deleted one', () => {
  const stamp = '2026-01-02 09:00:00';
  const row = match.entriesFromRows([[
    '2026-01-02', '早餐', 80, 'TWD', 80, '吃', '現金', '現金', '', '', '', '', '早餐', stamp, '', 'eventKeep1', ''
  ]])[0];
  assert.equal(row.createdAt, stamp);
  assert.equal(match.guardStoredEntry_(row, stamp).ok, true);
  assert.equal(match.guardStoredEntry_(row, '2026-01-02 09:00:01').message, '這一筆已經變了，請重新整理後再試。');
  assert.equal(match.guardStoredEntry_(row, '').message, '這一筆已經變了，請重新整理後再試。');
  assert.equal(match.guardStoredEntry_(Object.assign({}, row, { createdAt: '' }), stamp).message, '這一筆已經變了，請重新整理後再試。');
  const deleted = match.entriesFromRows([[
    '2026-01-02', '早餐', 80, 'TWD', 80, '吃', '現金', '現金', '', '', '', '', '早餐', "'" + stamp, '', '', '已刪除'
  ]])[0];
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.createdAt, stamp);
  assert.equal(match.guardStoredEntry_(deleted, stamp).message, '這一筆已經刪除。');
  assert.equal(match.guardStoredEntry_(deleted, '2026-01-01 00:00:00').message, '這一筆已經變了，請重新整理後再試。');
  const serial = 25569.5;
  assert.equal(match.createdAtFromCell_(serial), '1970-01-01 12:00:00');
  assert.equal(match.guardStoredEntry_({ createdAt: serial, deleted: false }, '1970-01-01 12:00:00').ok, true);
});

test('edit and delete stay off the calendar when spend events are off', () => {
  const ledger = fs.readFileSync('src/Ledger.js', 'utf8');
  assert.match(ledger, /if \(ctx\.settings\.spendEvents\) \{/);
  assert.match(ledger, /if \(ctx\.settings\.spendEvents && existing\.eventId\)/);
  assert.match(ledger, /confirmed !== true/);
  assert.match(ledger, /請再按一次確定刪除/);
  assert.match(ledger, /function updateEntryFromWeb\(rowNumber, createdAt,/);
  assert.match(ledger, /function deleteEntryFromWeb\(rowNumber, createdAt, confirmed\)/);
  assert.match(ledger, /guardStoredEntry_\(existing, createdAt\)/);
  assert.match(ledger, /writeSpendDeletes_\(ctx\.id, \[\{ rowNumber: existing\.rowNumber \}\]\)/);
  assert.match(ledger, /parsed\[0\]\.rowNumber = index \+ 2;[\s\S]*return activeEntries_\(entries\)/);
  assert.equal(ledger.includes('deleteDimension'), false);
  assert.equal(ledger.includes('deleteEntryRow_'), false);
  const page = fs.readFileSync('src/Index.html', 'utf8');
  assert.match(page, /updateEntryFromWeb\(editRow, editToken,/);
  assert.match(page, /deleteEntryFromWeb\(editRow, editToken, true\)/);
  const spend = fs.readFileSync('src/SpendCalendar.js', 'utf8');
  const update = spend.slice(spend.indexOf('function updateSpendEvent_'), spend.indexOf('function removeSpendEvent_'));
  const remove = spend.slice(spend.indexOf('function removeSpendEvent_'), spend.indexOf('function mirrorSpendEntry_'));
  assert.equal(update.includes('clearSpendCalendarId_'), false);
  assert.match(update, /insertSpendEvent_/);
  assert.equal(remove.includes('clearSpendCalendarId_'), false);
  const setup = fs.readFileSync('src/Setup.js', 'utf8');
  assert.match(setup, /ensureAiKeywords_\(id\)/);
  assert.match(setup, /mergeKeywordList_/);
});
