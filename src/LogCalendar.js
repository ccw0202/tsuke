/**
 * All-day events on the secondary calendar named in settings, default 「Tsuke 日誌」.
 * Uses calendar.app.created: the script can only see calendars it created.
 */

function writeDailyLog_(text, isoDate, calendarName) {
  var summary = String(text || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!summary) throw userFacingError_('請輸入日誌內容');
  if (summary.length > 200) summary = summary.slice(0, 200);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !shiftIsoDate(isoDate, 1)) {
    throw userFacingError_('日期不正確');
  }
  var title = safeCalendarTitle_(calendarName);
  var calendarId = ensureLogCalendar_(title);
  try {
    insertAllDayEvent_(calendarId, summary, isoDate);
    return;
  } catch (err) {
    logPrivate_(err);
    if (!isMissingCalendar_(err)) throw userFacingError_('日誌沒有寫入，請稍後再試。');
  }
  clearLogCalendarId_();
  calendarId = ensureLogCalendar_(title);
  try {
    insertAllDayEvent_(calendarId, summary, isoDate);
  } catch (err2) {
    logPrivate_(err2);
    throw userFacingError_('日誌沒有寫入，請稍後再試。');
  }
}

function ensureLogCalendar_(title) {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty(PROP_KEYS.LOG_CALENDAR_ID) || '';
  if (isCalendarIdShape_(existing)) return existing;
  var created = Calendar.Calendars.insert({
    summary: title,
    timeZone: TIME_ZONE,
    description: 'Tsuke daily log'
  });
  var id = created && created.id;
  if (!isCalendarIdShape_(id)) throw userFacingError_('沒有建立日誌日曆。');
  props.setProperty(PROP_KEYS.LOG_CALENDAR_ID, id);
  return id;
}

function insertAllDayEvent_(calendarId, summary, isoDate) {
  Calendar.Events.insert({
    summary: summary,
    description: '由 Tsuke 寫入的全日記事',
    start: { date: isoDate },
    end: { date: shiftIsoDate(isoDate, 1) },
    transparency: 'transparent'
  }, calendarId);
}

function clearLogCalendarId_() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.LOG_CALENDAR_ID);
}

function safeCalendarTitle_(name) {
  var text = String(name || '').replace(/[\u0000-\u001F]/g, '').trim();
  if (!text || /^[=+\-@＝＋－＠]/.test(text) || text.length > 40) return LOG_CALENDAR_NAME;
  return text;
}

function isMissingCalendar_(err) {
  var text = String(err && (err.message || err));
  return text.indexOf('404') !== -1 || text.indexOf('Not Found') !== -1;
}
