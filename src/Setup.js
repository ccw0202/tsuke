/**
 * Creates the ledger in the owner's Drive and fills starter rows.
 * Safe to run again: existing payments, categories, and entries are left in place.
 */

function setupTsuke() {
  try {
    requireAdvancedServices_();
    return withScriptLock_(function () {
      var created = false;
      var id = currentSpreadsheetId_();
      if (!id) {
        id = createLedger_();
        created = true;
      }
      ensureLedger_(id);
      var logNote = '日誌日曆已準備。';
      try {
        ensureLogCalendar_(LOG_CALENDAR_NAME);
      } catch (err) {
        logPrivate_(err);
        logNote = '日誌日曆尚未建立。請確認已授權日曆後，再執行一次 setupTsuke。';
      }
      var spendNote = '花費日曆「' + SPEND_CALENDAR_NAME + '」已準備。';
      try {
        ensureSpendCalendar_(SPEND_CALENDAR_NAME);
      } catch (err) {
        logPrivate_(err);
        spendNote = '花費日曆尚未建立。請確認已授權日曆後，再執行一次 setupTsuke。';
      }
      try {
        ensureSpendDeleteTrigger_();
      } catch (err) {
        logPrivate_(err);
        return {
          ok: false,
          message: '帳本已準備，但每小時核對沒有排上。請重新授權後再執行一次 setupTsuke。這項授權只用來管理這個專案自己的觸發條件。',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit'
        };
      }
      var triggerNote = '已安排每小時核對「' + SPEND_CALENDAR_NAME + '」。';
      return {
        ok: true,
        message: (created ? '已建立帳本。' : '已檢查帳本。') + '付款方式的卡片名稱是範例，請改成你自己的。' + logNote + spendNote + triggerNote,
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit'
      };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '設定失敗，請稍後再試。' };
  }
}

function refreshMonthlyChart() {
  try {
    requireAdvancedServices_();
    return withScriptLock_(function () {
      var id = requireLedgerId_();
      var monthly = monthlySheetFormulas();
      var formulaRow = [monthly.months].concat(monthly.categories, [monthly.total, monthly.count]);
      Sheets.Spreadsheets.Values.batchUpdate({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: SHEET_NAMES.MONTHLY + '!A1', values: [['月份統計']] },
          { range: SHEET_NAMES.MONTHLY + '!A3:J3', values: [monthly.headers] },
          { range: SHEET_NAMES.MONTHLY + '!A4:J4', values: [formulaRow] }
        ]
      }, id);
      var sheet = sheetMap_(id)[SHEET_NAMES.MONTHLY];
      if (!sheet) throw userFacingError_('找不到月份統計表。');
      var requests = (sheet.charts || []).map(function (chart) {
        return { deleteEmbeddedObject: { objectId: chart.chartId } };
      });
      requests.push({ addChart: { chart: monthlyChartSpec_(sheet.properties.sheetId) } });
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
      return { ok: true, message: '月份統計已更新。' };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '月份統計更新失敗。' };
  }
}

function createLedger_() {
  var titles = [
    SHEET_NAMES.GUIDE,
    SHEET_NAMES.ENTRIES,
    SHEET_NAMES.MONTHLY,
    SHEET_NAMES.TAGS,
    SHEET_NAMES.PAYMENTS,
    SHEET_NAMES.CATEGORIES,
    SHEET_NAMES.MEMORY,
    SHEET_NAMES.SETTINGS
  ];
  var created = Sheets.Spreadsheets.create({
    properties: {
      title: LEDGER_TITLE,
      locale: 'zh_TW',
      timeZone: TIME_ZONE
    },
    sheets: titles.map(function (title, index) {
      return {
        properties: {
          title: title,
          index: index,
          gridProperties: { frozenRowCount: frozenRowsFor_(title) }
        }
      };
    })
  });
  var id = created && created.spreadsheetId;
  if (!isSpreadsheetIdShape_(id)) throw userFacingError_('沒有建立帳本。');
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.SPREADSHEET_ID, id);
  return id;
}

function ensureLedger_(id) {
  var meta = sheetMap_(id);
  var missing = requiredSheetTitles_().filter(function (title) { return !meta[title]; });
  if (missing.length) {
    Sheets.Spreadsheets.batchUpdate({
      requests: missing.map(function (title) {
        return {
          addSheet: {
            properties: {
              title: title,
              gridProperties: { frozenRowCount: frozenRowsFor_(title) }
            }
          }
        };
      })
    }, id);
    meta = sheetMap_(id);
  }
  seedLedgerValues_(id);
  formatLedger_(id, meta);
  var monthly = meta[SHEET_NAMES.MONTHLY];
  if (monthly && !(monthly.charts || []).length) {
    Sheets.Spreadsheets.batchUpdate({
      requests: [{ addChart: { chart: monthlyChartSpec_(monthly.properties.sheetId) } }]
    }, id);
  }
}

function seedLedgerValues_(id) {
  var probe = Sheets.Spreadsheets.Values.batchGet(id, {
    ranges: [
      SHEET_NAMES.GUIDE + '!A1',
      SHEET_NAMES.ENTRIES + '!A1',
      SHEET_NAMES.MONTHLY + '!A3',
      SHEET_NAMES.MONTHLY + '!A4',
      SHEET_NAMES.TAGS + '!A1',
      SHEET_NAMES.TAGS + '!E2',
      SHEET_NAMES.PAYMENTS + '!A1',
      SHEET_NAMES.PAYMENTS + '!A2',
      SHEET_NAMES.CATEGORIES + '!A1',
      SHEET_NAMES.CATEGORIES + '!A2',
      SHEET_NAMES.MEMORY + '!A1',
      SHEET_NAMES.SETTINGS + '!A1',
      SHEET_NAMES.SETTINGS + '!A2:A30',
      SHEET_NAMES.ENTRIES + '!' + columnLetter_(ENTRY_COL.TIME) + '1:' + columnLetter_(ENTRY_COL.STATUS) + '1'
    ],
    valueRenderOption: 'FORMULA'
  });
  var cells = (probe.valueRanges || []).map(function (part) { return part.values || []; });
  var data = [];
  function put(range, rows) {
    data.push({ range: range, values: rows });
  }
  if (!firstCell_(cells[0])) put(SHEET_NAMES.GUIDE + '!A1:A' + GUIDE_LINES.length, GUIDE_LINES);
  if (!firstCell_(cells[1])) put(SHEET_NAMES.ENTRIES + '!A1:' + columnLetter_(ENTRY_HEADERS.length) + '1', [ENTRY_HEADERS]);
  var eventHeader = (cells[13] && cells[13][0]) || [];
  var timeHeader = ENTRY_HEADERS[ENTRY_COL.TIME - 1];
  var eventIdHeader = ENTRY_HEADERS[ENTRY_COL.EVENT_ID - 1];
  if (firstCell_(cells[1]) && (String(eventHeader[0] || '') !== timeHeader || String(eventHeader[1] || '') !== eventIdHeader)) {
    put(
      SHEET_NAMES.ENTRIES + '!' + columnLetter_(ENTRY_COL.TIME) + '1:' + columnLetter_(ENTRY_COL.EVENT_ID) + '1',
      [[timeHeader, eventIdHeader]]
    );
  }
  var statusTitle = ENTRY_HEADERS[ENTRY_COL.STATUS - 1];
  if (firstCell_(cells[1]) && String(eventHeader[2] || '') !== statusTitle) {
    put(SHEET_NAMES.ENTRIES + '!' + columnLetter_(ENTRY_COL.STATUS) + '1', [[statusTitle]]);
    var migratedMonthly = monthlySheetFormulas();
    put(
      SHEET_NAMES.MONTHLY + '!A4:J4',
      [[migratedMonthly.months].concat(migratedMonthly.categories, [migratedMonthly.total, migratedMonthly.count])]
    );
    var migratedTags = tagTotalFormulas();
    put(SHEET_NAMES.TAGS + '!E2:F2', [[migratedTags.total, migratedTags.count]]);
  }
  var monthly = monthlySheetFormulas();
  if (!firstCell_(cells[2])) {
    put(SHEET_NAMES.MONTHLY + '!A1', [['月份統計']]);
    put(SHEET_NAMES.MONTHLY + '!A3:J3', [monthly.headers]);
  }
  if (!firstCell_(cells[3])) {
    put(SHEET_NAMES.MONTHLY + '!A4:J4', [[monthly.months].concat(monthly.categories, [monthly.total, monthly.count])]);
  }
  if (!firstCell_(cells[4])) put(SHEET_NAMES.TAGS + '!A1:F1', [TAG_HEADERS]);
  if (!firstCell_(cells[5])) {
    var tagFormulas = tagTotalFormulas();
    put(SHEET_NAMES.TAGS + '!E2:F2', [[tagFormulas.total, tagFormulas.count]]);
  }
  if (!firstCell_(cells[6])) put(SHEET_NAMES.PAYMENTS + '!A1:H1', [PAYMENT_HEADERS]);
  if (!firstCell_(cells[7])) put(SHEET_NAMES.PAYMENTS + '!A2:H' + (EXAMPLE_PAYMENTS.length + 1), EXAMPLE_PAYMENTS);
  if (!firstCell_(cells[8])) put(SHEET_NAMES.CATEGORIES + '!A1:C1', [CATEGORY_HEADERS]);
  if (!firstCell_(cells[9])) put(SHEET_NAMES.CATEGORIES + '!A2:C' + (DEFAULT_CATEGORIES.length + 1), DEFAULT_CATEGORIES);
  if (!firstCell_(cells[10])) put(SHEET_NAMES.MEMORY + '!A1:D1', [MEMORY_HEADERS]);
  if (!firstCell_(cells[11])) put(SHEET_NAMES.SETTINGS + '!A1:C1', [SETTING_HEADERS]);
  var present = {};
  (cells[12] || []).forEach(function (row) {
    if (row && row[0]) present[String(row[0])] = true;
  });
  var missingSettings = settingSeedRows_().filter(function (row) { return !present[row[0]]; });
  if (missingSettings.length) {
    var start = (cells[12] || []).length + 2;
    put(SHEET_NAMES.SETTINGS + '!A' + start + ':C' + (start + missingSettings.length - 1), missingSettings);
  }
  if (!data.length) return;
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'USER_ENTERED', data: data }, id);
}

function ensureSpendDeleteTrigger_() {
  var handler = 'syncDeletedSpendEvents';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) return;
  }
  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
}

function settingSeedRows_() {
  return [
    [SETTING_KEYS.currency, DEFAULT_SETTINGS.currency, '記帳時沒寫幣別就用這個。'],
    [SETTING_KEYS.payment, DEFAULT_SETTINGS.payment, '沒點付款按鈕、也沒有上次紀錄時使用。範例代碼，可改。'],
    [SETTING_KEYS.logMarker, DEFAULT_SETTINGS.logMarker, '句子用這個詞開頭就寫進日誌日曆。'],
    [SETTING_KEYS.calendarName, DEFAULT_SETTINGS.calendarName, '第一次建立日誌日曆時使用的名稱。'],
    [SETTING_KEYS.timeZone, DEFAULT_SETTINGS.timeZone, '「今天」的時區。'],
    [SETTING_KEYS.spendEvents, DEFAULT_SETTINGS.spendEvents, 'TRUE 時每一筆帳會在「Tsuke 花費」日曆建事件。改成 FALSE 就停止，不會動到主日曆，也不會因為日曆上的刪除去改帳本。改完舊帳後執行 syncSpendCalendar。']
  ];
}

function formatLedger_(id, meta) {
  var requests = [];
  requiredSheetTitles_().forEach(function (title) {
    var sheet = meta[title];
    if (!sheet) return;
    var sheetId = sheet.properties.sheetId;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sheetId, gridProperties: { frozenRowCount: frozenRowsFor_(title) } },
        fields: 'gridProperties.frozenRowCount'
      }
    });
    if (title === SHEET_NAMES.GUIDE) return;
    requests.push({
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.96, green: 0.93, blue: 0.86 }
          }
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)'
      }
    });
  });
  var entries = meta[SHEET_NAMES.ENTRIES];
  if (entries) {
    var entryId = entries.properties.sheetId;
    requests = requests.concat(textColumns_(entryId, [2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]));
    requests.push(dateColumn_(entryId, ENTRY_COL.DATE));
    requests.push(numberColumn_(entryId, ENTRY_COL.AMOUNT));
    requests.push(numberColumn_(entryId, ENTRY_COL.TWD));
    requests = requests.concat(columnWidths_(entryId, [110, 160, 90, 70, 110, 80, 110, 150, 110, 110, 140, 180, 140, 160, 80, 180, 90]));
  }
  var payments = meta[SHEET_NAMES.PAYMENTS];
  if (payments) requests = requests.concat(textColumns_(payments.properties.sheetId, [1, 2, 4, 5, 6, 7, 8]));
  var categories = meta[SHEET_NAMES.CATEGORIES];
  if (categories) requests = requests.concat(textColumns_(categories.properties.sheetId, [1, 2]));
  var tags = meta[SHEET_NAMES.TAGS];
  if (tags) {
    requests = requests.concat(textColumns_(tags.properties.sheetId, [1, 4]));
    requests.push(dateColumn_(tags.properties.sheetId, 2));
    requests.push(dateColumn_(tags.properties.sheetId, 3));
    requests.push(numberColumn_(tags.properties.sheetId, 5));
    requests.push(numberColumn_(tags.properties.sheetId, 6));
  }
  var settings = meta[SHEET_NAMES.SETTINGS];
  if (settings) requests = requests.concat(textColumns_(settings.properties.sheetId, [1, 2, 3]));
  var memory = meta[SHEET_NAMES.MEMORY];
  if (memory) requests = requests.concat(textColumns_(memory.properties.sheetId, [1, 2, 3, 4]));
  var guide = meta[SHEET_NAMES.GUIDE];
  if (guide) {
    requests.push({
      repeatCell: {
        range: { sheetId: guide.properties.sheetId, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    });
    requests = requests.concat(columnWidths_(guide.properties.sheetId, [720]));
  }
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
}

function monthlyChartSpec_(sheetId) {
  var series = [];
  for (var column = 1; column <= CATEGORY_NAMES.length; column++) {
    series.push({
      series: {
        sourceRange: {
          sources: [gridRange_(sheetId, 2, 40, column, column + 1)]
        }
      },
      targetAxis: 'LEFT_AXIS'
    });
  }
  return {
    spec: {
      title: '每月支出（約當台幣）',
      basicChart: {
        chartType: 'COLUMN',
        legendPosition: 'BOTTOM_LEGEND',
        stackedType: 'STACKED',
        headerCount: 1,
        axis: [
          { position: 'BOTTOM_AXIS', title: '月份' },
          { position: 'LEFT_AXIS', title: '約當台幣' }
        ],
        domains: [{ domain: { sourceRange: { sources: [gridRange_(sheetId, 2, 40, 0, 1)] } } }],
        series: series
      }
    },
    position: {
      overlayPosition: {
        anchorCell: { sheetId: sheetId, rowIndex: 2, columnIndex: 11 },
        widthPixels: 680,
        heightPixels: 380
      }
    }
  };
}

function gridRange_(sheetId, startRow, endRow, startColumn, endColumn) {
  return {
    sheetId: sheetId,
    startRowIndex: startRow,
    endRowIndex: endRow,
    startColumnIndex: startColumn,
    endColumnIndex: endColumn
  };
}

function textColumns_(sheetId, columns) {
  return columns.map(function (column) {
    return {
      repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: column - 1, endColumnIndex: column },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT', pattern: '@' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    };
  });
}

function dateColumn_(sheetId, column) {
  return {
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: column - 1, endColumnIndex: column },
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  };
}

function numberColumn_(sheetId, column) {
  return {
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 1, startColumnIndex: column - 1, endColumnIndex: column },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.##' } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  };
}

function columnWidths_(sheetId, widths) {
  return widths.map(function (width, index) {
    return {
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize'
      }
    };
  });
}

function sheetMap_(id) {
  var response = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties,charts)' });
  var map = {};
  (response.sheets || []).forEach(function (sheet) {
    map[sheet.properties.title] = sheet;
  });
  return map;
}

function requiredSheetTitles_() {
  return [
    SHEET_NAMES.GUIDE,
    SHEET_NAMES.ENTRIES,
    SHEET_NAMES.MONTHLY,
    SHEET_NAMES.TAGS,
    SHEET_NAMES.PAYMENTS,
    SHEET_NAMES.CATEGORIES,
    SHEET_NAMES.MEMORY,
    SHEET_NAMES.SETTINGS
  ];
}

function frozenRowsFor_(title) {
  if (title === SHEET_NAMES.GUIDE) return 0;
  if (title === SHEET_NAMES.MONTHLY) return 3;
  return 1;
}

function firstCell_(rows) {
  return rows && rows[0] && rows[0][0] !== '' && rows[0][0] != null;
}
