/**
 * Pure helpers for tags, payment choice, and search.
 * Payment priority: typed code, then a pinned chip, then memory, then the default.
 */

function tagsForDate(isoDate, tags) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return [];
  var names = [];
  (tags || []).forEach(function (tag) {
    if (!tag || !tag.name || !tag.start) return;
    var end = tag.end || tag.start;
    if (tag.start <= isoDate && isoDate <= end && names.indexOf(tag.name) === -1) names.push(tag.name);
  });
  return names;
}

function mergeTagNames(explicitJoined, autoNames) {
  var out = [];
  function add(name) {
    var clean = String(name || '').trim();
    if (!clean || out.indexOf(clean) !== -1) return;
    if (clean.length > 40) clean = clean.slice(0, 40);
    out.push(clean);
  }
  String(explicitJoined || '').split('、').forEach(add);
  (autoNames || []).forEach(add);
  return out.join('、');
}

function isSafePaymentCode_(code) {
  return /^[\u4e00-\u9fffA-Za-z0-9_-]{1,32}$/.test(String(code || ''));
}

function isSyntheticTransfer_(code) {
  return /^[\u4e00-\u9fffA-Za-z0-9]{1,12}轉帳$/.test(String(code || ''));
}

function resolvePayment(spec) {
  var input = spec || {};
  var payments = input.payments || [];
  var byCode = {};
  payments.forEach(function (payment) {
    if (payment && payment.code && isSafePaymentCode_(payment.code)) byCode[payment.code] = payment;
  });

  if (input.explicitCode && byCode[input.explicitCode]) return byCode[input.explicitCode];
  if (input.explicitCode && input.explicitSynthetic && isSyntheticTransfer_(input.explicitCode)) {
    return {
      code: input.explicitCode,
      name: input.explicitCode,
      type: '轉帳',
      accountCode: input.explicitCode.replace(/轉帳$/, ''),
      cardCode: '',
      synthetic: true
    };
  }
  if (input.explicitOnly) return null;
  if (input.pinned && input.hintCode && byCode[input.hintCode]) return byCode[input.hintCode];
  if (input.rememberedCode && byCode[input.rememberedCode]) return byCode[input.rememberedCode];
  if (input.defaultCode && byCode[input.defaultCode]) return byCode[input.defaultCode];
  for (var i = 0; i < payments.length; i++) {
    if (payments[i] && byCode[payments[i].code]) return payments[i];
  }
  return null;
}

function tagsFromRows(rows) {
  var out = [];
  (rows || []).forEach(function (row) {
    if (!row) return;
    var name = String(row[0] == null ? '' : row[0]).trim();
    if (!/^[\u4e00-\u9fffA-Za-z0-9 _-]{1,40}$/.test(name)) return;
    var start = coerceIsoDate_(row[1]);
    var end = coerceIsoDate_(row[2]) || start;
    if (!start) return;
    out.push({ name: name, start: start, end: end });
  });
  return out;
}

function memoryFromRows(rows) {
  var map = {};
  (rows || []).forEach(function (row) {
    if (!row) return;
    var key = String(row[0] == null ? '' : row[0]).trim();
    var code = String(row[2] == null ? '' : row[2]).trim();
    if (!key || !isSafePaymentCode_(code)) return;
    map[key] = code;
  });
  return map;
}

function entriesFromRows(rows) {
  var out = [];
  (rows || []).forEach(function (row) {
    if (!row || row.length < 6) return;
    var amount = typeof row[2] === 'number' ? row[2] : Number(String(row[2]).replace(/,/g, ''));
    if (!isFinite(amount)) return;
    var currency = String(row[3] || '');
    var twd = typeof row[4] === 'number' && isFinite(row[4]) ? row[4] : null;
    if (twd === null && currency === 'TWD') twd = amount;
    var date = row[0];
    if (typeof date === 'number') date = serialToIso_(date);
    out.push({
      date: String(date || ''),
      name: String(row[1] || ''),
      amount: amount,
      currency: currency,
      twd: twd,
      category: String(row[5] || ''),
      paymentCode: String(row[6] || ''),
      paymentName: String(row[7] || ''),
      accountCode: String(row[8] || ''),
      cardCode: String(row[9] || ''),
      tag: String(row[10] || ''),
      note: String(row[11] || ''),
      merchantKey: String(row[12] || ''),
      createdAt: createdAtFromCell_(row[13]),
      time: clockFromCell_(row[14]),
      eventId: eventIdFromCell_(row[15]),
      status: entryStatusFromCell_(row[16]),
      deleted: isDeletedEntryStatus_(row[16])
    });
  });
  return out;
}

function activeEntries_(entries) {
  return (entries || []).filter(function (entry) {
    return entry && entry.deleted !== true;
  });
}

function entryStatusFromCell_(value) {
  return String(value == null ? '' : value).replace(/^'/, '').trim();
}

function isDeletedEntryStatus_(value) {
  return entryStatusFromCell_(value) === deletedStatusMark_();
}

function deletedStatusMark_() {
  if (typeof ENTRY_STATUS_DELETED !== 'undefined') return ENTRY_STATUS_DELETED;
  if (typeof module !== 'undefined' && module.exports) return require('./Schema.js').ENTRY_STATUS_DELETED;
  return '已刪除';
}

function clockFromCell_(value) {
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value < 1) {
    var minutes = Math.round(value * 24 * 60) % (24 * 60);
    var hour = Math.floor(minutes / 60);
    var minute = minutes % 60;
    return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
  }
  var match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
}

function eventIdFromCell_(value) {
  var text = String(value || '').replace(/^'/, '').trim();
  if (typeof isEventIdShape_ === 'function') return isEventIdShape_(text) ? text : '';
  if (typeof module !== 'undefined' && module.exports) {
    return require('./Security.js').isEventIdShape_(text) ? text : '';
  }
  return '';
}

function coerceIsoDate_(value) {
  if (typeof value === 'number') return serialToIso_(value);
  var text = String(value || '').trim();
  var match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return '';
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function serialToIso_(value) {
  if (typeof sheetsSerialToIso === 'function') return sheetsSerialToIso(value);
  return require('./Parser.js').sheetsSerialToIso(value);
}

function createdAtFromCell_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    var whole = Math.floor(value);
    var date = serialToIso_(whole);
    if (!date) return '';
    var seconds = Math.round((value - whole) * 86400);
    if (seconds >= 86400) {
      date = serialToIso_(whole + 1);
      seconds = 0;
      if (!date) return '';
    }
    if (seconds < 0) return '';
    var hour = Math.floor(seconds / 3600);
    var minute = Math.floor((seconds % 3600) / 60);
    var second = seconds % 60;
    return date + ' ' + twoDigits_(hour) + ':' + twoDigits_(minute) + ':' + twoDigits_(second);
  }
  var text = String(value == null ? '' : value).replace(/^'/, '').trim();
  var match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return '';
  var hourText = Number(match[2]);
  var minuteText = Number(match[3]);
  var secondText = Number(match[4]);
  if (hourText > 23 || minuteText > 59 || secondText > 59) return '';
  return match[1] + ' ' + match[2] + ':' + match[3] + ':' + match[4];
}

function twoDigits_(value) {
  return (value < 10 ? '0' : '') + value;
}

function entryMatchesToken_(entry, token) {
  var stored = createdAtFromCell_(entry && entry.createdAt);
  var given = createdAtFromCell_(token);
  if (!stored || !given) return false;
  return stored === given;
}

function guardStoredEntry_(entry, token) {
  if (!entryMatchesToken_(entry, token)) {
    return { ok: false, message: '這一筆已經變了，請重新整理後再試。' };
  }
  if (entry && entry.deleted === true) {
    return { ok: false, message: '這一筆已經刪除。' };
  }
  return { ok: true };
}

function publicEntryFields_(entry) {
  var source = entry || {};
  var out = {
    date: String(source.date || ''),
    name: String(source.name || ''),
    amount: source.amount,
    currency: String(source.currency || ''),
    category: String(source.category || ''),
    paymentName: String(source.paymentName || ''),
    paymentCode: String(source.paymentCode || ''),
    tag: String(source.tag || ''),
    twd: typeof source.twd === 'number' && isFinite(source.twd) ? source.twd : null,
    createdAt: createdAtFromCell_(source.createdAt)
  };
  var row = source.rowNumber;
  if (Number.isInteger(row) && row >= 2 && row <= 100000) out.rowNumber = row;
  return out;
}

function searchEntryList(entries, query) {
  var needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  return (entries || []).filter(function (entry) {
    var haystack = [
      entry.name,
      entry.category,
      entry.tag,
      entry.note,
      entry.paymentName,
      entry.paymentCode,
      entry.currency
    ].join('\n').toLowerCase();
    return haystack.indexOf(needle) !== -1;
  });
}

function summarizeTag(name, entries) {
  var wanted = String(name || '').trim();
  var matched = [];
  var total = 0;
  var counted = 0;
  (entries || []).forEach(function (entry) {
    var names = String(entry.tag || '').split('、').map(function (part) { return part.trim(); });
    if (names.indexOf(wanted) === -1) return;
    matched.push(entry);
    if (typeof entry.twd === 'number' && isFinite(entry.twd)) {
      total += entry.twd;
      counted += 1;
    }
  });
  return {
    name: wanted,
    total: Math.round(total * 100) / 100,
    counted: counted,
    entries: matched
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tagsForDate: tagsForDate,
    mergeTagNames: mergeTagNames,
    resolvePayment: resolvePayment,
    searchEntryList: searchEntryList,
    summarizeTag: summarizeTag,
    tagsFromRows: tagsFromRows,
    memoryFromRows: memoryFromRows,
    entriesFromRows: entriesFromRows,
    activeEntries_: activeEntries_,
    publicEntryFields_: publicEntryFields_,
    createdAtFromCell_: createdAtFromCell_,
    guardStoredEntry_: guardStoredEntry_
  };
}
