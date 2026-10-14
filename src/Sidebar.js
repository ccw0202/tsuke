/**
 * Calendar homepage sidebar. Card text is plain text; user input is not rendered as HTML.
 */

function onCalendarHomepage() {
  try {
    return [buildHomeCard_()];
  } catch (err) {
    logPrivate_(err);
    var message = err && err.userFacing ? err.message : '帳本讀取失敗。請先在 Apps Script 執行 setupTsuke。';
    return [noticeCard_('Tsuke', message)];
  }
}

function onSidebarAdd(e) {
  var payment = formValue_(e, 'payment');
  var pinned = payment !== '' && payment !== 'auto';
  var result;
  try {
    result = addEntry(formValue_(e, 'line'), {
      paymentCode: pinned ? payment : '',
      paymentPinned: pinned,
      source: 'calendar'
    });
  } catch (err) {
    logPrivate_(err);
    result = { ok: false, message: '沒有記下，請稍後再試。' };
  }
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(clipText_((result && result.message) || '沒有記下', 180)))
    .build();
}

function onSidebarSearch(e) {
  var result;
  try {
    result = searchEntries(formValue_(e, 'query'));
  } catch (err) {
    logPrivate_(err);
    result = { message: '搜尋失敗，請稍後再試。', matches: [] };
  }
  return pushCard_('搜尋結果', result);
}

function onSidebarTag(e) {
  var result;
  try {
    result = listTagEntries(formValue_(e, 'tag'));
  } catch (err) {
    logPrivate_(err);
    result = { message: '無法讀取標籤，請稍後再試。', matches: [] };
  }
  return pushCard_('標籤', result);
}

function buildHomeCard_() {
  var ctx = loadLedgerContext_();
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Tsuke').setSubtitle('記一筆'));

  var entry = CardService.newCardSection().setHeader('快速記帳');
  entry.addWidget(CardService.newTextInput()
    .setFieldName('line')
    .setTitle('內容')
    .setHint('例如：早餐 80'));
  var payment = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('付款方式')
    .setFieldName('payment')
    .addItem('沿用上次', 'auto', true);
  ctx.payments.slice(0, 24).forEach(function (item) {
    payment.addItem(clipText_(item.name, 40), item.code, false);
  });
  entry.addWidget(payment);
  entry.addWidget(CardService.newTextParagraph().setText('沒有另外選擇時，會用這個項目上次的付款方式。句子裡若寫了付款代碼，以句子為準。'));
  entry.addWidget(CardService.newTextButton()
    .setText('記下')
    .setTextButtonStyle(CardService.newTextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('onSidebarAdd')));
  card.addSection(entry);

  var search = CardService.newCardSection().setHeader('搜尋');
  search.addWidget(CardService.newTextInput()
    .setFieldName('query')
    .setTitle('關鍵字、分類或標籤')
    .setHint('例如：早餐'));
  search.addWidget(CardService.newTextButton()
    .setText('搜尋')
    .setOnClickAction(CardService.newAction().setFunctionName('onSidebarSearch')));
  card.addSection(search);

  var tags = CardService.newCardSection().setHeader('標籤合計');
  tags.addWidget(CardService.newTextInput()
    .setFieldName('tag')
    .setTitle('標籤名稱')
    .setHint('例如：範例旅行'));
  tags.addWidget(CardService.newTextButton()
    .setText('查看')
    .setOnClickAction(CardService.newAction().setFunctionName('onSidebarTag')));
  card.addSection(tags);

  var id = currentSpreadsheetId_();
  if (id) {
    var links = CardService.newCardSection();
    links.addWidget(CardService.newTextButton()
      .setText('開啟帳本')
      .setOpenLink(CardService.newOpenLink()
        .setUrl('https://docs.google.com/spreadsheets/d/' + id + '/edit')
        .setOpenAs(CardService.OpenAs.FULL_SIZE)));
    card.addSection(links);
  }
  return card.build();
}

function buildResultCard_(title, result) {
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText(clipText_((result && result.message) || '', 300)));
  ((result && result.matches) || []).slice(0, 15).forEach(function (entry) {
    section.addWidget(CardService.newDecoratedText()
      .setTopLabel(clipText_(entry.date + ' · ' + entry.category, 80))
      .setText(clipText_(entry.name, 80))
      .setBottomLabel(clipText_(moneyLine_(entry), 100)));
  });
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(title))
    .addSection(section)
    .build();
}

function noticeCard_(title, message) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(title))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(clipText_(message, 300))))
    .build();
}

function pushCard_(title, result) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildResultCard_(title, result)))
    .build();
}

function moneyLine_(entry) {
  var text = entry.amount + ' ' + entry.currency;
  if (entry.currency !== 'TWD' && typeof entry.twd === 'number') text += '（約 ' + entry.twd + '）';
  if (entry.paymentName) text += ' · ' + entry.paymentName;
  if (entry.tag) text += ' · ' + entry.tag;
  return text;
}

function formValue_(event, name) {
  var common = event && event.commonEventObject && event.commonEventObject.formInputs;
  if (common && common[name] && common[name].stringInputs && common[name].stringInputs.value) {
    return String(common[name].stringInputs.value[0] || '');
  }
  if (event && event.formInput && event.formInput[name] != null) return String(event.formInput[name]);
  if (event && event.formInputs && event.formInputs[name]) {
    var box = event.formInputs[name];
    if (typeof box === 'string') return box;
    if (box.stringInputs && box.stringInputs.value) return String(box.stringInputs.value[0] || '');
  }
  return '';
}
