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
