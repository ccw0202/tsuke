/**
 * Planned events on the secondary calendar 「Tsuke 活動」.
 * calendar.app.created cannot write the primary calendar, so setup creates
 * this calendar and every 預訂活動 entry lands there.
 * Pure helpers below do not call Calendar. Node tests load only those.
 */

function plainLogBody_(text, marker) {
  var raw = String(text || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { ok: false, message: '請輸入日誌內容' };
  var mark = String(marker || '日誌');
  if (!/^[\u4e00-\u9fffA-Za-z]{1,12}$/.test(mark)) mark = '日誌';
  if (raw.indexOf(mark) === 0) {
    var rest = raw.slice(mark.length);
    if (!rest || /^[\s:：]/.test(rest)) raw = rest.replace(/^[\s:：]+/, '').trim();
  }
  if (!raw) return { ok: false, message: '請輸入日誌內容' };
  if (raw.length > 200) raw = raw.slice(0, 200);
  return { ok: true, text: raw };
}

function planFields_(input) {
  var src = input || {};
  var date = String(src.date || '').trim();
  if (!date) date = planShiftIsoDate_(String(src.today || ''), 1);
  if (!planIsoDate_(date)) return { ok: false, message: '日期不正確' };
  var clock = planClock_(src.time);
  if (clock === null) return { ok: false, message: '時間不正確' };
  var title = planClip_(src.title, 80);
  if (!title) return { ok: false, message: '請輸入活動名稱' };
  return {
    ok: true,
    date: date,
    time: clock,
    title: title,
    withWhom: planClip_(src.withWhom, 40),
    location: planClip_(src.location, 80)
  };
}

function planEventBody_(fields, timeZone) {
  var zone = planZone_(timeZone);
  var description = '由 Tsuke 寫入的活動';
  if (fields.withWhom) description += '\n跟誰：' + fields.withWhom;
  var body = {
    summary: fields.title,
    description: description,
    transparency: fields.time ? 'opaque' : 'transparent',
    extendedProperties: { private: { tsuke: 'plan' } }
  };
  if (fields.location) body.location = fields.location;
  if (fields.time) {
    var end = planAddMinutes_(fields.date, fields.time, 60);
    body.start = { dateTime: fields.date + 'T' + fields.time + ':00', timeZone: zone };
    body.end = { dateTime: end.date + 'T' + end.time + ':00', timeZone: zone };
  } else {
    body.start = { date: fields.date };
    body.end = { date: planShiftIsoDate_(fields.date, 1) };
  }
  return body;
}

function planAddMinutes_(iso, hhmm, minutes) {
  var clock = String(hhmm).split(':').map(Number);
  var total = clock[0] * 60 + clock[1] + minutes;
  var dayShift = Math.floor(total / 1440);
  var rem = total % 1440;
  if (rem < 0) {
    rem += 1440;
    dayShift -= 1;
  }
  var hour = Math.floor(rem / 60);
  var minute = rem % 60;
  return {
    date: planShiftIsoDate_(iso, dayShift),
    time: planPad2_(hour) + ':' + planPad2_(minute)
  };
}

function writePlanEvent_(fields, timeZone) {
  var body = planEventBody_(fields, timeZone);
  var calendarId = ensurePlanCalendar_();
  try {
    Calendar.Events.insert(body, calendarId);
    return;
  } catch (err) {
    logPrivate_(err);
    if (!isMissingCalendar_(err)) throw userFacingError_('活動沒有寫入，請稍後再試。');
  }
  clearPlanCalendarId_();
  calendarId = ensurePlanCalendar_();
  try {
    Calendar.Events.insert(body, calendarId);
  } catch (err2) {
    logPrivate_(err2);
    throw userFacingError_('活動沒有寫入，請稍後再試。');
  }
}

function ensurePlanCalendar_() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty(PROP_KEYS.PLAN_CALENDAR_ID) || '';
  if (isCalendarIdShape_(existing)) return existing;
  var created = Calendar.Calendars.insert({
    summary: PLAN_CALENDAR_NAME,
    timeZone: TIME_ZONE,
    description: 'Tsuke planned events'
  });
  var id = created && created.id;
  if (!isCalendarIdShape_(id)) throw userFacingError_('沒有建立活動日曆。');
  props.setProperty(PROP_KEYS.PLAN_CALENDAR_ID, id);
  return id;
}

function clearPlanCalendarId_() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.PLAN_CALENDAR_ID);
}

function planClock_(value) {
  var text = String(value || '').trim().replace(/：/g, ':');
  if (!text) return '';
  var match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return planPad2_(hour) + ':' + planPad2_(minute);
}

function planClip_(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) text = text.slice(0, maxLength).trim();
  return text;
}

function planPad2_(value) {
  return value < 10 ? '0' + value : String(value);
}

function planIsoDate_(value) {
  if (typeof isIsoDate_ === 'function') return isIsoDate_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  var parts = String(value).split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function planShiftIsoDate_(iso, days) {
  if (typeof shiftIsoDate === 'function') return shiftIsoDate(iso, days);
  if (typeof module !== 'undefined' && module.exports) return require('./Parser.js').shiftIsoDate(iso, days);
  return '';
}

function planZone_(timeZone) {
  if (typeof safeTimeZone === 'function') return safeTimeZone(timeZone);
  if (typeof module !== 'undefined' && module.exports) return require('./Parser.js').safeTimeZone(timeZone);
  return 'Asia/Taipei';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    plainLogBody_: plainLogBody_,
    planFields_: planFields_,
    planEventBody_: planEventBody_,
    planAddMinutes_: planAddMinutes_
  };
}
