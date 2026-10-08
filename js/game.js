(function () {
  var data = window.GAME_DATA;
  var state = {
    index: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    kept: [],
    order: [],
    triedWrong: [],
    picks: [],
    log: [],
    startedAt: 0,
    scenarioStarted: 0,
    studentName: "",
    studentClass: "",
    selected: null,
    drag: null,
    justDragged: false,
    complete: false
  };

  var STORE_KEY = "it-lab-l2-aim-a";

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cell(value, type) {
    var kind = type || (typeof value === "number" && isFinite(value) ? "Number" : "String");
    return '<Cell><Data ss:Type="' + kind + '">' + xmlEscape(value) + "</Data></Cell>";
  }

  function headerCell(value) {
    return '<Cell ss:StyleID="header"><Data ss:Type="String">' + xmlEscape(value) + "</Data></Cell>";
  }

  function row(cells) {
    return "<Row>" + cells.join("") + "</Row>";
  }

  function nowStamp(date) {
    var d = date || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function formatDuration(totalSeconds) {
    var s = Math.max(0, Math.round(totalSeconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function loadRoster() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    } catch (err) {
      return [];
    }
  }

  function saveRoster(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  function snapshotScenario() {
    var sc = current();
    var seconds = Math.max(1, Math.round((Date.now() - (state.scenarioStarted || Date.now())) / 1000));
    var missing = sc.needed.filter(function (id) { return state.kept.indexOf(id) === -1; });
    var missed = missing.map(function (id) {
      return {
        name: data.items[id].name,
        axis: axisName(data.items[id].axis),
        result: "ناقصة",
        why: sc.why[id] || ""
      };
    });
    state.log.push({
      num: state.index + 1,
      company: sc.company,
      title: sc.title,
      correct: state.kept.length,
      needed: sc.needed.length,
      wrong: state.triedWrong.length,
      seconds: seconds,
      durationText: formatDuration(seconds),
      chosen: state.kept.map(function (id) { return data.items[id].name; }).join("، "),
      missing: missed.map(function (item) { return item.name; }).join("، "),
      rejected: state.triedWrong.map(function (id) { return data.items[id].name; }).join("، "),
      picks: state.picks.concat(missed)
    });
  }

  function buildRecord() {
    var neededTotal = 0;
    var correctTotal = 0;
    state.log.forEach(function (item) {
      neededTotal += item.needed;
      correctTotal += item.correct;
    });
    var percent = neededTotal ? Math.round((correctTotal / neededTotal) * 100) : 0;
    var finished = new Date();
    var started = state.startedAt ? new Date(state.startedAt) : finished;
    var durationSeconds = Math.max(1, Math.round((finished.getTime() - started.getTime()) / 1000));
    var missedCount = 0;
    state.log.forEach(function (item) {
      (item.picks || []).forEach(function (pick) {
        if (pick.result === "ناقصة") missedCount += 1;
      });
    });
    return {
      kind: "l2infra",
      name: state.studentName,
      klass: state.studentClass,
      when: nowStamp(finished),
      startedAt: nowStamp(started),
      finishedAt: nowStamp(finished),
      durationText: formatDuration(durationSeconds),
      durationSeconds: durationSeconds,
      score: state.score,
      correct: state.correct,
      wrong: state.wrong,
      missed: missedCount,
      scenarios: state.log.length,
      percent: percent,
      details: state.log.slice()
    };
  }

  function cloudUrl() {
    return String((window.IT_LAB_CLOUD || {}).sheetsUrl || "").trim();
  }

  function ensureSink() {
    var iframe = document.getElementById("itLabSink");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.name = "itLabSink";
      iframe.id = "itLabSink";
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(iframe);
    }
    var form = document.getElementById("itLabCloudForm");
    if (!form) {
      form = document.createElement("form");
      form.id = "itLabCloudForm";
      form.method = "POST";
      form.target = "itLabSink";
      form.acceptCharset = "UTF-8";
      form.style.display = "none";
      ["payload", "data"].forEach(function (name) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        form.appendChild(input);
      });
      document.body.appendChild(form);
    }
    return form;
  }

  function sendCloud(pack) {
    var url = cloudUrl();
    if (!url) return false;
    var body = JSON.stringify(pack);
    try {
      var form = ensureSink();
      form.action = url;
      form.querySelector("[name=payload]").value = body;
      form.querySelector("[name=data]").value = body;
      form.submit();
      return true;
    } catch (err) {
      try {
        fetch(url, {
          method: "POST",
          mode: "no-cors",
          keepalive: true,
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: "payload=" + encodeURIComponent(body)
        });
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function storeCurrentResult() {
    var record = buildRecord();
    var roster = loadRoster();
    roster.push(record);
    saveRoster(roster);
    return record;
  }

  function worksheet(name, rowsHtml) {
    return (
      '<Worksheet ss:Name="' + xmlEscape(name) + '">' +
        "<Table>" + rowsHtml + "</Table>" +
        '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/></WorksheetOptions>' +
      "</Worksheet>"
    );
  }

  function workbookXml(sheets) {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
        "<Styles>" +
          '<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#243044" ss:Pattern="Solid"/></Style>' +
        "</Styles>" +
        sheets.join("") +
      "</Workbook>"
    );
  }

  function summaryRows(roster) {
    var html = row([
      headerCell("الاسم"),
      headerCell("الشعبة"),
      headerCell("وقت البدء"),
      headerCell("وقت التسليم"),
      headerCell("المدة"),
      headerCell("النقاط"),
      headerCell("اختيارات صحيحة"),
      headerCell("محاولات خاطئة"),
      headerCell("ناقصة"),
      headerCell("عدد السيناريوهات"),
      headerCell("نسبة الإنجاز %")
    ]);
    roster.forEach(function (item) {
      html += row([
        cell(item.name),
        cell(item.klass || "-"),
        cell(item.startedAt || item.when),
        cell(item.finishedAt || item.when),
        cell(item.durationText || "-"),
        cell(item.score, "Number"),
        cell(item.correct, "Number"),
        cell(item.wrong, "Number"),
        cell(item.missed || 0, "Number"),
        cell(item.scenarios, "Number"),
        cell(item.percent, "Number")
      ]);
    });
    return html;
  }

  function detailRows(roster) {
    var html = row([
      headerCell("الاسم"),
      headerCell("الشعبة"),
      headerCell("رقم السيناريو"),
      headerCell("الشركة"),
      headerCell("العنوان"),
      headerCell("صحيحة"),
      headerCell("المطلوب"),
      headerCell("المدة"),
      headerCell("أخطاء"),
      headerCell("ما اختارته صح"),
      headerCell("ما جرّبته بالخطأ"),
      headerCell("ما نقص")
    ]);
    roster.forEach(function (item) {
      (item.details || []).forEach(function (rowItem) {
        html += row([
          cell(item.name),
          cell(item.klass || "-"),
          cell(rowItem.num, "Number"),
          cell(rowItem.company),
          cell(rowItem.title),
          cell(rowItem.correct, "Number"),
          cell(rowItem.needed, "Number"),
          cell(rowItem.durationText || "-"),
          cell(rowItem.wrong, "Number"),
          cell(rowItem.chosen || "-"),
          cell(rowItem.rejected || "-"),
          cell(rowItem.missing || "-")
        ]);
      });
    });
    return html;
  }

  function pickRows(roster) {
    var html = row([
      headerCell("الاسم"),
      headerCell("الشعبة"),
      headerCell("وقت التسليم"),
      headerCell("رقم المهمة"),
      headerCell("المؤسسة"),
      headerCell("البطاقة"),
      headerCell("النوع"),
      headerCell("النتيجة"),
      headerCell("التفسير")
    ]);
    roster.forEach(function (item) {
      (item.details || []).forEach(function (scenario) {
        (scenario.picks || []).forEach(function (pick) {
          html += row([
            cell(item.name),
            cell(item.klass || "-"),
            cell(item.finishedAt || item.when),
            cell(scenario.num, "Number"),
            cell(scenario.company),
            cell(pick.name),
            cell(pick.axis || "-"),
            cell(pick.result),
            cell(pick.why || "-")
          ]);
        });
      });
    });
    return html;
  }

  function downloadExcel(filename, roster) {
    if (!roster.length) {
      showToast("لا توجد نتائج محفوظة بعد.", "bad");
      return;
    }
    var xml = workbookXml([
      worksheet("ملخص الصف", summaryRows(roster)),
      worksheet("تفاصيل المهام", detailRows(roster)),
      worksheet("كل الاختيارات", pickRows(roster))
    ]);
    var blob = new Blob(["\uFEFF" + xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 500);
    showToast("تم تجهيز ملف Excel. افتحه مباشرة من التنزيلات.", "good");
  }

  function safeFilePart(text) {
    return String(text || "طالب").replace(/[\\/:*?"<>|]+/g, " ").trim();
  }

  var els = {
    start: document.getElementById("screen-start"),
    game: document.getElementById("screen-game"),
    end: document.getElementById("screen-end"),
    axesStrip: document.getElementById("axes-strip"),
    pool: document.getElementById("pool"),
    crate: document.getElementById("dropzone"),
    crateItems: document.getElementById("crate-items"),
    crateHint: document.getElementById("crate-hint"),
    neededCount: document.getElementById("needed-count"),
    title: document.getElementById("scenario-title"),
    story: document.getElementById("scenario-story"),
    mission: document.getElementById("scenario-mission"),
    kicker: document.getElementById("company-kicker"),
    index: document.getElementById("scenario-index"),
    dots: document.getElementById("progress-dots"),
    score: document.getElementById("score"),
    axisLive: document.getElementById("axis-live"),
    next: document.getElementById("btn-next"),
    toast: document.getElementById("toast"),
    overlay: document.getElementById("overlay"),
    modal: document.getElementById("modal")
  };

  function axisName(id) {
    return data.axes[id - 1].name;
  }

  function icon(type) {
    var s = {
      shop: '<rect x="10" y="22" width="52" height="30" rx="3" fill="#c24e1f"/><rect x="18" y="28" width="12" height="10" fill="#fff8eb"/><rect x="38" y="28" width="12" height="10" fill="#fff8eb"/><path d="M8 22 L36 8 L64 22" fill="#243044"/>',
      store: '<rect x="14" y="18" width="44" height="34" fill="#8a6a4b"/><rect x="30" y="32" width="12" height="20" fill="#fff8eb"/>',
      paper: '<rect x="20" y="12" width="32" height="44" fill="#fff" stroke="#243044"/><path d="M26 24h20M26 32h20M26 40h14" stroke="#243044"/>',
      box: '<path d="M12 28 L36 16 L60 28 L36 40Z" fill="#d9a441"/><path d="M12 28 V48 L36 60 V40Z" fill="#c24e1f"/><path d="M60 28 V48 L36 60 V40Z" fill="#9a3914"/>',
      cal: '<rect x="14" y="16" width="44" height="40" rx="4" fill="#fff" stroke="#243044"/><rect x="14" y="16" width="44" height="12" fill="#2b6b5e"/><circle cx="26" cy="40" r="3" fill="#243044"/><circle cx="36" cy="40" r="3" fill="#c24e1f"/>',
      laptop: '<rect x="10" y="16" width="52" height="32" rx="3" fill="#243044"/><rect x="14" y="20" width="44" height="22" fill="#7fb7c9"/><path d="M6 48h60l-6-8H12z" fill="#3b4658"/>',
      pc: '<rect x="16" y="10" width="40" height="30" fill="#243044"/><rect x="20" y="14" width="32" height="20" fill="#7fb7c9"/><rect x="28" y="40" width="16" height="8" fill="#3b4658"/><rect x="18" y="48" width="36" height="6" fill="#243044"/>',
      tablet: '<rect x="20" y="8" width="32" height="52" rx="4" fill="#243044"/><rect x="24" y="14" width="24" height="36" fill="#7fb7c9"/>',
      pos: '<rect x="16" y="10" width="40" height="28" fill="#243044"/><rect x="20" y="14" width="32" height="16" fill="#7fb7c9"/><rect x="22" y="40" width="28" height="16" fill="#d9a441"/>',
      scan: '<rect x="10" y="18" width="50" height="14" rx="3" fill="#243044"/><path d="M18 40h36M18 46h28" stroke="#c24e1f" stroke-width="3"/>',
      robot: '<rect x="18" y="16" width="36" height="30" rx="4" fill="#6b7280"/><circle cx="30" cy="28" r="4" fill="#d9a441"/><circle cx="42" cy="28" r="4" fill="#d9a441"/><rect x="22" y="46" width="10" height="12" fill="#243044"/><rect x="40" y="46" width="10" height="12" fill="#243044"/>',
      server: '<rect x="14" y="10" width="44" height="48" rx="3" fill="#243044"/><rect x="18" y="16" width="36" height="10" fill="#4b5563"/><rect x="18" y="30" width="36" height="10" fill="#4b5563"/><circle cx="24" cy="21" r="2" fill="#2f7d4a"/><circle cx="24" cy="35" r="2" fill="#c24e1f"/>',
      cam: '<rect x="12" y="22" width="30" height="22" rx="3" fill="#243044"/><circle cx="50" cy="33" r="12" fill="#3b4658"/><circle cx="50" cy="33" r="6" fill="#7fb7c9"/>',
      ssd: '<rect x="12" y="22" width="48" height="22" rx="3" fill="#d9a441"/><rect x="18" y="28" width="10" height="8" fill="#243044"/>',
      hdd: '<ellipse cx="36" cy="34" rx="20" ry="16" fill="#8a8f98"/><circle cx="36" cy="34" r="6" fill="#243044"/>',
      print: '<rect x="12" y="24" width="48" height="20" fill="#243044"/><rect x="20" y="12" width="32" height="14" fill="#4b5563"/><rect x="20" y="30" width="32" height="8" fill="#fff8eb"/>',
      print2: '<rect x="10" y="20" width="52" height="24" fill="#3b4658"/><rect x="22" y="10" width="28" height="14" fill="#243044"/><rect x="18" y="44" width="36" height="10" fill="#fff"/>',
      mouse: '<rect x="24" y="12" width="20" height="32" rx="10" fill="#243044"/><path d="M34 12v12" stroke="#d9a441"/>',
      mic: '<rect x="28" y="10" width="16" height="26" rx="8" fill="#243044"/><path d="M22 28a14 14 0 0 0 28 0" stroke="#c24e1f" fill="none" stroke-width="3"/><path d="M36 42v12" stroke="#243044" stroke-width="4"/>',
      webcam: '<circle cx="36" cy="28" r="16" fill="#243044"/><circle cx="36" cy="28" r="8" fill="#7fb7c9"/><rect x="32" y="44" width="8" height="12" fill="#3b4658"/>',
      head: '<path d="M16 32a20 20 0 0 1 40 0" stroke="#243044" fill="none" stroke-width="6"/><rect x="10" y="30" width="10" height="16" rx="3" fill="#c24e1f"/><rect x="52" y="30" width="10" height="16" rx="3" fill="#c24e1f"/>',
      fax: '<rect x="10" y="20" width="52" height="28" fill="#6b7280"/><rect x="16" y="12" width="28" height="10" fill="#fff"/>',
      pen: '<path d="M14 50 L40 12 L50 20 L24 58Z" fill="#2b6b5e"/><path d="M40 12l8-6 8 8-6 8z" fill="#c24e1f"/>',
      docs: '<rect x="16" y="12" width="28" height="36" fill="#fff" stroke="#243044"/><rect x="24" y="20" width="28" height="36" fill="#dbe4ea" stroke="#243044"/>',
      erp: '<rect x="12" y="14" width="48" height="40" fill="#243044"/><path d="M20 40 V26 h10 v14 h10 V22 h10 v18" stroke="#d9a441" fill="none" stroke-width="3"/>',
      chaos: '<circle cx="22" cy="24" r="8" fill="#c24e1f"/><circle cx="48" cy="22" r="7" fill="#d9a441"/><circle cx="34" cy="44" r="9" fill="#6b7280"/>',
      pill: '<rect x="16" y="26" width="40" height="16" rx="8" fill="#c24e1f"/><rect x="36" y="26" width="20" height="16" rx="8" fill="#fff8eb"/>',
      inv: '<rect x="14" y="16" width="20" height="36" fill="#d9a441"/><rect x="38" y="24" width="20" height="28" fill="#c24e1f"/>',
      book: '<rect x="14" y="18" width="44" height="36" rx="3" fill="#fff" stroke="#243044"/><path d="M22 30h28M22 38h18" stroke="#2b6b5e"/>',
      learn: '<path d="M8 28 L36 16 L64 28 L36 40Z" fill="#2b6b5e"/><path d="M20 32v14c16 8 32 0 32-8V32" fill="#c9d6e8"/>',
      law: '<path d="M36 12v40" stroke="#243044" stroke-width="4"/><path d="M16 22h16l-4 16H20zM40 22h16l-4 16H44z" fill="#d9a441"/>',
      wifi: '<path d="M18 40a24 24 0 0 1 36 0" stroke="#243044" fill="none" stroke-width="4"/><path d="M24 46a16 16 0 0 1 24 0" stroke="#2b6b5e" fill="none" stroke-width="4"/><circle cx="36" cy="54" r="3" fill="#c24e1f"/>',
      fiber: '<path d="M8 36c16-20 20 20 36 0s16 16 20 0" stroke="#c24e1f" fill="none" stroke-width="5"/>',
      copper: '<path d="M8 24h56M8 36h56M8 48h56" stroke="#b7791f" stroke-width="4"/>',
      signal: '<rect x="16" y="40" width="6" height="12" fill="#243044"/><rect x="26" y="32" width="6" height="20" fill="#243044"/><rect x="36" y="22" width="6" height="30" fill="#2b6b5e"/><rect x="46" y="14" width="6" height="38" fill="#2b6b5e"/>',
      lan: '<circle cx="36" cy="18" r="6" fill="#243044"/><circle cx="16" cy="50" r="6" fill="#2b6b5e"/><circle cx="36" cy="50" r="6" fill="#2b6b5e"/><circle cx="56" cy="50" r="6" fill="#2b6b5e"/><path d="M36 24v10M16 44V34h40v10" stroke="#243044" stroke-width="3"/>',
      vpn: '<rect x="14" y="28" width="44" height="24" rx="4" fill="#243044"/><path d="M24 28v-8a12 12 0 0 1 24 0v8" stroke="#d9a441" fill="none" stroke-width="4"/>',
      opennet: '<circle cx="36" cy="34" r="18" fill="none" stroke="#b1332c" stroke-width="3"/><path d="M20 34h32M36 16c8 8 8 28 0 36M36 16c-8 8-8 28 0 36" stroke="#b1332c"/>',
      wall: '<rect x="10" y="16" width="52" height="40" fill="#8a6a4b"/><rect x="16" y="22" width="12" height="10" fill="#fff8eb"/><rect x="44" y="36" width="12" height="14" fill="#243044"/>',
      lock: '<rect x="18" y="30" width="36" height="24" rx="3" fill="#2f7d4a"/><path d="M26 30v-8a10 10 0 0 1 20 0v8" stroke="#243044" fill="none" stroke-width="4"/>',
      unlock: '<rect x="18" y="32" width="36" height="22" rx="3" fill="#b1332c"/><path d="M26 32v-8a10 10 0 0 1 18-2" stroke="#243044" fill="none" stroke-width="4"/>',
      compress: '<rect x="16" y="14" width="40" height="44" fill="#fff" stroke="#243044"/><path d="M28 20v12l-6-4m22 4v12l-6-4" stroke="#c24e1f" fill="none" stroke-width="3"/>',
      heavy: '<rect x="14" y="12" width="44" height="48" fill="#e8d7c2" stroke="#243044"/><path d="M22 22h28M22 32h28M22 42h20" stroke="#8a6a4b"/>',
      cloud: '<ellipse cx="36" cy="38" rx="22" ry="14" fill="#7fb7c9"/><circle cx="24" cy="32" r="10" fill="#7fb7c9"/><circle cx="44" cy="28" r="12" fill="#7fb7c9"/>',
      backup: '<ellipse cx="36" cy="40" rx="20" ry="12" fill="#2b6b5e"/><path d="M36 16v20m0 0-8-8m8 8 8-8" stroke="#fff8eb" stroke-width="3"/>',
      own: '<rect x="12" y="18" width="20" height="34" fill="#6b7280"/><rect x="40" y="10" width="20" height="42" fill="#4b5563"/>',
      ai: '<circle cx="36" cy="32" r="14" fill="#243044"/><circle cx="30" cy="30" r="2" fill="#d9a441"/><circle cx="42" cy="30" r="2" fill="#d9a441"/><path d="M36 18V8M20 32H10M62 32H52M36 46v8" stroke="#c24e1f" stroke-width="3"/>',
      dice: '<rect x="16" y="16" width="40" height="40" rx="6" fill="#fff" stroke="#243044"/><circle cx="28" cy="28" r="3" fill="#243044"/><circle cx="44" cy="44" r="3" fill="#243044"/>',
      building: '<rect x="14" y="16" width="44" height="40" fill="#243044"/><rect x="22" y="24" width="8" height="8" fill="#fff8eb"/><rect x="34" y="24" width="8" height="8" fill="#fff8eb"/><rect x="46" y="24" width="8" height="8" fill="#fff8eb"/><rect x="30" y="40" width="12" height="16" fill="#d9a441"/>',
      heart: '<path d="M36 52 L16 32a10 10 0 0 1 16-12 10 10 0 0 1 16 12Z" fill="#a14d62"/>',
      hands: '<circle cx="24" cy="22" r="8" fill="#d9a441"/><circle cx="48" cy="22" r="8" fill="#2b6b5e"/><path d="M12 48c4-10 12-12 20-8 8-4 16-2 20 8" fill="#243044"/>',
      mix: '<rect x="12" y="18" width="22" height="30" fill="#c24e1f"/><circle cx="48" cy="34" r="14" fill="#2b6b5e"/>',
      factory: '<rect x="10" y="28" width="52" height="24" fill="#243044"/><rect x="16" y="14" width="10" height="18" fill="#6b7280"/><rect x="30" y="18" width="10" height="14" fill="#6b7280"/><circle cx="22" cy="40" r="3" fill="#d9a441"/>',
      truck: '<rect x="8" y="26" width="34" height="18" fill="#c24e1f"/><path d="M42 32h12l8 8v8H42z" fill="#243044"/><circle cx="20" cy="48" r="5" fill="#243044"/><circle cx="50" cy="48" r="5" fill="#243044"/>',
      search: '<circle cx="30" cy="28" r="12" fill="none" stroke="#243044" stroke-width="4"/><path d="M38 38 L54 52" stroke="#c24e1f" stroke-width="4"/>',
      mega: '<path d="M16 28h10l18-10v32L26 40H16z" fill="#243044"/><circle cx="50" cy="32" r="6" fill="#d9a441"/>',
      spark: '<path d="M36 8 L40 26 H58 L44 36 L50 54 L36 42 L22 54 L28 36 L14 26 H32 Z" fill="#d9a441"/>',
      chat: '<rect x="12" y="14" width="48" height="30" rx="6" fill="#2b6b5e"/><path d="M24 44 L20 56 L36 44" fill="#2b6b5e"/>',
      flag: '<path d="M18 10v46" stroke="#243044" stroke-width="4"/><path d="M18 14h32l-6 10 6 10H18z" fill="#a14d62"/>',
      hire: '<circle cx="36" cy="20" r="8" fill="#d9a441"/><path d="M20 48c2-10 10-14 16-14s14 4 16 14" fill="#243044"/>',
      team: '<circle cx="24" cy="22" r="7" fill="#d9a441"/><circle cx="48" cy="22" r="7" fill="#2b6b5e"/><path d="M10 50c2-8 8-12 14-12s12 4 14 12M34 50c2-8 8-12 14-12s12 4 14 12" fill="#243044"/>',
      coins: '<ellipse cx="36" cy="40" rx="16" ry="8" fill="#d9a441"/><ellipse cx="36" cy="32" rx="16" ry="8" fill="#f0d48a" stroke="#243044"/><ellipse cx="36" cy="24" rx="16" ry="8" fill="#d9a441" stroke="#243044"/>',
      wallet: '<rect x="12" y="20" width="48" height="30" rx="4" fill="#243044"/><rect x="36" y="30" width="24" height="12" fill="#d9a441"/>',
      report: '<rect x="18" y="10" width="36" height="44" fill="#fff" stroke="#243044"/><path d="M26 40 V28 h6 v12 h6 V22 h6 v18" stroke="#2b6b5e" fill="none" stroke-width="3"/>',
      flow: '<path d="M14 40h28l-6-8m6 8-6 8" stroke="#2b6b5e" stroke-width="4" fill="none"/><path d="M58 24H30l6-8m-6 8 6 8" stroke="#c24e1f" stroke-width="4" fill="none"/>',
      bill: '<rect x="20" y="10" width="32" height="44" fill="#fff" stroke="#243044"/><path d="M28 22h16M28 30h16M28 38h10" stroke="#243044"/>',
      ledger: '<rect x="14" y="14" width="44" height="36" fill="#fff" stroke="#243044"/><path d="M22 24h28M22 32h28M22 40h18" stroke="#2b6b5e"/>',
      leaf: '<path d="M16 48 C20 20 52 12 58 16 C40 28 28 40 16 48Z" fill="#2b6b5e"/>',
      crystal: '<path d="M36 8 L52 28 L36 58 L20 28 Z" fill="#7fb7c9" stroke="#243044"/>',
      gauge: '<path d="M14 40 a22 22 0 1 1 44 0" fill="none" stroke="#243044" stroke-width="4"/><path d="M36 40 L48 24" stroke="#c24e1f" stroke-width="3"/>',
      chart: '<path d="M14 48h46M18 40l10-8 8 6 16-18" fill="none" stroke="#2b6b5e" stroke-width="4"/>',
      users: '<circle cx="28" cy="22" r="8" fill="#d9a441"/><circle cx="46" cy="24" r="6" fill="#2b6b5e"/><path d="M12 50c2-10 10-14 16-14s14 4 16 10" fill="#243044"/>',
      target: '<circle cx="36" cy="32" r="16" fill="none" stroke="#a14d62" stroke-width="4"/><circle cx="36" cy="32" r="6" fill="#a14d62"/>',
      smile: '<circle cx="36" cy="32" r="18" fill="#f0d48a" stroke="#243044"/><circle cx="30" cy="28" r="2" fill="#243044"/><circle cx="42" cy="28" r="2" fill="#243044"/><path d="M28 38c4 6 12 6 16 0" fill="none" stroke="#243044" stroke-width="2"/>',
      bulb: '<circle cx="36" cy="26" r="12" fill="#d9a441"/><rect x="30" y="38" width="12" height="8" fill="#243044"/>',
      phone: '<rect x="26" y="8" width="20" height="48" rx="4" fill="#243044"/><rect x="30" y="14" width="12" height="30" fill="#7fb7c9"/>',
      watch: '<rect x="28" y="8" width="16" height="10" fill="#6b7280"/><rect x="22" y="16" width="28" height="28" rx="6" fill="#243044"/><rect x="28" y="44" width="16" height="10" fill="#6b7280"/><circle cx="36" cy="30" r="6" fill="#7fb7c9"/>',
      cd: '<circle cx="36" cy="32" r="18" fill="#c9d6e8" stroke="#243044"/><circle cx="36" cy="32" r="5" fill="#fff"/>',
      key: '<rect x="14" y="22" width="28" height="18" rx="3" fill="#243044"/><path d="M42 28h16M50 28v8M56 28v6" stroke="#d9a441" stroke-width="3"/>',
      pointer: '<path d="M22 10 L22 46 L32 36 L44 52 L50 48 L38 32 L52 32 Z" fill="#243044"/>',
      braille: '<rect x="16" y="10" width="40" height="44" rx="4" fill="#fff" stroke="#243044"/><circle cx="30" cy="22" r="3" fill="#243044"/><circle cx="42" cy="22" r="3" fill="#243044"/><circle cx="30" cy="34" r="3" fill="#243044"/><circle cx="42" cy="40" r="3" fill="#243044"/>',
      db: '<ellipse cx="36" cy="16" rx="18" ry="8" fill="#2b6b5e"/><path d="M18 16v24c0 5 8 8 18 8s18-3 18-8V16" fill="#243044"/><ellipse cx="36" cy="28" rx="18" ry="8" fill="none" stroke="#d9a441"/>',
      sheet: '<rect x="14" y="12" width="44" height="40" fill="#fff" stroke="#243044"/><path d="M14 24h44M14 36h44M28 12v40M42 12v40" stroke="#2b6b5e"/>',
      router: '<rect x="12" y="26" width="48" height="18" rx="3" fill="#243044"/><circle cx="22" cy="35" r="2" fill="#2f7d4a"/><path d="M30 26c4-8 12-8 16 0" fill="none" stroke="#d9a441" stroke-width="3"/>',
      sensor: '<circle cx="36" cy="34" r="10" fill="#c24e1f"/><path d="M36 8v10M36 46v10M14 34h10M48 34h12" stroke="#243044" stroke-width="3"/>',
      screen: '<rect x="10" y="12" width="52" height="32" rx="3" fill="#243044"/><rect x="14" y="16" width="44" height="24" fill="#7fb7c9"/><rect x="30" y="44" width="12" height="6" fill="#3b4658"/><rect x="22" y="50" width="28" height="4" fill="#243044"/>',
      shield: '<path d="M36 8 L58 16 V34 C58 48 36 58 36 58 C36 58 14 48 14 34 V16 Z" fill="#2b6b5e"/><path d="M28 32 l6 6 12-14" fill="none" stroke="#fff8eb" stroke-width="3"/>',
      oswin: '<rect x="12" y="12" width="48" height="40" rx="3" fill="#243044"/><rect x="16" y="18" width="18" height="14" fill="#7fb7c9"/><rect x="38" y="18" width="18" height="14" fill="#d9a441"/><rect x="16" y="34" width="40" height="12" fill="#fff8eb"/>'
    };
    return '<svg viewBox="0 0 72 64" aria-hidden="true">' + (s[type] || s.box) + "</svg>";
  }

  function current() {
    return data.scenarios[state.index];
  }

  function showToast(text, kind) {
    els.toast.textContent = text;
    els.toast.className = "toast " + (kind || "");
    clearTimeout(showToast.t);
    showToast.t = setTimeout(function () {
      els.toast.classList.add("hidden");
    }, 4200);
  }

  function setHidden(el, isHidden) {
    el.classList.toggle("hidden", isHidden);
    if (isHidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function openModal(html) {
    els.modal.innerHTML = html;
    setHidden(els.overlay, false);
  }

  function closeModal() {
    setHidden(els.overlay, true);
  }

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function renderStart() {
    els.axesStrip.innerHTML = data.axes.map(function (axis) {
      return (
        '<article class="axis-chip">' +
          "<small>المحور " + axis.id + " / Axis " + axis.id + "</small>" +
          "<b>" + axis.name + "</b>" +
          '<span class="en">' + axis.en + "</span>" +
        "</article>"
      );
    }).join("");
  }

  function renderDots() {
    els.dots.innerHTML = data.scenarios.map(function (_, i) {
      var cls = i < state.index ? "done" : i === state.index ? "now" : "";
      return '<span class="dot ' + cls + '"></span>';
    }).join("");
  }

  function renderScenario() {
    var sc = current();
    state.kept = [];
    state.triedWrong = [];
    state.picks = [];
    state.scenarioStarted = Date.now();
    state.order = shuffle(sc.pool);
    state.selected = null;
    state.complete = false;
    els.kicker.textContent = sc.aim + " · " + sc.company + " · مهمة " + (state.index + 1);
    els.title.textContent = sc.title;
    els.story.textContent = sc.story;
    els.mission.textContent = "مهمتكِ: " + sc.mission;
    els.index.textContent = (state.index + 1) + " / " + data.scenarios.length;
    els.axisLive.textContent = sc.aimTitle || "اقرئي القصة ثم اختاري أربعة";
    els.score.textContent = state.score;
    els.next.disabled = false;
    els.next.textContent = state.index === data.scenarios.length - 1 ? "إنهاء المختبر" : "التالي";
    renderDots();
    renderPool();
    renderCrate();
  }

  function renderPool() {
    els.pool.innerHTML = state.order.map(function (id) {
      var item = data.items[id];
      var used = state.kept.indexOf(id) !== -1;
      var locked = state.complete && !used;
      var cls = "item" + (used ? " used" : "") + (locked ? " locked" : "");
      return (
        '<article class="' + cls + '" data-id="' + id + '" role="button" tabindex="' + (locked || used ? "-1" : "0") + '"' +
          (locked ? ' aria-disabled="true"' : "") + ">" +
          '<div class="item-art" style="background:' + item.color + '">' + icon(item.art) + "</div>" +
          "<strong>" + item.name + "</strong>" +
          "<em>" + axisName(item.axis) + "</em>" +
        "</article>"
      );
    }).join("");
    Array.prototype.forEach.call(els.pool.querySelectorAll(".item:not(.used):not(.locked)"), bindItem);
  }

  function renderCrate() {
    els.neededCount.textContent = state.kept.length + " / " + current().needed.length;
    els.crate.classList.toggle("complete", state.complete);
    if (els.crateHint) {
      els.crateHint.textContent = state.complete
        ? "اكتمل الاختيار — لا تضيفي بطاقة زائدة"
        : "ضعي هنا ما يناسب هذه المؤسسة";
    }
    if (!state.kept.length) {
      els.crateItems.innerHTML = "";
      return;
    }
    els.crateItems.innerHTML = state.kept.map(function (id) {
      var item = data.items[id];
      return '<div class="kept">' + item.name + "<small>" + axisName(item.axis) + "</small></div>";
    }).join("");
  }

  function bindItem(card) {
    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("click", onItemClick);
    card.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onItemClick({ currentTarget: card });
      }
    });
  }

  function onItemClick(e) {
    if (state.complete) {
      remindComplete();
      return;
    }
    if (state.drag || state.justDragged) return;
    var id = e.currentTarget.getAttribute("data-id");
    if (state.kept.indexOf(id) !== -1) return;
    Array.prototype.forEach.call(els.pool.querySelectorAll(".item"), function (el) {
      el.classList.remove("selected");
    });
    e.currentTarget.classList.add("selected");
    state.selected = id;
    showToast("حسناً. اضغطي الآن على صندوق المؤسسة لوضع البطاقة.", "");
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (state.complete) {
      remindComplete();
      return;
    }
    var card = e.currentTarget;
    var id = card.getAttribute("data-id");
    if (state.kept.indexOf(id) !== -1) return;
    var startX = e.clientX;
    var startY = e.clientY;
    var moved = false;
    var ghost = null;

    function move(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      moved = true;
      if (!ghost) {
        ghost = card.cloneNode(true);
        ghost.classList.add("dragging");
        document.body.appendChild(ghost);
        card.style.opacity = "0.35";
        try { card.setPointerCapture(e.pointerId); } catch (err) {}
      }
      ghost.style.left = ev.clientX - 75 + "px";
      ghost.style.top = ev.clientY - 40 + "px";
      var over = hitCrate(ev.clientX, ev.clientY);
      els.crate.classList.toggle("over", over);
    }

    function up(ev) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      card.style.opacity = "";
      els.crate.classList.remove("over");
      if (ghost) ghost.remove();
      state.drag = null;
      if (moved) {
        state.justDragged = true;
        setTimeout(function () { state.justDragged = false; }, 200);
      }
      if (moved && hitCrate(ev.clientX, ev.clientY)) {
        tryDrop(id);
      }
    }

    state.drag = id;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function hitCrate(x, y) {
    var r = els.crate.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function nextButtonLabel() {
    return state.index === data.scenarios.length - 1 ? "إنهاء المختبر" : "التالي";
  }

  function showCompleteNotice() {
    openModal(
      "<h3>اكتمل اختيار هذه المؤسسة</h3>" +
      "<p>أحسنتِ. وضعتِ ما تحتاجه هذه المؤسسة فقط.</p>" +
      '<div class="reason-box">' +
        "توقفي هنا. أي بطاقة زائدة تخصم نقطة، لأن الأداة الصحيحة في المكان الخطأ لا تُحسب." +
      "</div>" +
      "<p>عندما تكونين جاهزة، اضغطي «" + nextButtonLabel() + "». لن ننتقل وحدنا.</p>" +
      '<button type="button" class="btn btn-primary" id="btn-close-modal">حسناً، أنتقل عند الجاهزية</button>'
    );
    document.getElementById("btn-close-modal").onclick = closeModal;
  }

  function remindComplete() {
    showToast("الاختيار مكتمل. لا تضيفي بطاقة زائدة. اضغطي «" + nextButtonLabel() + "» عندما تكونين جاهزة.", "good");
  }

  function markScenarioComplete() {
    state.complete = true;
    state.selected = null;
    els.axisLive.textContent = "الاختيار مكتمل · لا تضيفي بطاقة زائدة";
    renderPool();
    renderCrate();
    showCompleteNotice();
  }

  function tryDrop(id) {
    var sc = current();
    if (state.complete) {
      remindComplete();
      return;
    }
    if (state.kept.indexOf(id) !== -1) return;
    if (sc.needed.indexOf(id) !== -1) {
      state.kept.push(id);
      state.picks.push({
        name: data.items[id].name,
        axis: axisName(data.items[id].axis),
        result: "صحيحة",
        why: sc.why[id] || ""
      });
      state.score += 10;
      state.correct += 1;
      els.score.textContent = state.score;
      renderPool();
      renderCrate();
      if (state.kept.length === sc.needed.length) {
        markScenarioComplete();
      } else {
        showToast("أحسنتِ. " + sc.why[id], "good");
      }
    } else {
      if (state.triedWrong.indexOf(id) === -1) {
        state.triedWrong.push(id);
        state.picks.push({
          name: data.items[id].name,
          axis: axisName(data.items[id].axis),
          result: "خاطئة",
          why: sc.whyNot[id] || ""
        });
        state.wrong += 1;
        state.score = Math.max(0, state.score - 1);
        els.score.textContent = state.score;
      }
      showToast("هذه البطاقة لمكان آخر.", "bad");
      openModal(
        "<h3>من المواصفة، لكنها لا تناسب هذه القصة</h3>" +
        "<p><b>" + data.items[id].name + "</b> · " + axisName(data.items[id].axis) + "</p>" +
        '<div class="reason-box">' + sc.whyNot[id] + "</div>" +
        "<p>تابعي البطاقات الباقية، أو اضغطي التالي عندما تكونين جاهزة.</p>" +
        '<button type="button" class="btn btn-primary" id="btn-close-modal">فهمت، أتابع</button>'
      );
      document.getElementById("btn-close-modal").onclick = closeModal;
    }
  }

  function goNext() {
    closeModal();
    snapshotScenario();
    if (state.index >= data.scenarios.length - 1) {
      finish();
      return;
    }
    state.index += 1;
    renderScenario();
    window.scrollTo(0, 0);
  }

  function finish() {
    var record = storeCurrentResult();
    var sent = sendCloud(record);
    setHidden(els.game, true);
    setHidden(els.end, false);
    document.getElementById("end-score").textContent = state.score;
    document.getElementById("end-correct").textContent = state.correct;
    document.getElementById("end-wrong").textContent = state.wrong;
    var endTime = document.getElementById("end-time");
    if (endTime) endTime.textContent = record.durationText;
    var note = "القاعدة: الأداة الصحيحة هي التي تخدم وظيفة هذه المؤسسة اليوم. ";
    if (state.wrong <= 4) note += "اختياركِ كان دقيقاً.";
    else if (state.wrong <= 10) note += "أداؤكِ جيد. البطاقات التي رُفضت صحيحة في قصة أخرى.";
    else note += "أعيدي مهمة واسألي: هل هذا يناسب هذه المؤسسة، أم مؤسسة مختلفة؟";
    note += " أنجزتِ " + record.percent + "% من البطاقات الصحيحة.";
    note += sent
      ? " نتيجتكِ أُرسلت إلى جدول المعلمة."
      : " نتيجتكِ محفوظة على هذا الجهاز، ويمكنكِ تنزيل ملف Excel.";
    document.getElementById("end-note").textContent = note;
  }

  function showHint() {
    var sc = current();
    var missing = sc.needed.filter(function (id) { return state.kept.indexOf(id) === -1; });
    if (!missing.length) {
      remindComplete();
      return;
    }
    var id = missing[0];
    var item = data.items[id];
    showToast("تلميح: انظري إلى بطاقة من «" + axisName(item.axis) + "». " + data.axes[item.axis - 1].hint, "");
    Array.prototype.forEach.call(els.pool.querySelectorAll(".item"), function (el) {
      el.classList.toggle("hinting", el.getAttribute("data-id") === id);
    });
  }

  function showGuide() {
    var html = "<h3>دليل الهدف أ</h3><p>خريطة المواصفة بلغة بسيطة. في اللعبة تختارين ما يناسب المؤسسة، لا كل ما هو صحيح في العالم.</p>";
    (data.guide || []).forEach(function (section) {
      html += "<p><b>" + section.title + "</b><span class='en'>" + section.en + "</span></p><ul class='guide-list'>";
      section.points.forEach(function (point) {
        html += "<li><b>" + point.name + ".</b> " + point.text + "</li>";
      });
      html += "</ul>";
    });
    html += '<button type="button" class="btn btn-primary" id="btn-close-modal">إغلاق الدليل</button>';
    openModal(html);
    document.getElementById("btn-close-modal").onclick = closeModal;
  }

  function startMission() {
    var nameEl = document.getElementById("student-name");
    var classEl = document.getElementById("student-class");
    var err = document.getElementById("name-error");
    var name = (nameEl.value || "").trim();
    nameEl.classList.remove("invalid");
    if (err) err.classList.add("hidden");
    if (!name) {
      nameEl.classList.add("invalid");
      if (err) err.classList.remove("hidden");
      nameEl.focus();
      try { nameEl.scrollIntoView({ block: "center" }); } catch (e1) {}
      return;
    }
    state.studentName = name;
    state.studentClass = classEl ? (classEl.value || "").trim() : "";
    state.startedAt = Date.now();
    state.index = 0;
    state.score = 0;
    state.correct = 0;
    state.wrong = 0;
    state.log = [];
    setHidden(els.start, true);
    setHidden(els.game, false);
    try {
      renderScenario();
      window.scrollTo(0, 0);
    } catch (err2) {
      setHidden(els.game, true);
      setHidden(els.start, false);
      if (err) {
        err.textContent = "تعذر بدء المهمة. حدّث الصفحة وحاول مرة أخرى.";
        err.classList.remove("hidden");
      }
    }
  }

  document.getElementById("btn-next").onclick = goNext;
  var hintBtn = document.getElementById("btn-hint");
  if (hintBtn) hintBtn.onclick = showHint;
  document.getElementById("btn-guide").onclick = showGuide;
  var guideStart = document.getElementById("btn-guide-start");
  if (guideStart) guideStart.onclick = showGuide;
  var guideEnd = document.getElementById("btn-guide-end");
  if (guideEnd) guideEnd.onclick = showGuide;
  document.getElementById("btn-export-mine").onclick = function () {
    downloadExcel("نتيجة-" + safeFilePart(state.studentName) + ".xls", [buildRecord()]);
  };
  document.getElementById("player-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    startMission();
  });
  var nameInput = document.getElementById("student-name");
  if (nameInput) {
    nameInput.addEventListener("input", function () {
      var err = document.getElementById("name-error");
      nameInput.classList.remove("invalid");
      if (err) err.classList.add("hidden");
    });
  }
  document.getElementById("btn-restart").onclick = function () {
    state.index = 0;
    state.score = 0;
    state.correct = 0;
    state.wrong = 0;
    state.log = [];
    setHidden(els.end, true);
    setHidden(els.start, false);
  };
  els.crate.addEventListener("click", function () {
    if (state.complete) {
      remindComplete();
      return;
    }
    if (state.selected) {
      var id = state.selected;
      state.selected = null;
      tryDrop(id);
    }
  });
  els.overlay.addEventListener("click", function (e) {
    if (e.target === els.overlay) closeModal();
  });

  try {
    renderStart();
  } catch (bootErr) {
    var boot = document.getElementById("name-error");
    if (boot) {
      boot.textContent = "تعذر تحميل اللعبة. حدّث الصفحة.";
      boot.classList.remove("hidden");
    }
  }
})();
