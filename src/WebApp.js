/**
 * Private web app. Deploy as USER_DEPLOYING / MYSELF.
 * The page is static; ledger text is inserted with textContent in the browser.
 */

function doGet(e) {
  var page = e && e.parameter ? String(e.parameter.page || '') : '';
  if (page === 'manifest') return manifestResponse_();
  // HtmlService ignores <meta name="viewport"> inside the file, so a phone
  // lays the page out at desktop width. addMetaTag is what the browser uses.
  return HtmlService.createHtmlOutputFromFile('src/Index')
    .setTitle('Tsuke')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function manifestResponse_() {
  var url = scriptWebAppUrl_();
  if (!url) return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  return ContentService
    .createTextOutput(JSON.stringify({
      name: 'Tsuke',
      short_name: 'Tsuke',
      lang: 'zh-Hant',
      display: 'standalone',
      start_url: url,
      scope: url,
      background_color: '#f4f0e6',
      theme_color: '#9c3418'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWebAppState() {
  try {
    var state = loadWebState_();
    state.ok = true;
    var url = scriptWebAppUrl_();
    state.manifestUrl = url ? url + '?page=manifest' : '';
    return state;
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message, payments: [], recent: [] };
    logPrivate_(err);
    return { ok: false, message: '帳本讀取失敗。請先執行 setupTsuke。', payments: [], recent: [] };
  }
}

function addEntryFromWeb(line, paymentCode, paymentPinned) {
  var code = typeof paymentCode === 'string' ? paymentCode.slice(0, 32) : '';
  return addEntry(line, {
    paymentCode: code,
    paymentPinned: paymentPinned === true,
    source: 'web'
  });
}

function addLogFromWeb(text) {
  var checked = assertPlainLine(typeof text === 'string' ? text : '');
  if (!checked.ok) return { ok: false, message: checked.message };
  try {
    return withScriptLock_(function () {
      var ctx = loadLedgerContext_();
      var body = plainLogBody_(checked.line, ctx.settings.logMarker);
      if (!body.ok) return body;
      var today = todayIsoInTimeZone(new Date(), ctx.settings.timeZone);
      writeDailyLog_(body.text, today, ctx.settings.calendarName);
      return { ok: true, message: '已寫入日曆「' + ctx.settings.calendarName + '」。' };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '日誌沒有寫入，請稍後再試。' };
  }
}

function addPlanFromWeb(title, date, time, withWhom, location) {
  try {
    return withScriptLock_(function () {
      var ctx = loadLedgerContext_();
      var today = todayIsoInTimeZone(new Date(), ctx.settings.timeZone);
      var fields = planFields_({
        title: webArg_(title, 80),
        date: webArg_(date, 10),
        time: webArg_(time, 8),
        withWhom: webArg_(withWhom, 40),
        location: webArg_(location, 80),
        today: today
      });
      if (!fields.ok) return fields;
      writePlanEvent_(fields, ctx.settings.timeZone);
      return { ok: true, message: '已寫入日曆「' + PLAN_CALENDAR_NAME + '」：' + fields.title };
    });
  } catch (err) {
    if (err && err.userFacing) return { ok: false, message: err.message };
    logPrivate_(err);
    return { ok: false, message: '活動沒有寫入，請稍後再試。' };
  }
}

function webArg_(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function scriptWebAppUrl_() {
  var url = '';
  try {
    url = ScriptApp.getService().getUrl() || '';
  } catch (err) {
    url = '';
  }
  return isScriptWebAppUrl_(url) ? url : '';
}
