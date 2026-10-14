/**
 * Expense events on the script-created calendar 「Tsuke 花費」.
 * calendar.app.created can only see calendars this script created, so the
 * owner's main calendar is never read or written.
 * A clock time on the line becomes a 30-minute event. No time means all-day.
 */

var SPEND_EVENT_MINUTES_ = 30;
var SPEND_MARKER_ = 'spend';

function expenseEventTitle_(entry) {
  var name = String(entry && entry.name || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) name = '（未命名）';
  if (name.length > 80) name = name.slice(0, 80);
  var amount = compactAmount_(entry && entry.amount);
  var currency = String(entry && entry.currency || 'TWD').toUpperCase();
  var title = currency === 'TWD' ? name + ' ' + amount : name + ' ' + amount + ' ' + currency;
  if (currency !== 'TWD' && typeof entry.twd === 'number' && isFinite(entry.twd)) {
    title += ' (≈NT$' + String(Math.round(entry.twd)) + ')';
  }
  if (title.length > 200) title = title.slice(0, 200);
  return title;
}

function compactAmount_(value) {
  var amount = Number(value);
  if (!isFinite(amount)) return '';
  var rounded = Math.round(amount * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return String(rounded);
}

function spendEventBody_(entry) {
  var zone = entry && entry.timeZone ? entry.timeZone : 'Asia/Taipei';
  var body = {
    summary: expenseEventTitle_(entry),
    description: '由 Tsuke 寫入的花費',
    extendedProperties: { private: { tsuke: SPEND_MARKER_ } }
  };
  if (entry && entry.time && /^\d{2}:\d{2}$/.test(entry.time)) {
    var end = addClockMinutes_(entry.date, entry.time, SPEND_EVENT_MINUTES_);
    body.start = { dateTime: entry.date + 'T' + entry.time + ':00', timeZone: zone };
    body.end = { dateTime: end.date + 'T' + end.time + ':00', timeZone: zone };
    body.transparency = 'opaque';
    return body;
  }
  body.start = { date: entry.date };
  body.end = { date: spendShiftIsoDate_(entry.date, 1) };
  body.transparency = 'transparent';
  return body;
}

function addClockMinutes_(isoDate, hhmm, minutes) {
  var parts = String(hhmm || '').split(':');
  var total = Number(parts[0]) * 60 + Number(parts[1]) + minutes;
  var dayShift = Math.floor(total / 1440);
  total = ((total % 1440) + 1440) % 1440;
  var hour = Math.floor(total / 60);
  var minute = total % 60;
  return {
    date: spendShiftIsoDate_(isoDate, dayShift),
    time: (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute
  };
}

function spendShiftIsoDate_(iso, days) {
  if (typeof shiftIsoDate === 'function') return shiftIsoDate(iso, days);
  if (typeof module !== 'undefined' && module.exports) return require('./Parser.js').shiftIsoDate(iso, days);
  return '';
}

/**
 * rows: sheet entries that should exist. remoteEvents: {id, marker} already on the spend calendar.
 * Events without the Tsuke marker are left alone, including anything on another calendar.
 * Rows already marked 已刪除 are skipped so a calendar delete is not written back as a new event.
 */
function planSpendSync_(rows, remoteEvents) {
  var remoteById = {};
  (remoteEvents || []).forEach(function (event) {
    if (!event || !event.id || event.status === 'cancelled') return;
    remoteById[event.id] = event;
  });
  var referenced = {};
  var actions = [];
  (rows || []).forEach(function (row) {
    if (!row || row.deleted === true || row.status === spendDeletedMark_()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) return;
    if (!Number.isInteger(row.rowNumber) || row.rowNumber < 2) return;
    var known = row.eventId && remoteById[row.eventId] ? row.eventId : '';
    if (known) {
      referenced[known] = true;
      actions.push({ op: 'update', rowNumber: row.rowNumber, eventId: known, entry: row });
    } else {
      actions.push({ op: 'create', rowNumber: row.rowNumber, entry: row });
    }
  });
  var remove = [];
  Object.keys(remoteById).forEach(function (id) {
    if (remoteById[id].marker === SPEND_MARKER_ && !referenced[id]) remove.push(id);
  });
  return { actions: actions, remove: remove };
}

/**
 * remoteEvents include cancelled events from 「Tsuke 花費」.
 * A row is soft-deleted only when its stored event id is one of those cancelled ids.
 * An id that is simply absent is not a delete: a replaced calendar has none of the
 * old events, and those rows should be recreated rather than erased.
 */
function planSpendDeleteSync_(rows, remoteEvents) {
  var cancelled = {};
  (remoteEvents || []).forEach(function (event) {
    if (!event || event.status !== 'cancelled' || !event.id) return;
    cancelled[event.id] = true;
  });
  var deletes = [];
  (rows || []).forEach(function (row) {
    if (!row || row.deleted === true || row.status === spendDeletedMark_()) return;
    if (!Number.isInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > 100000) return;
    if (!row.eventId || !cancelled[row.eventId]) return;
    deletes.push({ rowNumber: row.rowNumber });
  });
  return deletes;
}

function spendDeletedMark_() {
  if (typeof ENTRY_STATUS_DELETED !== 'undefined') return ENTRY_STATUS_DELETED;
  return require('./Schema.js').ENTRY_STATUS_DELETED;
}

function ensureSpendCalendar_(title) {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty(PROP_KEYS.SPEND_CALENDAR_ID) || '';
  if (isCalendarIdShape_(existing)) return existing;
  var name = title || SPEND_CALENDAR_NAME;
  var created = Calendar.Calendars.insert({
    summary: name,
    timeZone: TIME_ZONE,
    description: 'Tsuke expenses'
  });
  var id = created && created.id;
  if (!isCalendarIdShape_(id)) throw userFacingError_('沒有建立花費日曆。');
  props.setProperty(PROP_KEYS.SPEND_CALENDAR_ID, id);
  return id;
}

function clearSpendCalendarId_() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.SPEND_CALENDAR_ID);
}

function syncSpendCalendar() {
  try {
    return withScriptLock_(function () {
      return syncSpendCalendarUnlocked_();
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '花費日曆沒有同步。' };
  }
}

function syncSpendCalendarUnlocked_() {
  var ctx = loadLedgerContext_();
  if (!ctx.settings.spendEvents) {
    return { ok: true, message: '花費日曆已關閉。帳目仍會記，不會改日曆，也不會把帳標成已刪除。', created: 0, updated: 0, removed: 0, deleted: 0 };
  }
  var calendarId = ensureSpendCalendar_(SPEND_CALENDAR_NAME);
  var rows = readSpendRows_(ctx.id, ctx.settings.timeZone);
  var remoteAll = listSpendEvents_(calendarId, true);
  var deletes = planSpendDeleteSync_(rows, remoteAll);
  writeSpendDeletes_(ctx.id, deletes);
  var dropped = {};
  deletes.forEach(function (item) { dropped[item.rowNumber] = true; });
  rows.forEach(function (row) {
    if (!dropped[row.rowNumber]) return;
    row.deleted = true;
    row.status = spendDeletedMark_();
    row.eventId = '';
  });
  var remote = remoteAll.filter(function (event) { return event.status !== 'cancelled'; });
  var plan = planSpendSync_(rows, remote);
  var created = 0;
  var updated = 0;
  var idWrites = [];
  plan.actions.forEach(function (action) {
    var body = spendEventBody_(action.entry);
    if (action.op === 'update') {
      try {
        Calendar.Events.update(body, calendarId, action.eventId);
        updated += 1;
        return;
      } catch (err) {
        logPrivate_(err);
        if (!isMissingCalendar_(err)) return;
      }
    }
    var inserted = insertSpendEvent_(calendarId, body);
    calendarId = inserted.calendarId;
    if (!inserted.eventId) return;
    created += 1;
    idWrites.push({ rowNumber: action.rowNumber, eventId: inserted.eventId });
  });
  var removed = 0;
  plan.remove.forEach(function (eventId) {
    try {
      Calendar.Events.remove(calendarId, eventId);
      removed += 1;
    } catch (err) {
      logPrivate_(err);
    }
  });
  writeEventIds_(ctx.id, idWrites);
  return {
    ok: true,
    message: '已同步花費日曆：新增 ' + created + '、更新 ' + updated + '、刪除 ' + removed + '、帳本標記 ' + deletes.length + '。',
    created: created,
    updated: updated,
    removed: removed,
    deleted: deletes.length
  };
}

function syncDeletedSpendEvents() {
  try {
    return withScriptLock_(function () {
      return syncDeletedSpendEventsUnlocked_();
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '花費日曆沒有核對。' };
  }
}

function syncDeletedSpendEventsUnlocked_() {
  var ctx = loadLedgerContext_();
  if (!ctx.settings.spendEvents) {
    return { ok: true, message: '花費日曆已關閉，沒有改帳本。', deleted: 0 };
  }
  var calendarId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SPEND_CALENDAR_ID) || '';
  if (!isCalendarIdShape_(calendarId)) {
    return { ok: true, message: '還沒有花費日曆，沒有改帳本。', deleted: 0 };
  }
  var remote;
  try {
    remote = listSpendEvents_(calendarId, true);
  } catch (err) {
    logPrivate_(err);
    return { ok: false, message: '花費日曆沒有核對。' };
  }
  var rows = readSpendRows_(ctx.id, ctx.settings.timeZone);
  var deletes = planSpendDeleteSync_(rows, remote);
  writeSpendDeletes_(ctx.id, deletes);
  if (!deletes.length) return { ok: true, message: '沒有需要標記的帳。', deleted: 0 };
  return {
    ok: true,
    message: '已把 ' + deletes.length + ' 筆標成已刪除。把「狀態」清掉就能還原，再執行 syncSpendCalendar 會把事件加回去。',
    deleted: deletes.length
  };
}

function mirrorSpendEntry_(spreadsheetId, rowNumber, entry) {
  if (!entry || entry.spendEvents === false) return '';
  var calendarId = ensureSpendCalendar_(SPEND_CALENDAR_NAME);
  var inserted = insertSpendEvent_(calendarId, spendEventBody_(entry));
  if (!inserted.eventId) return '';
  writeEventIds_(spreadsheetId, [{ rowNumber: rowNumber, eventId: inserted.eventId }]);
  return inserted.eventId;
}

function insertSpendEvent_(calendarId, body) {
  try {
    return { calendarId: calendarId, eventId: eventIdFromInsert_(Calendar.Events.insert(body, calendarId)) };
  } catch (err) {
    logPrivate_(err);
    if (!isMissingCalendar_(err)) return { calendarId: calendarId, eventId: '' };
  }
  clearSpendCalendarId_();
  var fresh = ensureSpendCalendar_(SPEND_CALENDAR_NAME);
  try {
    return { calendarId: fresh, eventId: eventIdFromInsert_(Calendar.Events.insert(body, fresh)) };
  } catch (err2) {
    logPrivate_(err2);
    return { calendarId: fresh, eventId: '' };
  }
}

function eventIdFromInsert_(created) {
  var id = created && created.id;
  return isEventIdShape_(id) ? id : '';
}

function listSpendEvents_(calendarId, showDeleted) {
  var out = [];
  var pageToken = '';
  var pages = 0;
  while (pages < 20) {
    var options = { maxResults: 250, showDeleted: showDeleted === true, singleEvents: true };
    if (pageToken) options.pageToken = pageToken;
    var response = Calendar.Events.list(calendarId, options);
    ((response && response.items) || []).forEach(function (item) {
      if (!item || !item.id || !isEventIdShape_(item.id)) return;
      var status = item.status === 'cancelled' ? 'cancelled' : 'confirmed';
      if (showDeleted !== true && status === 'cancelled') return;
      var priv = item.extendedProperties && item.extendedProperties.private;
      out.push({
        id: item.id,
        status: status,
        marker: priv && priv.tsuke === SPEND_MARKER_ ? SPEND_MARKER_ : ''
      });
    });
    pageToken = response && response.nextPageToken || '';
    if (!pageToken) break;
    pages += 1;
  }
  return out;
}

function readSpendRows_(spreadsheetId, timeZone) {
  var values = sheetValues_(spreadsheetId, SHEET_NAMES.ENTRIES + '!A2:' + columnLetter_(ENTRY_HEADERS.length));
  var rows = [];
  values.forEach(function (row, index) {
    var entries = entriesFromRows([row]);
    if (!entries.length) return;
    var entry = entries[0];
    entry.rowNumber = index + 2;
    entry.timeZone = timeZone || TIME_ZONE;
    rows.push(entry);
  });
  return rows;
}

function ensureStatusHeader_(spreadsheetId) {
  var column = columnLetter_(ENTRY_COL.STATUS);
  var title = ENTRY_HEADERS[ENTRY_COL.STATUS - 1];
  var current = sheetValues_(spreadsheetId, SHEET_NAMES.ENTRIES + '!' + column + '1');
  if (current[0] && String(current[0][0] || '') === title) return;
  Sheets.Spreadsheets.Values.update(
    { values: [[title]] },
    spreadsheetId,
    SHEET_NAMES.ENTRIES + '!' + column + '1',
    { valueInputOption: 'RAW' }
  );
}

function writeSpendDeletes_(spreadsheetId, deletes) {
  var usable = (deletes || []).filter(function (item) {
    return item && Number.isInteger(item.rowNumber) && item.rowNumber >= 2 && item.rowNumber <= 100000;
  });
  if (!usable.length) return;
  ensureStatusHeader_(spreadsheetId);
  var statusCol = columnLetter_(ENTRY_COL.STATUS);
  var eventCol = columnLetter_(ENTRY_COL.EVENT_ID);
  var mark = guardSheetText(spendDeletedMark_(), 20);
  var data = [];
  usable.forEach(function (item) {
    data.push({
      range: SHEET_NAMES.ENTRIES + '!' + statusCol + item.rowNumber,
      values: [[mark]]
    });
    data.push({
      range: SHEET_NAMES.ENTRIES + '!' + eventCol + item.rowNumber,
      values: [['']]
    });
  });
  var step = 200;
  for (var offset = 0; offset < data.length; offset += step) {
    Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: 'RAW',
      data: data.slice(offset, offset + step)
    }, spreadsheetId);
  }
}

function writeEventIds_(spreadsheetId, pairs) {
  var usable = (pairs || []).filter(function (pair) {
    return pair && Number.isInteger(pair.rowNumber) && pair.rowNumber >= 2 && isEventIdShape_(pair.eventId);
  });
  if (!usable.length) return;
  var column = columnLetter_(ENTRY_COL.EVENT_ID);
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: 'RAW',
    data: usable.map(function (pair) {
      return {
        range: SHEET_NAMES.ENTRIES + '!' + column + pair.rowNumber,
        values: [[guardSheetText(pair.eventId, 140)]]
      };
    })
  }, spreadsheetId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    expenseEventTitle_: expenseEventTitle_,
    spendEventBody_: spendEventBody_,
    addClockMinutes_: addClockMinutes_,
    planSpendSync_: planSpendSync_,
    planSpendDeleteSync_: planSpendDeleteSync_
  };
}
