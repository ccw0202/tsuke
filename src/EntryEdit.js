/**
 * Pure plan for editing one ledger row from the phone page.
 * The caller patches these cells only. Date, tag, note, created time,
 * clock time, and the calendar event id stay on the row.
 */

function entryEditSchema_() {
  if (typeof ENTRY_COL !== 'undefined' && typeof UNNAMED_ITEM !== 'undefined') {
    return { ENTRY_COL: ENTRY_COL, UNNAMED_ITEM: UNNAMED_ITEM };
  }
  return require('./Schema.js');
}

function entryEditParseAmount_(token) {
  if (typeof parseAmountToken === 'function') return parseAmountToken(token);
  return require('./Parser.js').parseAmountToken(token);
}

function entryEditCurrencyOk_(code) {
  if (typeof isAllowedCurrency === 'function') return isAllowedCurrency(code);
  return require('./Parser.js').isAllowedCurrency(code);
}

function entryEditMerchantKey_(name) {
  if (typeof normalizeMerchantKey === 'function') return normalizeMerchantKey(name);
  return require('./Parser.js').normalizeMerchantKey(name);
}

function entryEditCategory_(label, categories) {
  if (typeof knownChipCategory_ === 'function') return knownChipCategory_(label, categories);
  return require('./Parser.js').knownChipCategory_(label, categories);
}

function entryEditGuard_(value, maxLength) {
  if (typeof guardSheetText === 'function') return guardSheetText(value, maxLength);
  return require('./Security.js').guardSheetText(value, maxLength);
}

function entryEditTwdFormula_(row) {
  if (typeof buildEstimatedTwdFormula === 'function') return buildEstimatedTwdFormula(row);
  return require('./Security.js').buildEstimatedTwdFormula(row);
}

function entryEditPayment_(payments, code) {
  if (typeof resolvePayment === 'function') {
    return resolvePayment({ payments: payments, explicitCode: code, explicitOnly: true });
  }
  return require('./Match.js').resolvePayment({ payments: payments, explicitCode: code, explicitOnly: true });
}

function planEntryUpdate_(existing, input, resources) {
  var schema = entryEditSchema_();
  var rowNumber = existing && existing.rowNumber;
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
    return { ok: false, message: '找不到這一筆。' };
  }
  var fields = input || {};
  var bag = resources || {};
  var name = String(fields.name == null ? '' : fields.name).replace(/[\u0000-\u001F]/g, '').trim();
  if (!name) name = schema.UNNAMED_ITEM;
  if (name.length > 80) name = name.slice(0, 80);
  var parsedAmount = entryEditParseAmount_(String(fields.amountText == null ? '' : fields.amountText).trim());
  if (!parsedAmount) return { ok: false, message: '金額不合理' };
  if (parsedAmount.error) return { ok: false, message: parsedAmount.error };
  var amount = parsedAmount.value;
  var currency = String(fields.currency || '').trim().toUpperCase();
  if (!entryEditCurrencyOk_(currency)) return { ok: false, message: '不支援這個幣別' };
  var category = entryEditCategory_(fields.categoryName, bag.categories || []);
  if (!category) return { ok: false, message: '請選擇分類。' };
  var payment = entryEditPayment_(bag.payments || [], String(fields.paymentCode || '').slice(0, 32));
  if (!payment) return { ok: false, message: '請選擇付款方式。' };
  var twd = null;
  var sameMoney = currency === String(existing.currency || '') && amount === existing.amount;
  if (currency === 'TWD') twd = amount;
  else if (sameMoney && typeof existing.twd === 'number' && isFinite(existing.twd)) twd = existing.twd;
  var merchantKey = entryEditMerchantKey_(name);
  var columns = schema.ENTRY_COL;
  return {
    ok: true,
    rowNumber: rowNumber,
    cells: [
      { column: columns.NAME, value: entryEditGuard_(name, 80) },
      { column: columns.AMOUNT, value: amount },
      { column: columns.CURRENCY, value: currency },
      { column: columns.TWD, value: entryEditTwdFormula_(rowNumber) },
      { column: columns.CATEGORY, value: entryEditGuard_(category, 40) },
      { column: columns.PAYMENT_CODE, value: entryEditGuard_(payment.code, 32) },
      { column: columns.PAYMENT_NAME, value: entryEditGuard_(payment.name, 40) },
      { column: columns.ACCOUNT_CODE, value: entryEditGuard_(payment.accountCode || '', 32) },
      { column: columns.CARD_CODE, value: entryEditGuard_(payment.cardCode || '', 32) },
      { column: columns.MERCHANT_KEY, value: entryEditGuard_(merchantKey, 80) }
    ],
    calendar: {
      date: existing.date,
      time: existing.time || '',
      name: name,
      amount: amount,
      currency: currency,
      twd: twd,
      timeZone: bag.timeZone || 'Asia/Taipei'
    },
    remember: name === schema.UNNAMED_ITEM ? null : {
      merchantKey: merchantKey,
      name: name,
      paymentCode: payment.code
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    planEntryUpdate_: planEntryUpdate_
  };
}
