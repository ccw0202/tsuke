/**
 * Sheet names, columns, and starter template values.
 * Payment rows are examples. Rename them in the sheet after setup.
 * Phase 2 and 3 sheets are described here and are not created in v1.
 */

var SHEET_NAMES = {
  GUIDE: '說明',
  ENTRIES: '帳目',
  MONTHLY: '月份統計',
  TAGS: '標籤',
  PAYMENTS: '付款方式',
  CATEGORIES: '分類',
  MEMORY: '付款記憶',
  SETTINGS: '設定'
};

var PROP_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  LOG_CALENDAR_ID: 'LOG_CALENDAR_ID',
  SPEND_CALENDAR_ID: 'SPEND_CALENDAR_ID',
  PLAN_CALENDAR_ID: 'PLAN_CALENDAR_ID'
};

var SETTING_KEYS = {
  currency: '預設幣別',
  payment: '預設付款代碼',
  logMarker: '日誌標記',
  calendarName: '日誌日曆',
  timeZone: '時區',
  spendEvents: '花費日曆'
};

var DEFAULT_SETTINGS = {
  currency: 'TWD',
  payment: 'cube',
  logMarker: '日誌',
  calendarName: 'Tsuke 日誌',
  timeZone: 'Asia/Taipei',
  spendEvents: 'TRUE'
};

var ENTRY_HEADERS = [
  '日期',
  '名稱',
  '金額',
  '幣別',
  '約當台幣',
  '分類',
  '付款代碼',
  '付款方式',
  '帳戶代碼',
  '卡片代碼',
  '標籤',
  '備註',
  '項目鍵',
  '建立時間',
  '時間',
  '日曆事件'
];

var ENTRY_COL = {
  DATE: 1,
  NAME: 2,
  AMOUNT: 3,
  CURRENCY: 4,
  TWD: 5,
  CATEGORY: 6,
  PAYMENT_CODE: 7,
  PAYMENT_NAME: 8,
  ACCOUNT_CODE: 9,
  CARD_CODE: 10,
  TAG: 11,
  NOTE: 12,
  MERCHANT_KEY: 13,
  CREATED_AT: 14,
  TIME: 15,
  EVENT_ID: 16
};

var PAYMENT_HEADERS = ['代碼', '名稱', '排序', '啟用', '類型', '帳戶代碼', '卡片代碼', '別名'];
var CATEGORY_HEADERS = ['分類', '關鍵字', '排序'];
var TAG_HEADERS = ['名稱', '開始日期', '結束日期', '備註', '約當台幣合計', '筆數'];
var MEMORY_HEADERS = ['項目鍵', '最近名稱', '付款代碼', '更新時間'];
var SETTING_HEADERS = ['鍵', '值', '說明'];

/**
 * Starter payment methods. These are example labels, not a real wallet.
 * 帳戶代碼 and 卡片代碼 are empty or example keys so later account and card sheets can join.
 */
var EXAMPLE_PAYMENTS = [
  ['cube', '範例信用卡 Cube', 1, 'TRUE', '卡片', '', 'cube', ''],
  ['ef', '範例信用卡 EF', 2, 'TRUE', '卡片', '', 'ef', ''],
  ['現金', '現金', 3, 'TRUE', '現金', '', '', ''],
  ['轉帳', '轉帳', 4, 'TRUE', '轉帳', '', '', '']
];

var DEFAULT_CATEGORIES = [
  ['吃', '早餐,午餐,中餐,晚餐,宵夜,早午餐,咖啡,飲料,點心,便當,火鍋,拉麵,壽司,麥當勞,肯德基,星巴克', 1],
  ['公益', '捐款,捐,公益,奉獻,慈濟,募款', 2],
  ['書', '電子書,書店,小說,博客來,書', 3],
  ['日常', '', 4],
  ['贈禮', '禮物,禮金,紅包,送禮,賀禮', 5],
  ['AI工具', 'ChatGPT,OpenAI,Claude,Gemini,Cursor,Copilot,Midjourney,Perplexity,AI', 6],
  ['娛樂', 'Netflix,Spotify,YouTube,電影,遊戲,演唱會,娛樂', 7]
];

var CATEGORY_NAMES = ['吃', '公益', '書', '日常', '贈禮', 'AI工具', '娛樂'];

var ALLOWED_CURRENCIES = [
  'TWD', 'USD', 'JPY', 'EUR', 'HKD', 'CNY', 'KRW', 'GBP', 'SGD', 'AUD', 'CHF', 'CAD', 'THB', 'MYR', 'PHP', 'VND'
];

var FALLBACK_CATEGORY = '日常';
var UNNAMED_ITEM = '（未命名）';
var LOG_CALENDAR_NAME = 'Tsuke 日誌';
var SPEND_CALENDAR_NAME = 'Tsuke 花費';
var PLAN_CALENDAR_NAME = 'Tsuke 活動';
var LEDGER_TITLE = 'Tsuke 帳本';
var TIME_ZONE = 'Asia/Taipei';
var MAX_LINE_LENGTH = 500;

/**
 * Future sheets are not created in v1. A later module should call the same
 * sheet gateway with these headers. Link column is the stable key.
 */
var FUTURE_SHEETS = {
  accounts: {
    phase: '2a',
    module: 'src/Assets.js',
    name: '帳戶',
    headers: ['帳戶代碼', '名稱', '類型', '幣別', '機構', '備註'],
    links: '付款方式.帳戶代碼 and 帳目.帳戶代碼'
  },
  assetSnapshots: {
    phase: '2a',
    module: 'src/Assets.js',
    name: '資產快照',
    headers: ['日期', '帳戶代碼', '餘額', '幣別', '約當台幣', '備註'],
    links: '帳戶.帳戶代碼. One row per account on the 1st of each month.'
  },
  charity: {
    phase: '2b',
    module: 'src/Charity.js',
    name: '公益',
    headers: ['日期', '項目', '平台', '付款代碼', '點數', '現金金額', '幣別', '約當台幣', '備註'],
    links: '付款方式.代碼'
  },
  debts: {
    phase: '2c',
    module: 'src/Debts.js',
    name: '債務',
    headers: ['名稱', '本金', '年利率', '起始日', '結束日', '每月還款', '扣款日', '扣款帳戶代碼', '付款代碼', '備註'],
    links: '帳戶.帳戶代碼 and 付款方式.代碼'
  },
  subscriptions: {
    phase: '2d',
    module: 'src/Subscriptions.js',
    name: '訂閱',
    headers: ['名稱', '金額', '幣別', '週期', '扣款日', '付款代碼', '分類', '啟用', '備註'],
    links: '付款方式.代碼. A later trigger calls addEntry on the billing date.'
  },
  income: {
    phase: '2e',
    module: 'src/Income.js',
    name: '收入',
    headers: ['日期', '名稱', '類型', '金額', '幣別', '約當台幣', '帳戶代碼', '備註'],
    links: '帳戶.帳戶代碼'
  },
  cards: {
    phase: '3',
    module: 'src/Cards.js',
    name: '卡片',
    headers: ['卡片代碼', '名稱', '付款代碼', '權益摘要', '回饋說明', '備註'],
    links: '付款方式.卡片代碼 and 帳目.卡片代碼'
  }
};

var GUIDE_LINES = [
  ['Tsuke 帳本'],
  ['這是範例設定。付款方式裡的卡片名稱是範例，請改成你自己的叫法。'],
  ['記帳：在網頁或日曆側欄輸入一行，例如「早餐 80」。金額必填，幣別預設 TWD。'],
  ['付款：手機網頁會顯示付款按鈕。點一下即可，不必把代碼打進句子。句子裡若寫了代碼，以句子為準。'],
  ['同一個項目會記住上次的付款方式，下次自動預選。'],
  ['分類會依「分類」表的關鍵字猜測，猜不到就歸在日常。'],
  ['標籤：在「標籤」表填名稱與起迄日期（含首尾）。該區間的帳會自動帶上標籤。'],
  ['日誌：以「日誌」開頭的句子，或網頁「日誌」分頁的文字，會變成「Tsuke 日誌」日曆上的全日事件，不會寫進帳目。'],
  ['花費：每一筆帳會在「Tsuke 花費」日曆建一個事件。這本日曆和主日曆、日誌日曆都分開，可以單獨隱藏。設定裡把「花費日曆」改成 FALSE 就停止。'],
  ['活動：網頁「預訂活動」會寫進「Tsuke 活動」日曆，不會寫進主要日曆，也不會進帳目。可以在 Google 日曆裡隱藏它。'],
  ['外幣的「約當台幣」用試算表裡的 GOOGLEFINANCE 估算，會隨匯率更新。'],
  ['請不要把網頁應用程式公開部署，也不要分享這個試算表給不信任的人。']
];

function columnLetter_(index) {
  var n = index;
  var letters = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHEET_NAMES: SHEET_NAMES,
    PROP_KEYS: PROP_KEYS,
    SETTING_KEYS: SETTING_KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    ENTRY_HEADERS: ENTRY_HEADERS,
    ENTRY_COL: ENTRY_COL,
    PAYMENT_HEADERS: PAYMENT_HEADERS,
    CATEGORY_HEADERS: CATEGORY_HEADERS,
    TAG_HEADERS: TAG_HEADERS,
    MEMORY_HEADERS: MEMORY_HEADERS,
    SETTING_HEADERS: SETTING_HEADERS,
    EXAMPLE_PAYMENTS: EXAMPLE_PAYMENTS,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    CATEGORY_NAMES: CATEGORY_NAMES,
    ALLOWED_CURRENCIES: ALLOWED_CURRENCIES,
    FALLBACK_CATEGORY: FALLBACK_CATEGORY,
    UNNAMED_ITEM: UNNAMED_ITEM,
    LOG_CALENDAR_NAME: LOG_CALENDAR_NAME,
    SPEND_CALENDAR_NAME: SPEND_CALENDAR_NAME,
    PLAN_CALENDAR_NAME: PLAN_CALENDAR_NAME,
    LEDGER_TITLE: LEDGER_TITLE,
    TIME_ZONE: TIME_ZONE,
    MAX_LINE_LENGTH: MAX_LINE_LENGTH,
    FUTURE_SHEETS: FUTURE_SHEETS,
    GUIDE_LINES: GUIDE_LINES,
    columnLetter_: columnLetter_
  };
}
