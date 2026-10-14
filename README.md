# Tsuke (つけ)

Tsuke is a private, one-line bookkeeping book and daily log. You type a sentence, and it lands in a Google Sheet you own. Foreign amounts get an approximate TWD figure from `GOOGLEFINANCE`. A line that starts with `日誌` becomes an all-day event on a calendar named **Tsuke 日誌**.

The phone page is one input box, a row of payment buttons, and the last few entries. The same entry path is available from a Calendar sidebar. Nothing in this repository is a real ledger: sample cards, trips, and amounts are examples.

```
早餐 80
中餐 50 現金
ChatGPT 20 USD cube
書 350 甲銀行轉帳
日誌 範例：去公園散步
```

Only the amount is required. Currency defaults to TWD. If you do not name a payment method, Tsuke uses the method you tapped, otherwise the last method used for that item, otherwise the default in Settings.

## What v1 stores

| Sheet | Role |
| --- | --- |
| 帳目 | One row per expense: date, name, amount, currency, approximate TWD, category, payment code, payment name, account code, card code, tag, note, merchant key, created time |
| 月份統計 | One row per month, category totals, and a stacked column chart |
| 標籤 | A name plus an inclusive date range. Entries in that range are tagged automatically. The sheet sums approximate TWD per tag |
| 付款方式 | Editable payment buttons. Codes link onward to accounts and cards |
| 分類 | Category names and comma-separated keywords. Unknown items fall back to 日常 |
| 付款記憶 | Last payment code for each item name |
| 設定 | Default currency, default payment code, log marker, calendar name, time zone |
| 說明 | Short Traditional Chinese notes inside the spreadsheet |

Approximate TWD is a formula on the row. TWD amounts copy the amount. Other currencies use `GOOGLEFINANCE("CURRENCY:<code>TWD")`, so the figure moves when the rate moves. It is an estimate, not a booked exchange rate.

### One-line rules

Tokens are separated by spaces.

- The last number is the amount. `iPhone 15 32000` keeps `15` in the name.
- A configured payment code or name (`現金`, `cube`, `轉帳`) is the payment method. Typing one overrides the button you tapped.
- A token such as `甲銀行轉帳` is a transfer when `轉帳` exists in 付款方式. The entry stores that full code so a later account sheet can join on it. It does not add a new button.
- Currency can be `USD`, `美金`, `20USD`, `$80` (`$` means TWD), or `€15`.
- A leading date is optional: `2026-02-15`, `2/15`, `昨天`, `今天`, `前天`. A month/day that is still in the future uses last year, because this is a record of money already spent.
- `分類:吃` or `[吃]` sets the category when that category exists. A bare category word is removed only when another name remains, so `書 350` stays named 書 and is categorized as 書.
- `//` separates a note: `早餐 80 // 外帶`.
- `#範例旅行` adds an explicit tag, merged with any date-range tag.
- `日誌` at the start, followed by a space or colon, is a daily log. It is not an expense and it does not require an amount.

Categories shipped in the template: 吃, 公益, 書, 日常, 贈禮, AI工具, 娛樂. Keyword lists live in the 分類 sheet. The longest matching keyword wins. If nothing matches, the category is 日常.

### Payment buttons

The web app loads 付款方式 and draws one button per enabled row (up to 24). The template ships four **example** rows:

| Code | Example name | Type |
| --- | --- | --- |
| `cube` | 範例信用卡 Cube | 卡片 |
| `ef` | 範例信用卡 EF | 卡片 |
| `現金` | 現金 | 現金 |
| `轉帳` | 轉帳 | 轉帳 |

Rename the example card names after setup. The code `cube` is only the template's default payment code. It is not an account number. Do not put a real card number, or the last four digits of one, in this sheet or in git.

On the phone, Cube starts selected. After you save 早餐 with 現金, the next 早餐 pre-selects 現金. A code typed in the sentence still wins, including when you submit before the preview returns. Tapping a different button removes a code you already typed.

The Calendar sidebar uses the same rule with a dropdown. 「沿用上次」 means memory, then the default.

`addEntry(line, options)` is the only write path. The web app and the sidebar both call it. A later chat bot or importer can call it too, without knowing about the sheets.

## Project layout

```
appsscript.json          manifest, scopes, web app access, Calendar homepage
src/Parser.js            pure one-line parser
src/Match.js             tags, payment choice, search
src/Security.js          formula guard and row builder
src/Schema.js            sheet names, columns, example template, future sheets
src/Ledger.js            addEntry, search, preview
src/LogCalendar.js       Tsuke 日誌 calendar
src/Setup.js             setupTsuke
src/WebApp.js            doGet
src/Sidebar.js           Calendar CardService sidebar
src/Index.html           phone page
test/                    Node tests for the pure modules
```

clasp's `rootDir` is the repository root, so `src/Index.html` is the Apps Script file `src/Index`. `.clasp.json` is gitignored. Copy `.clasp.json.example` and paste your own script id locally. Never commit it.

## Local tests

```bash
npm test
```

Node 18 or newer. The tests do not call Google. They cover the parser, payment priority, tag ranges, formula-injection guards, and the column letters used by the TWD and monthly formulas.

## Deploy

1. Install clasp and log in with the Google account that should own the ledger:

   ```bash
   npm install -g @google/clasp
   clasp login
   ```

   `clasp login` writes `~/.clasprc.json`. That file is credentials. Do not commit it. This repo gitignores `.clasprc.json` and `.clasp.json`.

2. Create the standalone script in a temporary directory, then push this repo. `clasp create` writes a default `appsscript.json` into `--rootDir` (it reports that it cloned one file). Running it with `--rootDir .` replaces this repo's manifest, so the Sheets and Calendar advanced services, the three scopes, and `Asia/Taipei` never reach the project. `setupTsuke` then fails with `ReferenceError: Sheets is not defined`.

   From the repo root:

   ```bash
   mkdir -p /tmp/tsuke-clasp-create
   clasp create --title "Tsuke" --type standalone --rootDir /tmp/tsuke-clasp-create
   node -e '
   const fs = require("fs");
   const created = JSON.parse(fs.readFileSync("/tmp/tsuke-clasp-create/.clasp.json", "utf8"));
   fs.writeFileSync(".clasp.json", JSON.stringify({ scriptId: created.scriptId, rootDir: "." }, null, 2) + "\n");
   '
   clasp push
   ```

   That writes only the new script id into `.clasp.json` (`rootDir` stays `.`). `.clasp.json` stays on your machine. Do not commit it, and do not copy `.clasp.json.example` over a file clasp already created.

   If you already ran `clasp create` inside this repo, keep the `.clasp.json` it wrote and upload the committed manifest:

   ```bash
   git checkout -- appsscript.json
   clasp push
   ```

   `git status` should no longer list `appsscript.json`. Leave the clasp-generated manifest uncommitted. Run `setupTsuke` again. If the consent screen already ran against the default scopes, accept it again so the three scopes in `appsscript.json` are granted.

3. `clasp push` sends `enabledAdvancedServices` from the committed `appsscript.json` (Sheets API as `Sheets`, Calendar API as `Calendar`). If `setupTsuke` says those services are missing, the Apps Script project is still on the default manifest: restore and push as in step 2, then run setup again.

4. Run `setupTsuke` from the editor and accept the consent screen. The script asks for three scopes, listed in [SECURITY.md](SECURITY.md). It creates a spreadsheet named **Tsuke 帳本** in your Drive and stores that id in Script Properties. It also creates the **Tsuke 日誌** calendar the first time it can. The function's return value includes the spreadsheet URL. That URL is private. Do not paste it into git, a screenshot, or a public issue.

5. Open 付款方式 and replace the example card names. Change 預設付款代碼 in 設定 if the default button should not be `cube`. Edit keywords in 分類 if you want different guesses. Add a row to 標籤 when you want a date range, for example name `範例旅行`, start `2026-02-15`, end `2026-02-22`.

6. Deploy the web app: **Deploy → New deployment → Web app**.

   - Execute as: **Me** (`USER_DEPLOYING`)
   - Who has access: **Only myself** (`MYSELF`)

   Do not choose Anyone or Anyone anonymous. The manifest already says `MYSELF` / `USER_DEPLOYING`. The deploy screen can override that. Leave it as only yourself. Open the `/exec` URL on your phone.

7. Install the Calendar sidebar: **Deploy → Test deployments → Google Workspace add-on**, install it for your account, then open Google Calendar and the side panel. The homepage is quick entry, search across every year in 帳目, and a per-tag list with an approximate TWD total.

8. Add the web app to your home screen from the browser's share or menu sheet (Safari: Share → Add to Home Screen; Chrome: Install app or Add to Home screen). The page is phone-sized, sets a manifest and the usual mobile web app tags, and does not load third-party fonts or scripts. Apps Script cannot host a service worker, so the icon opens the live page. It does not work offline.

Re-run `setupTsuke` if you need to repair a missing sheet or formula. It will not overwrite payment methods, categories, or entries you already edited. `refreshMonthlyChart` rewrites the monthly formulas and replaces the chart.

## Authorization

The manifest requests only:

- `https://www.googleapis.com/auth/drive.file` — create the ledger and edit that file. Not every spreadsheet, and not all of Drive.
- `https://www.googleapis.com/auth/calendar.app.created` — create the Tsuke 日誌 calendar and put all-day events on calendars this script created.
- `https://www.googleapis.com/auth/calendar.addons.execute` — run the Calendar sidebar. The add-on does not request access to the event you have open.

`spreadsheets.currentonly` cannot see a spreadsheet while you are in Calendar, because Calendar has no current spreadsheet. `SpreadsheetApp.openById` would require the broad spreadsheets scope, so Tsuke uses the Sheets API on the file it created, which `drive.file` allows. Details and the rejected scopes are in [SECURITY.md](SECURITY.md).

There is no Gmail scope, no full Drive scope, and no `UrlFetchApp`. The only network call inside a spreadsheet is `GOOGLEFINANCE`, which is Google's own function.

## Roadmap

These are not built. `src/Schema.js` lists their sheet names, headers, and the id columns that already exist on 帳目 and 付款方式 so a later file can add them without rewriting v1 rows.

Phase 2, each its own sheet and module:

| Sheet | Module | Contents |
| --- | --- | --- |
| 帳戶 | `src/Assets.js` | Banks, exchanges, TW/US stock accounts. Keyed by 帳戶代碼 |
| 資產快照 | `src/Assets.js` | Balance on the 1st of each month, per account, original currency and approximate TWD, plus a trend chart |
| 公益 | `src/Charity.js` | Item, platform, payment code, points versus cash, yearly totals |
| 債務 | `src/Debts.js` | For example a student loan: principal, interest percent, start, end, monthly payment, debit account. A later reminder would tell you to top up that account before the debit date |
| 訂閱 | `src/Subscriptions.js` | Monthly or yearly, billing day, payment code. A later trigger would call `addEntry` on the billing date and remind you |
| 收入 | `src/Income.js` | Salary, freelance, or other, with monthly net |

Phase 3:

| Sheet | Module | Contents |
| --- | --- | --- |
| 卡片 | `src/Cards.js` | Benefits and discounts per 卡片代碼, and a suggestion of which card to use for a purchase |

帳目.付款代碼 points at 付款方式.代碼. That row already has 帳戶代碼 and 卡片代碼. Those two columns are copied onto each expense as well, so a later rename of a button does not detach old rows. v1 does not create the phase 2 or phase 3 sheets and does not install time-driven triggers.

Out of scope for now: Notion CSV import, and chat entry from a Grok bot. Both should call `addEntry` rather than write the sheet themselves.

## 繁體中文

Tsuke（つけ）是給自己用的記帳本，外加一本每日日誌。資料只放在你自己的 Google 帳號：一張試算表、一本叫做「Tsuke 日誌」的日曆。沒有外部伺服器。

手機打開網頁，輸入一行再按記下。例如：

```
早餐 80
中餐 50 現金
ChatGPT 20 USD cube
書 350 甲銀行轉帳
日誌 範例：去公園散步
```

金額必填。沒寫幣別就是 TWD。分類會用「分類」表的關鍵字猜，猜不到就歸在日常。類別有：吃、公益、書、日常、贈禮、AI工具、娛樂。

付款方式不用打進句子。輸入框下面有按鈕，清單來自「付款方式」表，可以自己增刪改。範本裡的「範例信用卡 Cube」「範例信用卡 EF」只是例子，請改成你自己的叫法，不要把卡號或末四碼寫進表裡或提交到 git。Cube 會先被選取。同一個項目會記住上次的付款方式，下次自動預選。句子裡如果寫了代碼（例如 `現金` 或 `甲銀行轉帳`），以句子為準。

`日誌` 開頭的句子會變成「Tsuke 日誌」日曆上的全日事件，不會進帳目。

「標籤」表填名稱和起迄日期（含第一天和最後一天）。那段期間的帳會自動帶上標籤，表上也會加總約當台幣。側欄可以依關鍵字、分類或標籤搜尋所有年份，也可以列出某個標籤的明細和合計。

外幣的「約當台幣」是儲存格裡的 `GOOGLEFINANCE` 公式，匯率變了數字會跟著變，只是估算。

### 部署

1. `npm install -g @google/clasp`，然後 `clasp login`。不要把 `.clasprc.json` 或含有 script id 的 `.clasp.json` 提交上去。
2. 在暫存目錄建立指令碼，再從這個 repo push。`clasp create --rootDir .` 會用預設 manifest 蓋掉 `appsscript.json`（clasp 會說 cloned one file），進階服務、授權範圍和時區會消失，`setupTsuke` 會出現 `ReferenceError: Sheets is not defined`。

   在 repo 根目錄執行：

   ```bash
   mkdir -p /tmp/tsuke-clasp-create
   clasp create --title "Tsuke" --type standalone --rootDir /tmp/tsuke-clasp-create
   node -e '
   const fs = require("fs");
   const created = JSON.parse(fs.readFileSync("/tmp/tsuke-clasp-create/.clasp.json", "utf8"));
   fs.writeFileSync(".clasp.json", JSON.stringify({ scriptId: created.scriptId, rootDir: "." }, null, 2) + "\n");
   '
   clasp push
   ```

   如果已經在這個 repo 裡 create 過，保留 clasp 寫好的 `.clasp.json`，還原 manifest 再 push：

   ```bash
   git checkout -- appsscript.json
   clasp push
   ```

   還原後 `git status` 不該再列出 `appsscript.json`。不要提交 clasp 產生的預設 manifest。若同意畫面是用預設範圍跑過的，重新執行 `setupTsuke` 並再授權一次。
3. 在編輯器執行 `setupTsuke` 並授權。會在你的雲端硬碟建立「Tsuke 帳本」。回傳的試算表網址只留給自己，不要貼到公開的地方。若訊息說進階服務尚未啟用，先做上面的還原與 `clasp push`。
4. 打開「付款方式」，把範例卡片名稱改成你的。
5. 部署網頁應用程式時，執行身分選「我」，存取權限選「只有我」。不要選任何人，也不要選匿名。
6. 日曆外掛用「測試部署」安裝到自己的 Calendar，從側欄記帳。
7. 手機瀏覽器開啟網頁應用程式網址，用「加入主畫面」。這是主畫面捷徑，沒有離線功能。

設定值、詞彙和部署細節的英文說明在上面。威脅模型和範圍說明在 [SECURITY.md](SECURITY.md)。

本地測試：`npm test`。

### 現在不做

不會從 Notion 匯入，也沒有 Grok 聊天記帳。之後若要加，請走 `addEntry`，不要另外寫一條進試算表的路。

第二階段會各自一張表：帳戶與每月 1 日資產快照（銀行、交易所、台股、美股，多幣別換算台幣與趨勢圖）、公益（項目、平台、付款方式、點數或現金、年度合計）、債務（例如學貸：本金、利率、起迄、月付、扣款帳戶，扣款前提醒補錢）、訂閱（月繳或年繳、扣款日、自動記一筆、提醒）、收入（薪資、接案、其他，月淨額）。第三階段是卡片權益表，依消費建議要用哪張卡。帳目上的付款代碼、帳戶代碼、卡片代碼就是留給這些表接合的鍵。

## License

MIT. See [LICENSE](LICENSE).
