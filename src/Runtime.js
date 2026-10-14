/**
 * Lock and private logging. User-facing replies never include exception text,
 * because Apps Script errors can contain spreadsheet or calendar ids.
 */

function logPrivate_(err) {
  try {
    console.error(err && err.stack ? err.stack : err);
  } catch (ignore) {
    /* Logging is best-effort. */
  }
}

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, message: '系統忙碌，請再試一次。' };
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * clasp create --rootDir . replaces appsscript.json with a default manifest,
 * which leaves the Sheets and Calendar advanced services undefined.
 */
function requireAdvancedServices_() {
  if (typeof Sheets === 'undefined' || typeof Calendar === 'undefined') {
    throw userFacingError_(
      '進階服務 Sheets 或 Calendar 尚未啟用。若 clasp create 覆蓋了 appsscript.json，請執行 git checkout -- appsscript.json，再 clasp push，然後重新執行 setupTsuke。'
    );
  }
}
