# Security

Tsuke stores a personal ledger and a daily log in the Google account of the person who deploys it. The threat model is a single owner. The code is written so that a public git checkout cannot become a second copy of that ledger, and so that a hostile string in an entry cannot run as HTML or as a spreadsheet formula.

## Assets

- Expense rows, notes, merchant names, and the last payment method used for each merchant.
- Daily-log text, which is copied onto an all-day calendar event when a line starts with `日誌`.
- Expense events on 「Tsuke 花費」, including the event id stored on the ledger row. A cancelled event marks that row 已刪除 in 狀態; the row is kept so the owner can clear the cell and restore it.
- The spreadsheet id and the log and spend calendar ids, kept in Script Properties after `setupTsuke`. They are not in source. An older `PLAN_CALENDAR_ID`, if one is still stored, is unused.
- The owner's OAuth grant for the four scopes below.

Example card names in the template (`範例信用卡 Cube`, `範例信用卡 EF`) are placeholders. They are not account numbers. Do not replace them, in git, with a real PAN or the last four digits of a card.

## Trust boundary

The web app is deployed as **execute as me** (`USER_DEPLOYING`) and **only myself** (`MYSELF`). The Calendar sidebar runs as the installed user, which for this personal deploy is the same person. There is no anonymous mode and no multi-tenant mode.

The sidebar reads Script Properties, the same store `setupTsuke` writes. It does not keep a second spreadsheet id in User Properties. A test deployment runs the script HEAD. If that deployment was authorized before the manifest listed `drive.file`, the Sheets call from Calendar fails until the test deployment is removed and installed again. The card shows a fixed sentence for that case. The execution log receives the exception name and message, which can include the spreadsheet id, and the card does not.

Anyone who can change the deployment to "Anyone" or "Anyone, even anonymous" can submit entries into the owner's sheet and write the owner's log calendar, because the app executes as the owner. The manifest sets `MYSELF`. The deploy dialog can override it. Do not override it. Do not share the spreadsheet with people you do not trust; a viewer of the sheet can read every row even if they cannot open the web app.

Tsuke does not send ledger data to a server other than Google. It does not use `UrlFetchApp`. The approximate TWD cell calls `GOOGLEFINANCE`, which is evaluated by Google Sheets.

## OAuth scopes

| Scope | Why it is here |
| --- | --- |
| `https://www.googleapis.com/auth/drive.file` | Create the ledger spreadsheet and later read and edit that file. `drive.file` is limited to files this script creates (or that the user explicitly picks). It is not all of Drive. |
| `https://www.googleapis.com/auth/calendar.app.created` | Create the secondary calendars 「Tsuke 日誌」 and 「Tsuke 花費」, and add, see, update, and delete events on calendars this script created. The primary calendar is never passed to the API. |
| `https://www.googleapis.com/auth/calendar.addons.execute` | Let the Calendar sidebar render. The manifest does not set `currentEventAccess`, so the add-on is not given the open event's title, guests, or description. |
| `https://www.googleapis.com/auth/script.scriptapp` | Create and list this project's own installable triggers. `setupTsuke` uses it only to install the hourly `syncDeletedSpendEvents` trigger (`ScriptApp.getProjectTriggers` and `ScriptApp.newTrigger` in this project). It does not manage other Apps Script projects, and it does not grant calendar or spreadsheet access. |

Rejected on purpose:

| Scope | Why not |
| --- | --- |
| `https://www.googleapis.com/auth/spreadsheets` | Reads and writes every spreadsheet the user can open. |
| `https://www.googleapis.com/auth/spreadsheets.currentonly` | Only the spreadsheet a bound script is currently in. The Calendar sidebar has no current spreadsheet, so this scope cannot open the ledger from Calendar. |
| `https://www.googleapis.com/auth/drive` | Full Drive. Not used. |
| `https://www.googleapis.com/auth/calendar` and `calendar.events` | Every calendar the user can edit, including the primary calendar. `calendar.events` would let the script read and change events on every calendar, including the primary one. Logs and expenses go on calendars this script creates (「Tsuke 日誌」 and 「Tsuke 花費」), which `calendar.app.created` already covers. An installable `onEventUpdated` trigger is registered through that broad Calendar service, so the spend-delete check is a time-driven trigger instead. It calls `Calendar.Events.list` only for the 「Tsuke 花費」 id, with cancelled events included. Installing that hourly trigger uses `script.scriptapp`, which only manages this project's own triggers. Hide 「Tsuke 花費」 in Google Calendar if those events should stay out of the main view. |
| Gmail scopes | Tsuke does not read or send mail. |
| `https://www.googleapis.com/auth/script.external_request` | Would allow `UrlFetchApp` to call arbitrary URLs. The manifest does not grant it, and the code does not call `UrlFetchApp`. |
| `userinfo.email` | Not required. Access control is the deployment setting, not an email comparison. |

`SpreadsheetApp.openById` documents the full spreadsheets scope and will not honor `drive.file`. Tsuke therefore uses the Advanced Sheets service (`Sheets.Spreadsheets`) against the spreadsheet id that `Sheets.Spreadsheets.create` returned under `drive.file`. The same pattern is used for Calendar: `Calendar.Calendars.insert`, `Calendar.Events.insert`, `Calendar.Events.update`, `Calendar.Events.remove`, and `Calendar.Events.list`, not `CalendarApp`, which asks for the broad calendar scope. Expense events go on the calendar id returned by `Calendars.insert` for 「Tsuke 花費」 and stored in Script Properties. The event id is written on the ledger row. A daily log uses that same insert on 「Tsuke 日誌」. `setupTsuke` installs one time-driven trigger, `syncDeletedSpendEvents`, hourly, under `script.scriptapp`. That scope only manages this project's own triggers. If the trigger cannot be created, `setupTsuke` returns a fixed 繁體中文 sentence and does not report success. The job reads the app-created spend calendar and, for a cancelled event id, writes the fixed status 已刪除 and clears the event id. Deleting the event or moving it to another calendar both cancel it on 「Tsuke 花費」, so both mark the row. It does not run while 花費日曆 is `FALSE`. A missing calendar is logged and does not mark rows deleted. User-facing text from that job is a fixed sentence. Event descriptions are fixed sentences. They do not include the spreadsheet id or URL.

Script Properties are the only place the spreadsheet id and the log and spend calendar ids are stored. Each id is checked against a closed character set before it is sent back to a Google API. They are never written into the HTML page. The sidebar's "開啟帳本" button builds `https://docs.google.com/spreadsheets/d/<id>/edit` only after that check. User-facing errors do not include exception text, because Apps Script errors often echo the id.

## Web app

- `appsscript.json` sets `webapp.executeAs` to `USER_DEPLOYING` and `webapp.access` to `MYSELF`.
- `doGet` returns the static file `src/Index`. The HTML file has no Apps Script scriptlets (`<?= ?>` or `<?!= ?>`), so nothing from the server is interpolated into the document. HtmlService ignores a viewport meta tag in that file, so `doGet` adds `width=device-width, initial-scale=1` with `addMetaTag`. The copy in the file is only for the local preview.
- Ledger fields are inserted in the browser with `textContent` and `createElement`. The page does not use `innerHTML`, `document.write`, or `eval`.
- A manifest URL is attached only when it matches `https://script.google.com/macros/s/<id>/exec?page=manifest`. The `page` query parameter is accepted only when it is exactly `manifest`. Other query parameters are ignored.
- `HtmlService` is served with `XFrameOptionsMode.DEFAULT`, which sends `X-Frame-Options: SAMEORIGIN`, to reduce clickjacking. The page also sends `noindex, nofollow`.
- Buttons and the text field are the owner's. Payment codes coming back from the sheet are shown only when they match a short safe pattern; the label is still assigned with `textContent`. Category buttons use the same rule: a name is drawn only when it matches `^[\u4e00-\u9fffA-Za-z0-9]{1,20}$`.
- A recent row can be edited or deleted from the page. The browser sends the row number and the new fields. It does not receive the calendar event id. The script re-reads that row under the script lock and patches only the edited cells, so the created time and the event id stay put. Delete asks for a second tap on the page, and the server ignores a delete call that does not carry that confirmation. The linked 「Tsuke 花費」 event is updated or removed only when 花費日曆 is on. A missing event is treated as already gone. That does not delete the stored calendar id.
- The failure handler shows a fixed sentence. It does not print the raw exception.
- If the page is opened outside Apps Script (no `google.script.run`), it renders an obvious local preview with fake rows and does not claim that anything was saved. That branch does not run inside the deployed web app.

Home-screen install uses the browser's Add to Home Screen action. There is no service worker and no offline cache.

## Sheets

Text that Tsuke writes is passed through `guardSheetText`. If the trimmed value starts with `=`, `+`, `-`, `@`, a tab or carriage return, or the fullwidth forms `＝＋－＠`, the cell is prefixed with an apostrophe so Sheets stores it as text. Amounts are JavaScript numbers, not strings. Dates are `yyyy-MM-dd` after a calendar check. Currency codes are taken from a fixed allowlist before they are written; the TWD formula never concatenates the user's currency into the formula source. It references the currency cell (`D` on that row) inside `GOOGLEFINANCE`.

`buildEstimatedTwdFormula` accepts only an integer row from 2 to 100000. Monthly and tag formulas are built from the column letters in `Schema.js` and from the built-in category names. They do not include `IMPORTRANGE`, `IMPORTDATA`, or an `http` URL. Category names used inside those formulas must match `^[\u4e00-\u9fffA-Za-z0-9]{1,20}$`. Those formulas also skip rows whose 狀態 is the fixed word 已刪除. That word is checked against `^[\u4e00-\u9fff]{1,20}$` before it is placed in the formula. `setupTsuke` rewrites the monthly and tag formulas once, when it adds the 狀態 header to a ledger that does not have it yet.

Payment codes loaded from the sheet must match `^[\u4e00-\u9fffA-Za-z0-9_-]{1,32}$`. A bank-prefixed transfer (`甲銀行轉帳`) is accepted only when it matches `^[\u4e00-\u9fffA-Za-z0-9]{1,12}轉帳$` and a 轉帳 method exists. A payment code supplied by the web app or the sidebar is used only when that exact code is an enabled row. Unknown codes fall through to memory, then the default. They are never written just because the client sent them.

Tag names read back from the sheet must match a similarly closed pattern, so a formula typed into the 標籤 sheet is not copied onto new expense rows as a live formula. Text columns that hold names, codes, notes, and settings are formatted as plain text (`@`). The amount column and the TWD formula column stay numeric so the formula still calculates.

Input limits: the line is at most 500 characters, names 80, notes 200, log text 200, search text 80. Amounts must be finite, non-zero, and under one billion, with at most six decimal places. Control characters and bidi overrides are stripped.

Writes take a script lock so two quick submits do not choose the same row.

## Git

Do not commit:

- `.clasp.json` (it contains the script id)
- `.clasprc.json` (OAuth tokens from `clasp login`)
- spreadsheet ids, calendar ids, deployment URLs, or email addresses
- real expense rows, real trip names, or card last-four digits

`.gitignore` ignores `.clasp.json` and `.clasprc.json`. `.clasp.json.example` contains the placeholder `PASTE_YOUR_SCRIPT_ID` only. Tests and the template use labeled fake rows (`早餐（範例）`, `範例旅行`, `範例信用卡 Cube`).

## What remains the owner's responsibility

- Leaving the web app on "only myself".
- Not sharing the spreadsheet or the log calendar publicly.
- Not pasting real identifiers into a commit.
- Editing the example payment names locally instead of publishing them as if they were a secret account list.
- Treating `GOOGLEFINANCE` as an estimate. The formula is recalculated by Google; Tsuke does not pin a historical rate.

A person who can edit the script can widen the scopes or the deployment. The manifest is the checked-in baseline; a later edit that adds `UrlFetchApp` or the full Drive scope would be a new review, not something v1 grants.
