/**
 * نتائج مختبر البنية التحتية — المستوى الثاني
 * الجدول: https://docs.google.com/spreadsheets/d/1u_M0MSqiGKtumlO0PUssjuqLUAvcm1a4xeJ3Lc0YAyc
 *
 * 1. افتحي الجدول ← الإضافات ← Apps Script.
 * 2. الصقي هذا الملف مكان Code.gs.
 * 3. انشري: تطبيق ويب، التنفيذ: أنا، الوصول: أي شخص.
 * 4. الصقي رابط /exec في js/config.js عند sheetsUrl.
 *
 * لا يمسح الأوراق الحالية. يضيف ثلاث أوراق إن لم تكن موجودة:
 * ملخص المختبر، تفاصيل المهام، كل الاختيارات.
 */

var SHEET_ID = "1u_M0MSqiGKtumlO0PUssjuqLUAvcm1a4xeJ3Lc0YAyc";

function doGet() {
  return ContentService.createTextOutput("مختبر البنية التحتية المستوى 2 — جاهز.");
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var data = readPayload_(e);
    if (String(data.kind || "") !== "l2infra") throw new Error("unknown kind");
    writeLab_(openSheet_(), data);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function openSheet_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("اربطي السكربت بالجدول");
  return ss;
}

function writeLab_(ss, data) {
  var sumHead = [
    "الاسم", "الشعبة",
    "وقت البدء", "وقت التسليم", "المدة", "المدة بالثواني",
    "النقاط", "صحيحة", "خاطئة", "ناقصة",
    "عدد المهام", "النسبة %",
    "ملخص الأخطاء"
  ];
  var detHead = [
    "الاسم", "الشعبة", "وقت التسليم",
    "رقم المهمة", "المؤسسة", "العنوان", "المدة",
    "صحيحة", "المطلوب", "أخطاء",
    "ما اختارته صح", "ما جرّبته بالخطأ", "ما نقص"
  ];
  var pickHead = [
    "الاسم", "الشعبة", "وقت التسليم",
    "رقم المهمة", "المؤسسة",
    "البطاقة", "النوع", "النتيجة", "التفسير"
  ];

  var summary = ensureSheet_(ss, "ملخص المختبر", sumHead);
  var details = ensureSheet_(ss, "تفاصيل المهام", detHead);
  var picks = ensureSheet_(ss, "كل الاختيارات", pickHead);

  var wrongBits = [];
  (data.details || []).forEach(function (scenario) {
    (scenario.picks || []).forEach(function (pick) {
      if (pick.result === "صحيحة") return;
      wrongBits.push(scenario.num + ". " + (pick.name || "") + " (" + (pick.result || "") + ")");
    });
  });

  summary.appendRow([
    data.name || "", data.klass || "",
    data.startedAt || "", data.finishedAt || data.when || "",
    data.durationText || "", data.durationSeconds || 0,
    data.score || 0, data.correct || 0, data.wrong || 0, data.missed || 0,
    data.scenarios || 0, data.percent || 0,
    wrongBits.length ? wrongBits.join(" | ") : "لا يوجد"
  ]);

  (data.details || []).forEach(function (scenario) {
    details.appendRow([
      data.name || "", data.klass || "", data.finishedAt || data.when || "",
      scenario.num || "", scenario.company || "", scenario.title || "",
      scenario.durationText || "",
      scenario.correct || 0, scenario.needed || 0, scenario.wrong || 0,
      scenario.chosen || "-", scenario.rejected || "-", scenario.missing || "-"
    ]);
    (scenario.picks || []).forEach(function (pick) {
      picks.appendRow([
        data.name || "", data.klass || "", data.finishedAt || data.when || "",
        scenario.num || "", scenario.company || "",
        pick.name || "", pick.axis || "", pick.result || "", pick.why || ""
      ]);
    });
  });
}

function firstText_(v) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Array]") v = v.length ? v[0] : "";
  return String(v);
}

function tryParseJson_(text) {
  if (!text) return null;
  try {
    var obj = JSON.parse(String(text).replace(/^\uFEFF/, "").trim());
    if (obj && typeof obj === "object") return obj;
  } catch (err) {}
  return null;
}

function tryParseForm_(text) {
  if (!text || text.indexOf("=") < 0) return null;
  var parts = String(text).split("&");
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    var key = parts[i].slice(0, eq);
    var val = parts[i].slice(eq + 1);
    try { key = decodeURIComponent(key.replace(/\+/g, " ")); } catch (e1) {}
    if (key !== "payload" && key !== "data") continue;
    try { val = decodeURIComponent(val.replace(/\+/g, " ")); } catch (e2) {}
    var parsed = tryParseJson_(val);
    if (parsed) return parsed;
  }
  return null;
}

function readPayload_(e) {
  e = e || {};
  var p = e.parameter || {};
  var ps = e.parameters || {};
  var raw = e.postData && e.postData.contents ? String(e.postData.contents) : "";
  var candidates = [p.payload, p.data, ps.payload, ps.data, raw];
  for (var i = 0; i < candidates.length; i++) {
    var text = firstText_(candidates[i]);
    if (!text) continue;
    var asJson = tryParseJson_(text);
    if (asJson) return asJson;
    var asForm = tryParseForm_(text);
    if (asForm) return asForm;
  }
  throw new Error("empty body");
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() < 1) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
