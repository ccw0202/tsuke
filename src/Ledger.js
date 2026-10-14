/**
 * Ledger reads and writes. Spreadsheet access goes through the Sheets API
 * under the drive.file scope, which only covers files this script created.
 * addEntry is the shared write path for the web app, the Calendar sidebar,
 * and later importers.
 */

function addEntry(line, options) {
  var checked = assertPlainLine(typeof line === 'string' ? line : '');
  if (!checked.ok) return { ok: false, message: checked.message };
  try {
    return withScriptLock_(function () {
      return writeParsedEntry_(checked.line, options || {});
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '沒有記下，請稍後再試。' };
  }
}

function previewEntry(line) {
  try {
    var checked = assertPlainLine(typeof line === 'string' ? line : '');
    if (!checked.ok) return { ok: false, message: checked.message };
    var ctx = loadLedgerContext_();
    var parsed = parseWithContext_(checked.line, ctx);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    if (parsed.type === 'log') {
      return {
        ok: true,
        type: 'log',
        date: parsed.date,
        text: parsed.text,
        summary: '日誌 · ' + parsed.date + ' · ' + parsed.text
      };
    }
    var explicit = resolvePayment({
      payments: ctx.payments,
      explicitCode: parsed.explicitPaymentCode,
      explicitSynthetic: parsed.explicitSynthetic,
      explicitOnly: true
    });
    var suggested = resolvePayment({
      payments: ctx.payments,
      explicitCode: '',
      pinned: false,
      rememberedCode: ctx.memory[parsed.merchantKey] || '',
      defaultCode: ctx.settings.payment
    });
    return {
      ok: true,
      type: 'expense',
      date: parsed.date,
      name: parsed.name,
      merchantKey: parsed.merchantKey,
      amount: parsed.amount,
      currency: parsed.currency,
      category: parsed.category,
      categorySource: parsed.categorySource || '',
      note: parsed.note,
      tag: parsed.tag,
      explicitPaymentCode: explicit ? explicit.code : '',
      explicitPaymentName: explicit ? explicit.name : '',
      suggestedPaymentCode: suggested ? suggested.code : '',
      time: parsed.time || '',
      summary: parsed.date + (parsed.time ? ' ' + parsed.time : '') + ' · ' + parsed.name + ' ' + parsed.amount + ' ' + parsed.currency + ' · ' + parsed.category
    };
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '無法預覽，請稍後再試。' };
  }
}

function searchEntries(query) {
  var cleaned = cleanQuery_(query);
  if (!cleaned.ok) return { ok: false, message: cleaned.message, matches: [] };
  try {
    var found = searchEntryList(readAllEntries_(), cleaned.query);
    return {
      ok: true,
      count: found.length,
      matches: found.slice(-30).reverse().map(publicEntry_),
      message: '找到 ' + found.length + ' 筆'
    };
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message, matches: [] };
    logPrivate_(err);
    return { ok: false, message: '搜尋失敗，請稍後再試。', matches: [] };
  }
}

function listTagEntries(name) {
  var cleaned = cleanQuery_(name);
  if (!cleaned.ok) return { ok: false, message: '請輸入標籤', matches: [] };
  try {
    var summary = summarizeTag(cleaned.query, readAllEntries_());
    return {
      ok: true,
      name: summary.name,
      total: summary.total,
      count: summary.entries.length,
      matches: summary.entries.slice(-30).reverse().map(publicEntry_),
      message: summary.name + ' · ' + summary.entries.length + ' 筆 · 約 ' + summary.total + ' TWD'
    };
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message, matches: [] };
    logPrivate_(err);
    return { ok: false, message: '無法讀取標籤，請稍後再試。', matches: [] };
  }
}

function loadWebState_() {
  var ctx = loadLedgerContext_();
  return {
    payments: ctx.payments.slice(0, 24).map(function (payment) {
      return { code: payment.code, name: payment.name };
    }),
    categories: chipCategories_(ctx.categories),
    currencies: ALLOWED_CURRENCIES.slice(),
    defaultPaymentCode: ctx.settings.payment,
    recent: readAllEntries_().slice(-8).reverse().map(publicEntry_)
  };
}

function updateEntryFromWeb(rowNumber, createdAt, name, amountText, currency, categoryName, paymentCode) {
  try {
    return withScriptLock_(function () {
      var ctx = loadLedgerContext_();
      var existing = readEntryAt_(ctx.id, rowNumber);
      var guard = guardStoredEntry_(existing, createdAt);
      if (!guard.ok) return { ok: false, message: guard.message };
      var plan = planEntryUpdate_(existing, {
        name: name,
        amountText: amountText,
        currency: currency,
        categoryName: categoryName,
        paymentCode: paymentCode
      }, {
        payments: ctx.payments,
        categories: ctx.categories,
        timeZone: ctx.settings.timeZone
      });
      if (!plan.ok) return { ok: false, message: plan.message };
      writeEntryCells_(ctx.id, plan.rowNumber, plan.cells);
      if (plan.remember) {
        rememberPayment_(ctx.id, plan.remember.merchantKey, plan.remember.name, plan.remember.paymentCode, formatTaipeiTimestamp(new Date()));
      }
      var calendarNote = '';
      if (ctx.settings.spendEvents) {
        var refreshed = updateSpendEvent_(ctx.id, plan.rowNumber, {
          spendEvents: true,
          eventId: existing.eventId,
          date: plan.calendar.date,
          time: plan.calendar.time,
          name: plan.calendar.name,
          amount: plan.calendar.amount,
          currency: plan.calendar.currency,
          twd: plan.calendar.twd,
          timeZone: plan.calendar.timeZone
        });
        calendarNote = refreshed.ok ? '已更新「' + SPEND_CALENDAR_NAME + '」。' : '帳已改，花費日曆沒有更新。';
      }
      return { ok: true, message: '已更新。' + calendarNote };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '沒有改到，請稍後再試。' };
  }
}

function deleteEntryFromWeb(rowNumber, createdAt, confirmed) {
  if (confirmed !== true) return { ok: false, message: '請再按一次確定刪除。' };
  try {
    return withScriptLock_(function () {
      var ctx = loadLedgerContext_();
      var existing = readEntryAt_(ctx.id, rowNumber);
      var guard = guardStoredEntry_(existing, createdAt);
      if (!guard.ok) return { ok: false, message: guard.message };
      if (ctx.settings.spendEvents && existing.eventId) {
        var removed = removeSpendEvent_(existing.eventId);
        if (!removed.ok) return { ok: false, message: '沒有刪除。花費日曆沒有改。' };
      }
      writeSpendDeletes_(ctx.id, [{ rowNumber: existing.rowNumber }]);
      return { ok: true, message: '已刪除。' };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '沒有刪除，請稍後再試。' };
  }
}

function writeParsedEntry_(line, options) {
  var ctx = loadLedgerContext_();
  var parsed = parseWithContext_(line, ctx);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (parsed.type === 'log') {
    writeDailyLog_(parsed.text, parsed.date, ctx.settings.calendarName);
    return {
      ok: true,
      type: 'log',
      message: '已寫入日曆「' + ctx.settings.calendarName + '」：' + parsed.text
    };
  }
  var payment = resolvePayment({
    payments: ctx.payments,
    explicitCode: parsed.explicitPaymentCode,
    explicitSynthetic: parsed.explicitSynthetic,
    pinned: options.paymentPinned === true,
    hintCode: typeof options.paymentCode === 'string' ? options.paymentCode : '',
    rememberedCode: ctx.memory[parsed.merchantKey] || '',
    defaultCode: ctx.settings.payment
  });
  if (!payment) throw userFacingError_('請先在「付款方式」表新增至少一個付款方式。');
  var category = chooseCategory_(parsed, options, ctx.categories);
  var tag = mergeTagNames(parsed.tag, tagsForDate(parsed.date, ctx.tags));
  var createdAt = formatTaipeiTimestamp(new Date());
  var rowNumber = nextEntryRow_(ctx.id);
  var row = buildEntryRow({
    row: rowNumber,
    date: parsed.date,
    name: parsed.name,
    amount: parsed.amount,
    currency: parsed.currency,
    category: category,
    paymentCode: payment.code,
    paymentName: payment.name,
    accountCode: payment.accountCode || '',
    cardCode: payment.cardCode || '',
    tag: tag,
    note: parsed.note,
    merchantKey: parsed.merchantKey,
    createdAt: createdAt,
    time: parsed.time || '',
    eventId: ''
  });
  writeEntryRow_(ctx.id, rowNumber, row);
  if (parsed.name !== UNNAMED_ITEM) rememberPayment_(ctx.id, parsed.merchantKey, parsed.name, payment.code, createdAt);
  var spendNote = '';
  if (ctx.settings.spendEvents) {
    var eventId = '';
    try {
      eventId = mirrorSpendEntry_(ctx.id, rowNumber, {
        date: parsed.date,
        time: parsed.time || '',
        name: parsed.name,
        amount: parsed.amount,
        currency: parsed.currency,
        twd: parsed.currency === 'TWD' ? parsed.amount : null,
        timeZone: ctx.settings.timeZone,
        spendEvents: true
      });
    } catch (err) {
      logPrivate_(err);
    }
    spendNote = eventId ? '已寫入「' + SPEND_CALENDAR_NAME + '」。' : '花費日曆沒有寫入。';
  }
  return {
    ok: true,
    type: 'expense',
    message: '已記下：' + parsed.date + (parsed.time ? ' ' + parsed.time : '') + ' ' + parsed.name + ' ' + parsed.amount + ' ' + parsed.currency + ' · ' + category + ' · ' + payment.name + (spendNote ? '。' + spendNote : ''),
    entry: publicEntry_({
      date: parsed.date,
      name: parsed.name,
      amount: parsed.amount,
      currency: parsed.currency,
      twd: parsed.currency === 'TWD' ? parsed.amount : null,
      category: category,
      paymentName: payment.name,
      tag: tag
    })
  };
}

function parseWithContext_(line, ctx) {
  var today = todayIsoInTimeZone(new Date(), ctx.settings.timeZone);
  return parseEntry(line, {
    today: today,
    defaultCurrency: ctx.settings.currency,
    payments: ctx.payments,
    categories: ctx.categories,
    logMarkers: [ctx.settings.logMarker]
  });
}

function currentSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SPREADSHEET_ID) || '';
  return isSpreadsheetIdShape_(id) ? id : '';
}

function requireLedgerId_() {
  var id = currentSpreadsheetId_();
  if (!id) throw userFacingError_('找不到帳本。請先執行 setupTsuke。');
  return id;
}

function loadLedgerContext_() {
  requireAdvancedServices_();
  var id = requireLedgerId_();
  var parts = batchValues_(id, [
    SHEET_NAMES.SETTINGS + '!A2:B50',
    SHEET_NAMES.PAYMENTS + '!A2:H200',
    SHEET_NAMES.CATEGORIES + '!A2:C50',
    SHEET_NAMES.TAGS + '!A2:D300',
    SHEET_NAMES.MEMORY + '!A2:D1000',
    SHEET_NAMES.ENTRIES + '!A1:N1'
  ]);
  var header = (parts[5] && parts[5][0]) || [];
  if (header[0] !== ENTRY_HEADERS[0] || header[ENTRY_COL.TWD - 1] !== ENTRY_HEADERS[ENTRY_COL.TWD - 1]) {
    throw userFacingError_('帳本格式不符，請再執行 setupTsuke。');
  }
  var payments = paymentsFromRows(parts[1]);
  if (!payments.length) throw userFacingError_('請先在「付款方式」表新增至少一個付款方式。');
  var categories = categoriesFromRows(parts[2]);
  if (!categories.length) categories = categoriesFromRows(DEFAULT_CATEGORIES);
  return {
    id: id,
    settings: settingsFromRows(parts[0]),
    payments: payments,
    categories: categories,
    tags: tagsFromRows(parts[3]),
    memory: memoryFromRows(parts[4])
  };
}

function readAllEntries_() {
  requireAdvancedServices_();
  var id = requireLedgerId_();
  var values = sheetValues_(id, SHEET_NAMES.ENTRIES + '!A2:' + columnLetter_(ENTRY_HEADERS.length));
  var entries = [];
  values.forEach(function (row, index) {
    var parsed = entriesFromRows([row]);
    if (!parsed.length) return;
    parsed[0].rowNumber = index + 2;
    entries.push(parsed[0]);
  });
  return activeEntries_(entries);
}

function readEntryAt_(id, rowNumber) {
  var row = coerceRowNumber_(rowNumber);
  var values = sheetValues_(id, SHEET_NAMES.ENTRIES + '!A' + row + ':' + columnLetter_(ENTRY_HEADERS.length) + row);
  var parsed = entriesFromRows(values[0] ? [values[0]] : []);
  if (!parsed.length) throw userFacingError_('找不到這一筆。');
  parsed[0].rowNumber = row;
  return parsed[0];
}

function coerceRowNumber_(value) {
  var row = typeof value === 'number' ? value : Number(String(value == null ? '' : value).trim());
  if (!Number.isInteger(row) || row < 2 || row > 100000) throw userFacingError_('找不到這一筆。');
  return row;
}

function writeEntryCells_(id, rowNumber, cells) {
  var row = coerceRowNumber_(rowNumber);
  var data = (cells || []).map(function (cell) {
    if (!cell || !Number.isInteger(cell.column) || cell.column < 1) throw userFacingError_('帳列位置不正確');
    var letter = columnLetter_(cell.column);
    return { range: SHEET_NAMES.ENTRIES + '!' + letter + row, values: [[cell.value]] };
  });
  if (!data.length) return;
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'USER_ENTERED', data: data }, id);
}

function nextEntryRow_(id) {
  var column = sheetValues_(id, SHEET_NAMES.ENTRIES + '!A:A');
  return Math.max(column.length + 1, 2);
}

function writeEntryRow_(id, rowNumber, values) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw userFacingError_('帳列位置不正確');
  var end = columnLetter_(values.length);
  Sheets.Spreadsheets.Values.update(
    { values: [values] },
    id,
    SHEET_NAMES.ENTRIES + '!A' + rowNumber + ':' + end + rowNumber,
    { valueInputOption: 'USER_ENTERED' }
  );
}

function rememberPayment_(id, merchantKey, displayName, paymentCode, timestamp) {
  if (!merchantKey) return;
  var rows = sheetValues_(id, SHEET_NAMES.MEMORY + '!A2:D');
  var payload = [[
    guardSheetText(merchantKey, 80),
    guardSheetText(displayName, 80),
    guardSheetText(paymentCode, 32),
    timestamp
  ]];
  var rowNumber = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '') === merchantKey) {
      rowNumber = i + 2;
      break;
    }
  }
  if (!rowNumber) rowNumber = rows.length + 2;
  Sheets.Spreadsheets.Values.update(
    { values: payload },
    id,
    SHEET_NAMES.MEMORY + '!A' + rowNumber + ':D' + rowNumber,
    { valueInputOption: 'USER_ENTERED' }
  );
}

function sheetValues_(id, range) {
  var response = Sheets.Spreadsheets.Values.get(id, range, {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  return (response && response.values) || [];
}

function batchValues_(id, ranges) {
  var response = Sheets.Spreadsheets.Values.batchGet(id, {
    ranges: ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  return (response.valueRanges || []).map(function (part) {
    return part.values || [];
  });
}

function publicEntry_(entry) {
  return publicEntryFields_(entry);
}
