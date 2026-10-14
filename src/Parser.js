/**
 * Pure one-line parser. No Apps Script services.
 * Amount is required for an expense. Currency, payment, and category are optional.
 * A line that starts with the log marker is a daily log, not an expense.
 */

var CURRENCY_ALIASES = {
  TWD: 'TWD',
  NTD: 'TWD',
  'NT$': 'TWD',
  '台幣': 'TWD',
  '臺幣': 'TWD',
  '新台幣': 'TWD',
  '新臺幣': 'TWD',
  USD: 'USD',
  'US$': 'USD',
  '美金': 'USD',
  '美元': 'USD',
  JPY: 'JPY',
  '日圓': 'JPY',
  '日元': 'JPY',
  '日幣': 'JPY',
  EUR: 'EUR',
  '歐元': 'EUR',
  HKD: 'HKD',
  '港幣': 'HKD',
  '港元': 'HKD',
  CNY: 'CNY',
  RMB: 'CNY',
  '人民幣': 'CNY',
  KRW: 'KRW',
  '韓元': 'KRW',
  '韓幣': 'KRW',
  GBP: 'GBP',
  '英鎊': 'GBP',
  SGD: 'SGD',
  '新幣': 'SGD',
  AUD: 'AUD',
  CHF: 'CHF',
  CAD: 'CAD',
  THB: 'THB',
  MYR: 'MYR',
  PHP: 'PHP',
  VND: 'VND'
};

function schemaConstant_(name, fallback) {
  if (typeof globalThis !== 'undefined' && globalThis[name] !== undefined) return globalThis[name];
  if (typeof module !== 'undefined' && module.exports) {
    return require('./Schema.js')[name];
  }
  return fallback;
}

function parseEntry(line, options) {
  var opts = options || {};
  var today = opts.today || '1970-01-01';
  var defaultCurrency = opts.defaultCurrency || 'TWD';
  var payments = opts.payments || [];
  var categories = opts.categories || [];
  var logMarkers = opts.logMarkers && opts.logMarkers.length ? opts.logMarkers : ['日誌'];
  var unnamed = schemaConstant_('UNNAMED_ITEM', '（未命名）');
  var fallbackCategory = schemaConstant_('FALLBACK_CATEGORY', '日常');
  var maxLine = schemaConstant_('MAX_LINE_LENGTH', 500);

  var raw = normalizeEntryLine(line);
  if (!raw) return parserFail_('請輸入內容', line);
  if (raw.length > maxLine) return parserFail_('輸入過長', line);

  var log = splitLogPrefix_(raw, logMarkers);
  if (log) {
    return parseLog_(log.body, today, raw);
  }

  var noteSplit = splitNote_(raw);
  var main = noteSplit.main;
  var note = noteSplit.note;
  var tokens = main.split(/\s+/).filter(Boolean);
  if (!tokens.length) return parserFail_('請輸入金額', raw);

  var date = today;
  var leadingDate = resolveDateToken(tokens[0], today);
  if (leadingDate) {
    date = leadingDate;
    tokens.shift();
  }

  var explicitTags = [];
  var categoryExplicit = '';
  var kept = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (token.charAt(0) === '#' && token.length > 1) {
      explicitTags.push(token.slice(1).slice(0, 40));
      continue;
    }
    var markedCategory = markedCategoryToken_(token, categories);
    if (markedCategory) {
      categoryExplicit = markedCategory;
      continue;
    }
    kept.push(token);
  }

  kept = expandGluedTokens_(kept);

  var paymentHits = [];
  var afterPayment = [];
  for (var p = 0; p < kept.length; p++) {
    var payment = matchPaymentToken(kept[p], payments);
    if (payment) paymentHits.push(payment);
    else afterPayment.push(kept[p]);
  }
  var explicitPayment = paymentHits.length ? paymentHits[paymentHits.length - 1] : null;

  var currencyHits = [];
  var afterCurrency = [];
  for (var c = 0; c < afterPayment.length; c++) {
    var currencyCode = matchCurrencyToken(afterPayment[c]);
    if (currencyCode) currencyHits.push(currencyCode);
    else afterCurrency.push(afterPayment[c]);
  }
  var currency = currencyHits.length ? currencyHits[currencyHits.length - 1] : defaultCurrency;
  if (!isAllowedCurrency(currency)) currency = defaultCurrency;

  var amount = null;
  var amountIndex = -1;
  var amountError = '';
  for (var a = 0; a < afterCurrency.length; a++) {
    var parsedAmount = parseAmountToken(afterCurrency[a]);
    if (!parsedAmount) continue;
    amountIndex = a;
    if (parsedAmount.error) {
      amountError = parsedAmount.error;
      amount = null;
    } else {
      amountError = '';
      amount = parsedAmount.value;
    }
  }
  if (amountError) return parserFail_(amountError, raw);
  if (amount === null) return parserFail_('請輸入金額', raw);

  var nameParts = afterCurrency.slice(0, amountIndex).concat(afterCurrency.slice(amountIndex + 1));
  if (!categoryExplicit) {
    var bare = takeBareCategory_(nameParts, categories);
    if (bare) {
      categoryExplicit = bare.category;
      nameParts = bare.rest;
    }
  }

  var name = nameParts.join(' ').trim();
  if (!name) name = unnamed;
  if (name.length > 80) name = name.slice(0, 80);

  var guessed = guessCategory(name, categories, fallbackCategory);
  var category = categoryExplicit || guessed.category;
  var categorySource = categoryExplicit ? 'explicit' : guessed.source;

  return {
    ok: true,
    type: 'expense',
    date: date,
    name: name,
    merchantKey: normalizeMerchantKey(name),
    amount: amount,
    currency: currency,
    explicitPaymentCode: explicitPayment ? explicitPayment.code : '',
    explicitSynthetic: !!(explicitPayment && explicitPayment.synthetic),
    category: category,
    categorySource: categorySource,
    note: note,
    tag: explicitTags.join('、'),
    raw: raw
  };
}

function parseLog_(body, today, raw) {
  var text = String(body || '').trim();
  var date = today;
  var tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length) {
    var leading = resolveDateToken(tokens[0], today);
    if (leading) {
      date = leading;
      tokens.shift();
      text = tokens.join(' ').trim();
    }
  }
  if (!text) return parserFail_('請輸入日誌內容', raw);
  if (text.length > 200) text = text.slice(0, 200);
  return {
    ok: true,
    type: 'log',
    date: date,
    text: text,
    raw: raw
  };
}

function parserFail_(message, raw) {
  return { ok: false, message: message, raw: String(raw || '') };
}

function normalizeEntryLine(line) {
  if (typeof line !== 'string') return '';
  var text = line.replace(/\u3000/g, ' ');
  text = text.replace(/[０-９]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
  text = text.replace(/．/g, '.');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '');
  return text.trim();
}

function normalizeMerchantKey(name) {
  var text = String(name || '').trim().toLowerCase();
  text = text.replace(/\s+/g, ' ');
  try {
    text = text.normalize('NFKC');
  } catch (err) {
    /* Older runtimes can skip NFKC. */
  }
  return text;
}

function splitLogPrefix_(raw, markers) {
  var list = markers.slice().sort(function (a, b) {
    return String(b).length - String(a).length;
  });
  for (var i = 0; i < list.length; i++) {
    var marker = String(list[i] || '');
    if (!marker || raw.indexOf(marker) !== 0) continue;
    if (raw.length === marker.length) return { body: '' };
    var rest = raw.slice(marker.length);
    if (/^[\s:：]/.test(rest)) return { body: rest.replace(/^[\s:：]+/, '') };
  }
  return null;
}

function splitNote_(raw) {
  var match = String(raw).match(/^(.*?)(?:\s\/\/\s|\s／／\s)([\s\S]*)$/);
  if (!match) return { main: String(raw).trim(), note: '' };
  var note = match[2].trim();
  if (note.length > 200) note = note.slice(0, 200);
  return { main: match[1].trim(), note: note };
}

function markedCategoryToken_(token, categories) {
  var match = String(token).match(/^(?:分類|cat)\s*[:：]\s*(.+)$/i);
  var label = match ? match[1] : '';
  if (!label && /^\[[^\]]+\]$/.test(token)) label = token.slice(1, -1);
  if (!label) return '';
  return canonicalCategory_(label, categories);
}

function canonicalCategory_(label, categories) {
  var wanted = String(label || '').trim().toLowerCase();
  if (!wanted) return '';
  for (var i = 0; i < categories.length; i++) {
    if (String(categories[i].name || '').trim().toLowerCase() === wanted) return categories[i].name;
  }
  return '';
}

function takeBareCategory_(nameParts, categories) {
  if (nameParts.length < 2) return null;
  for (var i = 0; i < nameParts.length; i++) {
    var category = canonicalCategory_(nameParts[i], categories);
    if (!category) continue;
    var rest = nameParts.slice(0, i).concat(nameParts.slice(i + 1));
    if (!rest.join('').trim()) return null;
    return { category: category, rest: rest };
  }
  return null;
}

function expandGluedTokens_(tokens) {
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var pieces = splitGluedToken_(tokens[i]);
    for (var j = 0; j < pieces.length; j++) out.push(pieces[j]);
  }
  return out;
}

function splitGluedToken_(token) {
  var nt = token.match(/^(NT\$|US\$)(\d+(?:\.\d+)?)$/i);
  if (nt) return [nt[2], nt[1].toUpperCase() === 'US$' ? 'USD' : 'TWD'];
  var symbol = token.match(/^([$€¥￥£])(\d+(?:\.\d+)?)$/);
  if (symbol) {
    var mapped = { '$': 'TWD', '€': 'EUR', '¥': 'JPY', '￥': 'JPY', '£': 'GBP' }[symbol[1]];
    return [symbol[2], mapped];
  }
  var suffix = token.match(/^(\d+(?:\.\d+)?)([A-Za-z]{3}|元)$/);
  if (suffix) return [suffix[1], suffix[2] === '元' ? 'TWD' : suffix[2].toUpperCase()];
  var prefix = token.match(/^([A-Za-z]{3})(\d+(?:\.\d+)?)$/);
  if (prefix) return [prefix[2], prefix[1].toUpperCase()];
  return [token];
}

function matchCurrencyToken(token) {
  if (!token) return '';
  if (CURRENCY_ALIASES[token]) return CURRENCY_ALIASES[token];
  var upper = String(token).toUpperCase();
  if (CURRENCY_ALIASES[upper]) return CURRENCY_ALIASES[upper];
  return '';
}

function isAllowedCurrency(code) {
  var list = schemaConstant_('ALLOWED_CURRENCIES', []);
  return list.indexOf(code) !== -1;
}

function matchPaymentToken(token, payments) {
  var folded = String(token || '').toLowerCase();
  for (var i = 0; i < payments.length; i++) {
    var payment = payments[i];
    if (!payment || payment.enabled === false) continue;
    var candidates = [payment.code, payment.name].concat(payment.aliases || []);
    for (var c = 0; c < candidates.length; c++) {
      if (candidates[c] && String(candidates[c]).toLowerCase() === folded) {
        return {
          code: payment.code,
          name: payment.name,
          synthetic: false
        };
      }
    }
  }
  if (hasTransferMethod_(payments) && isTransferCode(token)) {
    return { code: token, name: token, synthetic: true };
  }
  return null;
}

function hasTransferMethod_(payments) {
  for (var i = 0; i < payments.length; i++) {
    var payment = payments[i];
    if (!payment || payment.enabled === false) continue;
    if (payment.code === '轉帳' || payment.type === '轉帳') return true;
  }
  return false;
}

function isTransferCode(token) {
  return /^[\u4e00-\u9fffA-Za-z0-9]{1,12}轉帳$/.test(String(token || ''));
}

function parseAmountToken(token) {
  var text = String(token || '');
  if (/^[+-]?\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?$/.test(text)) text = text.replace(/[,，]/g, '');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  var dot = text.indexOf('.');
  var places = dot === -1 ? 0 : text.length - dot - 1;
  if (places > 6) return { error: '小數位數過多' };
  var value = Number(text);
  if (!isFinite(value) || value === 0 || Math.abs(value) >= 1000000000) return { error: '金額不合理' };
  return { value: value };
}

function guessCategory(name, categories, fallbackCategory) {
  var fallback = fallbackCategory || schemaConstant_('FALLBACK_CATEGORY', '日常');
  var bestLength = 0;
  var bestName = fallback;
  var source = 'fallback';
  var haystack = String(name || '');
  var folded = haystack.toLowerCase();
  for (var i = 0; i < categories.length; i++) {
    var keywords = categories[i].keywords || [];
    for (var k = 0; k < keywords.length; k++) {
      var keyword = String(keywords[k] || '').trim();
      if (!keyword || keyword.length <= bestLength) continue;
      if (keywordMatches_(folded, haystack, keyword)) {
        bestLength = keyword.length;
        bestName = categories[i].name;
        source = 'keyword';
      }
    }
  }
  return { category: bestName, source: source };
}

function keywordMatches_(folded, original, keyword) {
  if (/[A-Za-z0-9]/.test(keyword)) {
    var pattern = new RegExp(
      '(^|[^A-Za-z0-9])' + escapeRegExp_(keyword.toLowerCase()) + '([^A-Za-z0-9]|$)',
      'i'
    );
    return pattern.test(folded);
  }
  return original.indexOf(keyword) !== -1;
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDateToken(token, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return '';
  if (token === '今天') return today;
  if (token === '昨天') return shiftIsoDate(today, -1);
  if (token === '前天') return shiftIsoDate(today, -2);

  var iso = token.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) return validIsoOrEmpty_(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  var mdy = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (mdy) return validIsoOrEmpty_(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));

  var md = token.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (md) {
    var year = Number(today.slice(0, 4));
    var candidate = validIsoOrEmpty_(year, Number(md[1]), Number(md[2]));
    if (!candidate) return '';
    if (candidate > today) return validIsoOrEmpty_(year - 1, Number(md[1]), Number(md[2]));
    return candidate;
  }
  return '';
}

function validIsoOrEmpty_(year, month, day) {
  if (year < 1990 || year > 2100) return '';
  if (!isValidYmd_(year, month, day)) return '';
  return pad4_(year) + '-' + pad2_(month) + '-' + pad2_(day);
}

function isValidYmd_(year, month, day) {
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function shiftIsoDate(iso, days) {
  var parts = String(iso).split('-').map(Number);
  if (parts.length !== 3 || parts.some(function (n) { return !n && n !== 0; })) return '';
  var shifted = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return shifted.toISOString().slice(0, 10);
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}

function pad4_(value) {
  return String(value).padStart(4, '0');
}

function todayIsoInTimeZone(date, timeZone) {
  var zone = safeTimeZone(timeZone);
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  var year = '';
  var month = '';
  var day = '';
  parts.forEach(function (part) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  });
  return year + '-' + month + '-' + day;
}

function formatTaipeiTimestamp(date) {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  var bag = {};
  parts.forEach(function (part) {
    bag[part.type] = part.value;
  });
  return bag.year + '-' + bag.month + '-' + bag.day + ' ' + bag.hour + ':' + bag.minute + ':' + bag.second;
}

function safeTimeZone(timeZone) {
  var fallback = 'Asia/Taipei';
  if (typeof timeZone !== 'string' || !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timeZone)) return fallback;
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: timeZone }).format(new Date());
    return timeZone;
  } catch (err) {
    return fallback;
  }
}

function categoriesFromRows(rows) {
  return (rows || []).map(function (row) {
    return {
      name: String(row[0] || '').trim(),
      keywords: String(row[1] || '').split(/[,，]/).map(function (word) {
        return word.trim();
      }).filter(Boolean),
      sort: Number(row[2]) || 0
    };
  }).filter(function (row) {
    return row.name;
  }).sort(function (a, b) {
    return a.sort - b.sort;
  });
}

function settingsFromRows(rows) {
  var keys = schemaConstant_('SETTING_KEYS', {});
  var defaults = schemaConstant_('DEFAULT_SETTINGS', {});
  var map = {};
  (rows || []).forEach(function (row) {
    if (row && row[0] != null && String(row[0]).trim() !== '') map[String(row[0]).trim()] = row[1];
  });
  function pick(key, fallback) {
    var value = map[key];
    if (value == null || String(value).trim() === '') return fallback;
    return String(value).trim();
  }
  var currency = pick(keys.currency, defaults.currency).toUpperCase();
  if (!isAllowedCurrency(currency)) currency = defaults.currency;
  var marker = pick(keys.logMarker, defaults.logMarker);
  if (!/^[\u4e00-\u9fffA-Za-z]{1,12}$/.test(marker)) marker = defaults.logMarker;
  var calendarName = pick(keys.calendarName, defaults.calendarName).replace(/[\u0000-\u001F]/g, '').trim();
  if (!calendarName || /^[=+\-@＝＋－＠]/.test(calendarName) || calendarName.length > 40) {
    calendarName = defaults.calendarName;
  }
  var payment = pick(keys.payment, defaults.payment);
  if (!isSafeCode_(payment)) payment = defaults.payment;
  return {
    currency: currency,
    payment: payment,
    logMarker: marker,
    calendarName: calendarName,
    timeZone: safeTimeZone(pick(keys.timeZone, defaults.timeZone))
  };
}

function sheetsSerialToIso(serial) {
  if (typeof serial !== 'number' || !isFinite(serial)) return '';
  var whole = Math.floor(serial);
  var ms = Math.round((whole - 25569) * 86400 * 1000);
  var iso = new Date(ms).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}

function paymentsFromRows(rows) {
  return (rows || []).map(function (row) {
    var enabled = row[3];
    var isEnabled = enabled === true || String(enabled).toUpperCase() === 'TRUE' || enabled === '' || enabled === undefined;
    if (String(enabled).toUpperCase() === 'FALSE') isEnabled = false;
    return {
      code: String(row[0] || '').trim(),
      name: String(row[1] || '').trim(),
      sort: Number(row[2]) || 0,
      enabled: isEnabled,
      type: String(row[4] || '').trim(),
      accountCode: String(row[5] || '').trim(),
      cardCode: String(row[6] || '').trim(),
      aliases: String(row[7] || '').split(/[,，]/).map(function (word) {
        return word.trim();
      }).filter(Boolean)
    };
  }).filter(function (row) {
    return row.enabled && row.code && isSafeCode_(row.code);
  }).sort(function (a, b) {
    return a.sort - b.sort;
  });
}

function isSafeCode_(code) {
  return /^[\u4e00-\u9fffA-Za-z0-9_-]{1,32}$/.test(code);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseEntry: parseEntry,
    normalizeEntryLine: normalizeEntryLine,
    normalizeMerchantKey: normalizeMerchantKey,
    matchPaymentToken: matchPaymentToken,
    matchCurrencyToken: matchCurrencyToken,
    isAllowedCurrency: isAllowedCurrency,
    isTransferCode: isTransferCode,
    guessCategory: guessCategory,
    resolveDateToken: resolveDateToken,
    shiftIsoDate: shiftIsoDate,
    todayIsoInTimeZone: todayIsoInTimeZone,
    formatTaipeiTimestamp: formatTaipeiTimestamp,
    safeTimeZone: safeTimeZone,
    categoriesFromRows: categoriesFromRows,
    paymentsFromRows: paymentsFromRows,
    parseAmountToken: parseAmountToken,
    sheetsSerialToIso: sheetsSerialToIso,
    settingsFromRows: settingsFromRows
  };
}
