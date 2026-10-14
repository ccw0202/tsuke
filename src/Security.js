/**
 * Write-path guards. Sheet text that starts with a formula trigger is prefixed
 * so Sheets stores it as text. The TWD formula is built only from a row number.
 */

function guardSheetText(value, maxLength) {
  var limit = maxLength || 500;
  var text = String(value == null ? '' : value);
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '');
  if (text.length > limit) text = text.slice(0, limit);
  if (/^[\s\u3000]*[=+\-@＝＋－＠\t\r]/.test(text)) return "'" + text;
  return text;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assertPlainLine(line) {
  if (typeof line !== 'string') return { ok: false, message: '請輸入內容' };
  var text = line.trim();
  if (!text) return { ok: false, message: '請輸入內容' };
  if (text.length > 500) return { ok: false, message: '輸入過長' };
  return { ok: true, line: text };
}

function isIsoDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  var parts = value.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function isSafeAmount_(value) {
  return typeof value === 'number' && isFinite(value) && value !== 0 && Math.abs(value) < 1000000000;
}

function currencyAllowed_(code) {
  if (typeof isAllowedCurrency === 'function') return isAllowedCurrency(code);
  if (typeof module !== 'undefined' && module.exports) return require('./Parser.js').isAllowedCurrency(code);
  return false;
}

function amountColumnLetter_() {
  if (typeof ENTRY_COL !== 'undefined' && typeof columnLetter_ === 'function') return columnLetter_(ENTRY_COL.AMOUNT);
  if (typeof module !== 'undefined' && module.exports) {
    var schema = require('./Schema.js');
    return schema.columnLetter_(schema.ENTRY_COL.AMOUNT);
  }
  return 'C';
}

function currencyColumnLetter_() {
  if (typeof ENTRY_COL !== 'undefined' && typeof columnLetter_ === 'function') return columnLetter_(ENTRY_COL.CURRENCY);
  if (typeof module !== 'undefined' && module.exports) {
    var schema = require('./Schema.js');
    return schema.columnLetter_(schema.ENTRY_COL.CURRENCY);
  }
  return 'D';
}

function buildEstimatedTwdFormula(row) {
  if (!Number.isInteger(row) || row < 2 || row > 100000) {
    throw userFacingError_('帳列位置不正確');
  }
  var amount = amountColumnLetter_() + row;
  var currency = currencyColumnLetter_() + row;
  return '=IF(' + amount + '="","",IF(UPPER(' + currency + ')="TWD",' + amount +
    ',IFERROR(' + amount + '*INDEX(GOOGLEFINANCE("CURRENCY:"&UPPER(' + currency + ')&"TWD"),2,2),' +
    'IFERROR(' + amount + '*GOOGLEFINANCE("CURRENCY:"&UPPER(' + currency + ')&"TWD"),""))))';
}

function buildEntryRow(fields) {
  var input = fields || {};
  if (!isIsoDate_(input.date)) throw userFacingError_('日期不正確');
  if (!isSafeAmount_(input.amount)) throw userFacingError_('金額不合理');
  if (!currencyAllowed_(input.currency)) throw userFacingError_('不支援這個幣別');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(input.createdAt || ''))) {
    throw userFacingError_('時間不正確');
  }
  var clock = String(input.time || '');
  if (clock && !/^\d{2}:\d{2}$/.test(clock)) throw userFacingError_('時間不正確');
  var eventId = String(input.eventId || '').replace(/^'/, '');
  if (!isEventIdShape_(eventId)) eventId = '';
  return [
    input.date,
    guardSheetText(input.name, 80),
    input.amount,
    input.currency,
    buildEstimatedTwdFormula(input.row),
    guardSheetText(input.category, 40),
    guardSheetText(input.paymentCode, 32),
    guardSheetText(input.paymentName, 40),
    guardSheetText(input.accountCode, 32),
    guardSheetText(input.cardCode, 32),
    guardSheetText(input.tag, 120),
    guardSheetText(input.note, 200),
    guardSheetText(input.merchantKey, 80),
    input.createdAt,
    clock,
    eventId
  ];
}

function userFacingError_(message) {
  var error = new Error(message);
  error.userFacing = true;
  return error;
}

function formulaSchema_() {
  if (typeof ENTRY_COL !== 'undefined' && typeof SHEET_NAMES !== 'undefined' && typeof columnLetter_ === 'function') {
    return {
      ENTRY_COL: ENTRY_COL,
      SHEET_NAMES: SHEET_NAMES,
      CATEGORY_NAMES: CATEGORY_NAMES,
      columnLetter_: columnLetter_
    };
  }
  return require('./Schema.js');
}

function assertSafeCategoryName_(name) {
  if (!/^[\u4e00-\u9fffA-Za-z0-9]{1,20}$/.test(name)) {
    throw userFacingError_('分類名稱無法寫進公式');
  }
}

function monthlySheetFormulas() {
  var schema = formulaSchema_();
  var entry = schema.SHEET_NAMES.ENTRIES;
  var dateCol = schema.columnLetter_(schema.ENTRY_COL.DATE);
  var nameCol = schema.columnLetter_(schema.ENTRY_COL.NAME);
  var twdCol = schema.columnLetter_(schema.ENTRY_COL.TWD);
  var categoryCol = schema.columnLetter_(schema.ENTRY_COL.CATEGORY);
  var monthExpr = 'TEXT(' + entry + '!' + dateCol + '2:' + dateCol + ',"yyyy-mm")';
  var headers = ['月份'].concat(schema.CATEGORY_NAMES, ['合計', '筆數']);
  var categories = schema.CATEGORY_NAMES.map(function (name) {
    assertSafeCategoryName_(name);
    return '=MAP(A4:A200,LAMBDA(m,IF(m="",,IFERROR(SUM(FILTER(' + entry + '!' + twdCol + '2:' + twdCol +
      ',' + monthExpr + '=m,' + entry + '!' + categoryCol + '2:' + categoryCol + '="' + name + '")),0))))';
  });
  return {
    headers: headers,
    months: '=IFERROR(SORT(UNIQUE(FILTER(' + monthExpr + ',' + entry + '!' + dateCol + '2:' + dateCol + '<>"")),1,FALSE),"")',
    categories: categories,
    total: '=MAP(A4:A200,LAMBDA(m,IF(m="",,IFERROR(SUM(FILTER(' + entry + '!' + twdCol + '2:' + twdCol + ',' + monthExpr + '=m)),0))))',
    count: '=MAP(A4:A200,LAMBDA(m,IF(m="",,IFERROR(COUNTA(FILTER(' + entry + '!' + nameCol + '2:' + nameCol + ',' + monthExpr + '=m)),0))))'
  };
}

function tagTotalFormulas() {
  var schema = formulaSchema_();
  var entry = schema.SHEET_NAMES.ENTRIES;
  var nameCol = schema.columnLetter_(schema.ENTRY_COL.NAME);
  var twdCol = schema.columnLetter_(schema.ENTRY_COL.TWD);
  var tagCol = schema.columnLetter_(schema.ENTRY_COL.TAG);
  var probe = 'ISNUMBER(SEARCH("、"&name&"、","、"&' + entry + '!' + tagCol + '2:' + tagCol + '&"、"))';
  return {
    total: '=MAP(A2:A300,LAMBDA(name,IF(name="",,IFERROR(SUM(FILTER(' + entry + '!' + twdCol + '2:' + twdCol + ',' + probe + ')),0))))',
    count: '=MAP(A2:A300,LAMBDA(name,IF(name="",,IFERROR(COUNTA(FILTER(' + entry + '!' + nameCol + '2:' + nameCol + ',' + probe + ')),0))))'
  };
}

function cleanQuery_(query) {
  var text = String(query || '').replace(/[\u0000-\u001F\u202A-\u202E\u2066-\u2069]/g, '').trim();
  if (!text) return { ok: false, message: '請輸入關鍵字' };
  if (text.length > 80) return { ok: false, message: '關鍵字過長' };
  return { ok: true, query: text };
}

function clipText_(value, maxLength) {
  var text = String(value == null ? '' : value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

function isSpreadsheetIdShape_(value) {
  return /^[a-zA-Z0-9_-]{20,80}$/.test(String(value || ''));
}

function isCalendarIdShape_(value) {
  return /^[A-Za-z0-9._@-]{10,200}$/.test(String(value || ''));
}

function isEventIdShape_(value) {
  return /^[A-Za-z0-9_-]{5,128}$/.test(String(value || ''));
}

function isScriptWebAppUrl_(value) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value || ''));
}

/**
 * Maps a caught error to a card or web reply. The raw message can contain a
 * spreadsheet id, so only a closed set of sentences is returned.
 */
function serviceFailureMessage_(err, fallback) {
  if (err && err.userFacing && typeof err.message === 'string') return err.message;
  var text = String(err && (err.message || err));
  if (/PERMISSION_DENIED|does not have permission|You do not have permission|Authorization is required|Specified permissions are not sufficient/i.test(text)) {
    return '日曆側欄尚未取得帳本授權。請到 Apps Script 專案設定解除授權，再從「測試部署」移除並重新安裝，然後同意授權。';
  }
  return fallback;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    guardSheetText: guardSheetText,
    escapeHtml: escapeHtml,
    assertPlainLine: assertPlainLine,
    buildEstimatedTwdFormula: buildEstimatedTwdFormula,
    buildEntryRow: buildEntryRow,
    clipText_: clipText_,
    isSpreadsheetIdShape_: isSpreadsheetIdShape_,
    isCalendarIdShape_: isCalendarIdShape_,
    isEventIdShape_: isEventIdShape_,
    isScriptWebAppUrl_: isScriptWebAppUrl_,
    serviceFailureMessage_: serviceFailureMessage_,
    monthlySheetFormulas: monthlySheetFormulas,
    tagTotalFormulas: tagTotalFormulas,
    cleanQuery_: cleanQuery_
  };
}
