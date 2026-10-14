const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const plan = require('../src/PlanCalendar.js');
const schema = require('../src/Schema.js');

test('a plain log does not need the marker, and a typed marker is stripped', () => {
  assert.deepEqual(plan.plainLogBody_('去公園散步', '日誌'), { ok: true, text: '去公園散步' });
  assert.deepEqual(plan.plainLogBody_('日誌 去公園', '日誌'), { ok: true, text: '去公園' });
  assert.deepEqual(plan.plainLogBody_('日誌：去公園散步', '日誌'), { ok: true, text: '去公園散步' });
  assert.equal(plan.plainLogBody_('  ', '日誌').ok, false);
  assert.equal(plan.plainLogBody_('日誌', '日誌').message, '請輸入日誌內容');
  assert.equal(plan.plainLogBody_('日誌去公園', '日誌').text, '日誌去公園');
});

test('a plan defaults to tomorrow, rejects a bad date or time, and keeps the title', () => {
  const tomorrow = plan.planFields_({ title: '跟朋友吃飯', today: '2026-10-14' });
  assert.equal(tomorrow.ok, true);
  assert.equal(tomorrow.date, '2026-10-15');
  assert.equal(tomorrow.time, '');
  assert.equal(tomorrow.title, '跟朋友吃飯');

  assert.equal(plan.planFields_({ title: '跟朋友吃飯', date: '2026-02-31', today: '2026-10-14' }).message, '日期不正確');
  assert.equal(plan.planFields_({ title: '跟朋友吃飯', date: '2026-10-15', time: '25:00', today: '2026-10-14' }).message, '時間不正確');
  assert.equal(plan.planFields_({ title: '   ', date: '2026-10-15', today: '2026-10-14' }).message, '請輸入活動名稱');
});

test('a timed plan lasts 60 minutes and an all-day plan has no clock', () => {
  const timed = plan.planFields_({
    title: '跟朋友吃飯',
    date: '2026-10-15',
    time: '19:00',
    withWhom: '範例朋友',
    location: '範例公園',
    today: '2026-10-14'
  });
  const body = plan.planEventBody_(timed, 'Asia/Taipei');
  assert.equal(body.summary, '跟朋友吃飯');
  assert.equal(body.location, '範例公園');
  assert.equal(body.start.dateTime, '2026-10-15T19:00:00');
  assert.equal(body.end.dateTime, '2026-10-15T20:00:00');
  assert.equal(body.start.timeZone, 'Asia/Taipei');
  assert.equal(body.transparency, 'opaque');
  assert.match(body.description, /跟誰：範例朋友/);
  assert.equal(JSON.stringify(body).includes('http'), false);
  assert.equal(JSON.stringify(body).includes('docs.google.com'), false);

  const late = plan.planAddMinutes_('2026-10-15', '23:30', 60);
  assert.deepEqual(late, { date: '2026-10-16', time: '00:30' });

  const allDay = plan.planEventBody_(plan.planFields_({
    title: '跟朋友吃飯',
    date: '2026-10-15',
    today: '2026-10-14'
  }), 'Asia/Taipei');
  assert.deepEqual(allDay.start, { date: '2026-10-15' });
  assert.deepEqual(allDay.end, { date: '2026-10-16' });
  assert.equal(allDay.start.dateTime, undefined);
  assert.equal(allDay.transparency, 'transparent');
  assert.equal(allDay.location, undefined);
});

test('the manifest does not take calendar.events, and the page keeps three tabs plus the prefix', () => {
  const manifest = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events'), false);
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar'), false);
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar.app.created'), true);
  assert.equal(schema.PLAN_CALENDAR_NAME, 'Tsuke 活動');
  assert.equal(schema.PROP_KEYS.PLAN_CALENDAR_ID, 'PLAN_CALENDAR_ID');

  const html = fs.readFileSync('src/Index.html', 'utf8');
  assert.equal(html.includes('role="tablist"'), true);
  assert.equal(html.includes('>記帳<'), true);
  assert.equal(html.includes('>日誌<'), true);
  assert.equal(html.includes('>預訂活動<'), true);
  assert.equal(html.includes('日誌(?:$|[\\s:：])'), true);
  assert.equal(html.includes('innerHTML'), false);
  assert.equal(html.includes('<?'), false);
  assert.equal(html.includes('document.write'), false);

  const source = fs.readFileSync('src/PlanCalendar.js', 'utf8');
  assert.equal(source.includes('CalendarApp'), false);
  assert.equal(source.includes('calendar.events'), false);
  const web = fs.readFileSync('src/WebApp.js', 'utf8');
  assert.equal(web.includes('function addLogFromWeb'), true);
  assert.equal(web.includes('function addPlanFromWeb'), true);
});
