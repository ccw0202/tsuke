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
      merchantKey: String(row[12] || '')
    });
  });
  return out;
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
    entriesFromRows: entriesFromRows
  };
}
