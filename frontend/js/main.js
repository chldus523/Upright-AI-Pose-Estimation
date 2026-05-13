(function () {
  var $ = window.jQuery || window.$ || createDomLite();
  var postureAudioContext;
  var lastScore = 0;
  var lastAlertAt = 0;
  var reportChart;
  var liveSimulationTimer;
  var webcamStream;
  var analysisSocket;
  var socketReady = false;
  var webcamEnabled = false;
  var backendReady = false;
  var analysisInFlight = false;
  var SESSION_LIMIT = 12;
  var SESSION_PERSIST_INTERVAL_MS = 60 * 1000;
  var EVENT_LIMIT = 16;
  var LIVE_INTERVAL_MS = 240;
  var GUIDE_VIDEO_ID = "5fnEEzi_ev0";
  var reportState = {
    range: "today",
    visible: {
      score: true,
      neck: true,
      shoulder: true,
      tilt: true
    }
  };
  var STORAGE_KEYS = {
    sessions: "upright-ai-sessions",
    events: "upright-ai-events",
    guide: "upright-ai-guide-progress",
    guideReminder: "upright-ai-guide-reminder"
  };
  var guideReminderTimer = null;
  var lastFrameDims = { w: 640, h: 480 };
  var _ftHandler = null;
  var _ftPrev = null;

  var SKELETON_CONNECTIONS = [
    ["left_ear",       "left_shoulder"],
    ["right_ear",      "right_shoulder"],
    ["left_shoulder",  "right_shoulder"],
    ["left_shoulder",  "left_elbow"],
    ["left_elbow",     "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow",    "right_wrist"],
    ["left_shoulder",  "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip",       "right_hip"]
  ];

  var SKELETON_KEY_JOINT_RADIUS = {
    nose: 5, left_ear: 6, right_ear: 6,
    left_shoulder: 7, right_shoulder: 7,
    left_hip: 6, right_hip: 6
  };

  var SKELETON_SKIP_POINTS = {
    face_center: true, chest_center: true, hip_center: true, mouth_center: true
  };

  var GUIDE_CHECK_HINTS = [
    {
      title: "모니터 높이 정렬",
      copy: "화면 상단이 눈높이에 오면 목 굴곡이 줄어들고 장시간 집중 시 피로 누적이 완만해집니다."
    },
    {
      title: "어깨 긴장 완화",
      copy: "어깨 힘을 빼면 승모근 과긴장을 줄일 수 있고, 거북목 패턴이 같이 심해지는 것을 막는 데 도움이 됩니다."
    },
    {
      title: "몸통 중심 유지",
      copy: "몸통이 한쪽으로 기울지 않으면 허리와 어깨 보상 움직임이 줄어들어 자세 점수 안정성이 높아집니다."
    },
    {
      title: "재점검 리듬 만들기",
      copy: "좋은 자세도 시간이 지나면 무너지기 쉬워서, 30분 주기 재점검이 실제 습관 형성에 가장 효과적입니다."
    }
  ];

  function createDomLite() {
    var dataStore = new WeakMap();

    function toElements(input) {
      if (!input) {
        return [];
      }
      if (Array.isArray(input)) {
        return input.filter(Boolean);
      }
      if (input instanceof DomLiteCollection) {
        return input.elements.slice();
      }
      if (typeof input === "string") {
        return Array.prototype.slice.call(document.querySelectorAll(input));
      }
      if (input instanceof NodeList || input instanceof HTMLCollection) {
        return Array.prototype.slice.call(input);
      }
      if (input === window || input === document || input.nodeType) {
        return [input];
      }
      return [];
    }

    function getDataBucket(element) {
      if (!dataStore.has(element)) {
        dataStore.set(element, {});
      }
      return dataStore.get(element);
    }

    function DomLiteCollection(elements) {
      this.elements = elements || [];
      this.length = this.elements.length;
    }

    DomLiteCollection.prototype.each = function (callback) {
      this.elements.forEach(function (element, index) {
        callback.call(element, index, element);
      });
      return this;
    };

    DomLiteCollection.prototype.map = function (callback) {
      var mapped = this.elements.map(function (element, index) {
        return callback.call(element, index, element);
      });
      return {
        get: function () {
          return mapped;
        }
      };
    };

    DomLiteCollection.prototype.text = function (value) {
      if (typeof value === "undefined") {
        return this.elements[0] ? this.elements[0].textContent : "";
      }
      return this.each(function () {
        this.textContent = value;
      });
    };

    DomLiteCollection.prototype.html = function (value) {
      if (typeof value === "undefined") {
        return this.elements[0] ? this.elements[0].innerHTML : "";
      }
      return this.each(function () {
        this.innerHTML = value;
      });
    };

    DomLiteCollection.prototype.empty = function () {
      return this.html("");
    };

    DomLiteCollection.prototype.show = function () {
      return this.each(function () {
        this.style.display = "";
      });
    };

    DomLiteCollection.prototype.hide = function () {
      return this.each(function () {
        this.style.display = "none";
      });
    };

    DomLiteCollection.prototype.addClass = function (classNames) {
      var classes = String(classNames || "").split(/\s+/).filter(Boolean);
      return this.each(function () {
        this.classList.add.apply(this.classList, classes);
      });
    };

    DomLiteCollection.prototype.removeClass = function (classNames) {
      var classes = String(classNames || "").split(/\s+/).filter(Boolean);
      return this.each(function () {
        this.classList.remove.apply(this.classList, classes);
      });
    };

    DomLiteCollection.prototype.toggleClass = function (className, force) {
      return this.each(function () {
        if (typeof force === "boolean") {
          this.classList.toggle(className, force);
        } else {
          this.classList.toggle(className);
        }
      });
    };

    DomLiteCollection.prototype.attr = function (name, value) {
      if (typeof value === "undefined") {
        return this.elements[0] ? this.elements[0].getAttribute(name) : undefined;
      }
      return this.each(function () {
        this.setAttribute(name, value);
      });
    };

    DomLiteCollection.prototype.prop = function (name, value) {
      if (typeof value === "undefined") {
        return this.elements[0] ? this.elements[0][name] : undefined;
      }
      return this.each(function () {
        this[name] = value;
      });
    };

    DomLiteCollection.prototype.css = function (name, value) {
      if (typeof value === "undefined") {
        return this.elements[0] ? this.elements[0].style[name] : undefined;
      }
      return this.each(function () {
        this.style[name] = value;
      });
    };

    DomLiteCollection.prototype.data = function (key, value) {
      if (!this.elements[0]) {
        return typeof value === "undefined" ? undefined : this;
      }
      if (typeof value === "undefined") {
        return getDataBucket(this.elements[0])[key];
      }
      return this.each(function () {
        getDataBucket(this)[key] = value;
      });
    };

    DomLiteCollection.prototype.stop = function () {
      return this;
    };

    DomLiteCollection.prototype.on = function (eventName, handler) {
      return this.each(function () {
        if (!this.__domLiteHandlers) {
          this.__domLiteHandlers = {};
        }
        if (!this.__domLiteHandlers[eventName]) {
          this.__domLiteHandlers[eventName] = [];
        }
        this.__domLiteHandlers[eventName].push(handler);
        this.addEventListener(eventName, handler);
      });
    };

    DomLiteCollection.prototype.off = function (eventName) {
      return this.each(function () {
        if (!this.__domLiteHandlers || !this.__domLiteHandlers[eventName]) {
          return;
        }
        this.__domLiteHandlers[eventName].forEach(function (handler) {
          this.removeEventListener(eventName, handler);
        }, this);
        this.__domLiteHandlers[eventName] = [];
      });
    };

    DomLiteCollection.prototype.click = function (handler) {
      return this.on("click", handler);
    };

    DomLiteCollection.prototype.change = function (handler) {
      return this.on("change", handler);
    };

    DomLiteCollection.prototype.find = function (selector) {
      if (!this.elements[0]) {
        return new DomLiteCollection([]);
      }
      return new DomLiteCollection(Array.prototype.slice.call(this.elements[0].querySelectorAll(selector)));
    };

    DomLiteCollection.prototype.closest = function (selector) {
      if (!this.elements[0]) {
        return new DomLiteCollection([]);
      }
      var found = this.elements[0].closest(selector);
      return new DomLiteCollection(found ? [found] : []);
    };

    DomLiteCollection.prototype.is = function (selector) {
      if (!this.elements[0]) {
        return false;
      }
      if (selector === ":checked") {
        return Boolean(this.elements[0].checked);
      }
      return this.elements[0].matches(selector);
    };

    function domLite(input) {
      if (typeof input === "function") {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", input);
        } else {
          input();
        }
        return new DomLiteCollection([]);
      }
      return new DomLiteCollection(toElements(input));
    }

    window.$ = domLite;
    return domLite;
  }

  function statusClass(status) {
    if (status === "Good") {
      return "good";
    }
    if (status === "Warning") {
      return "warning";
    }
    return "critical";
  }

  function badgeClass(status) {
    if (status === "Good") {
      return "good-bg";
    }
    if (status === "Warning") {
      return "warning-bg";
    }
    return "critical-bg";
  }

  function textClass(status) {
    if (status === "Good") {
      return "good-text";
    }
    if (status === "Warning") {
      return "warning-text";
    }
    return "critical-text";
  }

  function localizedStatus(status) {
    if (status === "Good") {
      return "양호";
    }
    if (status === "Warning") {
      return "주의";
    }
    return "위험";
  }

  function deriveStatus(score) {
    if (score >= 80) {
      return "Good";
    }
    if (score >= 65) {
      return "Warning";
    }
    return "Critical";
  }

  function formatNumber(value) {
    return Number(value).toFixed(value % 1 === 0 ? 0 : 1);
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function readStorage(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }

  function getSessions() {
    return readStorage(STORAGE_KEYS.sessions, []);
  }

  function saveSession(entry) {
    var sessions = getSessions();
    sessions.unshift(entry);
    writeStorage(STORAGE_KEYS.sessions, sessions.slice(0, SESSION_LIMIT));
  }

  function clearSessions() {
    writeStorage(STORAGE_KEYS.sessions, []);
    initSidebarSummary();
  }

  function getEvents() {
    return readStorage(STORAGE_KEYS.events, []);
  }

  function initSidebarSummary() {
    if (!$("#sidebar-latest-score").length) {
      return;
    }

    var sessions = getSessions();
    var guideChecklist = readStorage(STORAGE_KEYS.guide, []);
    var latestSession = sessions[0];
    var guideChecked = guideChecklist.filter(Boolean).length;
    var guideScore = Math.round((guideChecked / 4) * 100);

    $("#sidebar-session-count").text(sessions.length);
    $("#sidebar-guide-score").text(guideScore + "점");

    if (!latestSession) {
      $("#sidebar-latest-score").text("--");
      $("#sidebar-latest-status").text("아직 저장된 분석 결과가 없습니다");
      return;
    }

    $("#sidebar-latest-score").text(latestSession.total_score + "점");
    $("#sidebar-latest-status").text(localizedStatus(latestSession.status) + " · " + summarizeSessionIssue(latestSession));
  }

  function saveEvent(entry) {
    var events = getEvents();
    events.unshift(entry);
    writeStorage(STORAGE_KEYS.events, events.slice(0, EVENT_LIMIT));
  }

  function buildSessionEntry(data, timestamp, sourceLabel) {
    return {
      status: data.status,
      total_score: data.total_score,
      neck_angle: data.neck_angle,
      shoulder_tilt: data.shoulder_tilt,
      body_tilt: data.body_tilt,
      feedback: data.feedback || "",
      timestamp: timestamp || Date.now(),
      source: sourceLabel || "자동 분석"
    };
  }

  function seedSimulatedSessions() {
    return;
  }

  function getLatestSessionOrBase() {
    var sessions = getSessions();
    if (sessions.length) {
      return sessions[0];
    }
    return buildSessionEntry(fetchPostureData(), Date.now(), "대기 상태");
  }

  function showToast(message) {
    var $toast = $("#toast");
    if (!$toast.length) {
      return;
    }
    $toast.stop(true, true).text(message).addClass("show");
    window.clearTimeout($toast.data("timeoutId"));
    var timeoutId = window.setTimeout(function () {
      $toast.removeClass("show");
    }, 2200);
    $toast.data("timeoutId", timeoutId);
  }

  function trapFocus(el) {
    if (!el) return;
    _ftPrev = document.activeElement;
    var sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var focusable = Array.prototype.slice.call(el.querySelectorAll(sel));
    if (focusable.length) focusable[0].focus();
    _ftHandler = function (e) {
      if (e.key !== "Tab") return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener("keydown", _ftHandler);
  }

  function releaseFocusTrap(el) {
    if (_ftHandler && el) el.removeEventListener("keydown", _ftHandler);
    _ftHandler = null;
    if (_ftPrev && typeof _ftPrev.focus === "function") _ftPrev.focus();
    _ftPrev = null;
  }

  function setWebcamConsentModal(isVisible) {
    var $modal = $("#webcam-consent-modal");
    if (!$modal.length) {
      return;
    }
    $modal.toggleClass("show", isVisible).attr("aria-hidden", isVisible ? "false" : "true");
    $("body").css("overflow", isVisible ? "hidden" : "");
    var inner = document.querySelector("#webcam-consent-modal .modal-card");
    if (isVisible) trapFocus(inner); else releaseFocusTrap(inner);
  }

  function setStopAnalysisModal(isVisible) {
    var $modal = $("#stop-analysis-modal");
    if (!$modal.length) {
      return;
    }
    $modal.toggleClass("show", isVisible).attr("aria-hidden", isVisible ? "false" : "true");
    $("body").css("overflow", isVisible ? "hidden" : "");
    var inner = document.querySelector("#stop-analysis-modal .modal-card");
    if (isVisible) trapFocus(inner); else releaseFocusTrap(inner);
  }

  function setButtonLoading($button, isLoading, loadingText, defaultText) {
    if (!$button.length) {
      return;
    }
    $button.prop("disabled", isLoading);
    $button.text(isLoading ? loadingText : defaultText);
    $button.css("opacity", isLoading ? 0.7 : "");
  }

  function getMetricHint(key, value) {
    if (key === "neck") {
      return value >= 45 ? "목 정렬이 안정적으로 유지되고 있습니다" : "턱을 살짝 당기고 화면 높이를 올려보세요";
    }
    if (key === "shoulder") {
      return value <= 4 ? "어깨 좌우 균형이 안정적입니다" : "올라간 어깨 힘을 풀고 좌우 높이를 맞추세요";
    }
    return value <= 7 ? "상체 중심이 잘 유지되고 있습니다" : "상체가 앞으로 기울어져 있습니다. 등을 곧게 펴세요";
  }

  function getActionFeedback(data, status) {
    return buildDetailedFeedback(data, status);
  }

  function buildDetailedFeedback(data, status) {
    if (!data || data.has_pose === false) {
      return "상체가 카메라 안에 충분히 들어오지 않아 정밀 분석이 어렵습니다. 어깨와 얼굴이 모두 프레임 안에 보이도록 의자 위치와 카메라 각도를 먼저 조정한 뒤 다시 자세를 잡아주세요.";
    }

    var neck = Number(data.neck_angle || 0);
    var shoulder = Number(data.shoulder_tilt || 0);
    var body = Number(data.body_tilt || 0);
    var messages = [];

    if (neck < 40) {
      messages.push("목 정렬이 크게 무너져 있습니다. 턱을 가볍게 뒤로 당기고 시선을 정면으로 올려 귀와 어깨가 수직선에 가까워지도록 다시 맞춰주세요. 지금처럼 고개가 앞으로 빠진 상태가 지속되면 목 앞쪽 긴장과 어깨 말림이 함께 심해질 수 있습니다.");
    } else if (neck < 46) {
      messages.push("목이 살짝 앞으로 나오기 시작했습니다. 모니터를 조금 더 눈높이에 가깝게 올리고, 턱을 미세하게 당겨 경추의 중립 위치를 회복해보세요.");
    }

    if (shoulder >= 6.5) {
      messages.push("어깨 좌우 높이 차이가 분명하게 감지됩니다. 지배측 손에 힘이 과하게 들어가고 있지 않은지 확인하고, 양쪽 어깨를 아래로 내린 뒤 쇄골 라인이 수평에 가까워지도록 정렬해보세요.");
    } else if (shoulder >= 4.0) {
      messages.push("어깨 균형이 조금 흔들리고 있습니다. 마우스나 키보드를 잡는 손목과 어깨 힘을 한 번 풀고, 양쪽 팔꿈치 높이를 비슷하게 맞춰 좌우 비대칭이 커지지 않도록 해주세요.");
    }

    if (body >= 9) {
      messages.push("상체가 앞으로 기울어진 폭이 큽니다. 허리를 과하게 젖히기보다 골반을 의자 중앙에 세우고 가슴을 부드럽게 열어 몸통 중심을 수직으로 다시 세워주세요.");
    } else if (body >= 6) {
      messages.push("상체 중심이 조금 앞으로 쏠려 있습니다. 복부 힘을 살짝 유지한 채 명치를 위로 끌어올린다는 느낌으로 상체가 앞으로 무너지지 않게 다시 정렬해보세요.");
    }

    if (!messages.length && status === "Good") {
      return "현재 자세는 전반적으로 안정적입니다. 목, 어깨, 상체 중심이 비교적 고르게 유지되고 있으니 지금의 앉은 위치를 크게 바꾸지 말고 같은 정렬을 계속 유지하세요. 다만 좋은 자세도 시간이 지나면 쉽게 무너지므로 20~30분 간격으로 턱과 어깨 힘이 다시 들어가지는 않는지만 짧게 점검해주면 좋습니다.";
    }

    if (!messages.length && status === "Warning") {
      return "큰 붕괴는 아니지만 자세 정렬이 서서히 흐트러지고 있습니다. 한 번에 전부 고치기보다 목, 어깨, 몸통 중심 순서로 한 항목씩 다시 맞추면 점수를 더 안정적으로 끌어올릴 수 있습니다.";
    }

    if (!messages.length) {
      return "현재 자세 부담이 크게 감지됩니다. 턱을 당기고, 어깨를 내리고, 몸통을 세우는 세 가지를 우선 순서대로 정리한 뒤 같은 자세를 10초 정도 유지해보세요.";
    }

    return messages.join(" ");
  }

  function buildSummaryFeedback(data, status, detailedFeedback) {
    if (!data || data.has_pose === false) {
      return "상체가 화면에 충분히 보이도록 위치를 먼저 맞춰주세요.";
    }

    var neck = Number(data.neck_angle || 0);
    var shoulder = Number(data.shoulder_tilt || 0);
    var body = Number(data.body_tilt || 0);

    if (status === "Good") {
      if (neck >= 48 && shoulder <= 3.5 && body <= 5.5) {
        return "자세가 매우 안정적입니다. 현재 정렬을 그대로 유지하세요.";
      }
      return "전반적인 자세는 양호합니다. 목과 어깨 힘만 조금씩 풀어 현재 균형을 유지하세요.";
    }

    if (body >= shoulder && body >= 8) {
      return "상체 전방 기울기가 주요 원인입니다. 몸통을 세우고 시선을 정면으로 올려주세요.";
    }
    if (shoulder >= 5) {
      return "어깨 좌우 균형이 무너지고 있습니다. 어깨를 내리고 높이를 다시 맞춰주세요.";
    }
    if (neck <= 42) {
      return "목이 앞으로 나오고 있습니다. 턱을 당겨 귀와 어깨선을 다시 맞춰주세요.";
    }
    if (status === "Warning") {
      return "자세 편차가 감지됩니다. 무너진 한 지점을 먼저 바로잡아 점수를 안정화하세요.";
    }
    return detailedFeedback ? detailedFeedback.split(". ").slice(0, 2).join(". ") : "위험 자세가 감지되었습니다. 자세를 즉시 다시 정렬해주세요.";
  }

  function updateScoreRing(score) {
    var ringEl = document.getElementById("score-ring-fill");
    if (!ringEl) return;
    var circumference = 314.16;
    var clamped = Math.min(100, Math.max(0, Number(score) || 0));
    ringEl.style.strokeDashoffset = circumference * (1 - clamped / 100);
    updateScoreFace(clamped);
  }

  function updateScoreFace(clamped) {
    var eyesDot = document.getElementById("face-eyes-dot");
    var eyesArc = document.getElementById("face-eyes-arc");
    var brows   = document.getElementById("face-brows");
    var mouth   = document.getElementById("face-mouth");
    var cheeks  = document.getElementById("face-cheeks");
    if (!mouth) return;
    if (clamped >= 90) {
      eyesDot && (eyesDot.style.display = "none");
      eyesArc && (eyesArc.style.display = "");
      brows   && (brows.style.display   = "none");
      cheeks  && (cheeks.style.display  = "");
      mouth.setAttribute("d", "M11 24 Q20 33 29 24");
    } else if (clamped >= 80) {
      eyesDot && (eyesDot.style.display = "");
      eyesArc && (eyesArc.style.display = "none");
      brows   && (brows.style.display   = "none");
      cheeks  && (cheeks.style.display  = "none");
      mouth.setAttribute("d", "M13 24 Q20 30 27 24");
    } else if (clamped >= 65) {
      eyesDot && (eyesDot.style.display = "");
      eyesArc && (eyesArc.style.display = "none");
      brows   && (brows.style.display   = "none");
      cheeks  && (cheeks.style.display  = "none");
      mouth.setAttribute("d", "M14 26 L26 26");
    } else {
      eyesDot && (eyesDot.style.display = "");
      eyesArc && (eyesArc.style.display = "none");
      brows   && (brows.style.display   = "");
      cheeks  && (cheeks.style.display  = "none");
      mouth.setAttribute("d", "M13 29 Q20 23 27 29");
    }
  }

  function getMetricStatusClass(key, value) {
    var v = parseFloat(value);
    if (key === "neck") return v >= 45 ? "good" : v >= 40 ? "warning" : "critical";
    if (key === "shoulder") return v <= 4 ? "good" : v <= 6.5 ? "warning" : "critical";
    if (key === "body") return v <= 7 ? "good" : v <= 9 ? "warning" : "critical";
    return "";
  }

  function createMetricCard(title, value, suffix, hint, statusKey) {
    var sc = statusKey ? " metric-" + getMetricStatusClass(statusKey, value) : "";
    return [
      '<div class="metric-card' + sc + '">',
      "<h4>" + title + "</h4>",
      "<strong>" + value + suffix + "</strong>",
      "<span>" + hint + "</span>",
      "</div>"
    ].join("");
  }

  function buildCoachItems(data, status) {
    var items = [
      { label: "목 정렬", value: data.neck_angle + "°", hint: data.neck_angle >= 45 ? "시선 높이가 안정적입니다" : "모니터를 눈높이에 맞춰 목 부담을 줄이세요" },
      { label: "어깨 균형", value: formatNumber(data.shoulder_tilt) + "°", hint: data.shoulder_tilt <= 4 ? "좌우 높이가 잘 유지됩니다" : "지배측 어깨를 내리고 긴장을 풀어주세요" },
      { label: "상체 기울기", value: formatNumber(data.body_tilt) + "°", hint: data.body_tilt <= 7 ? "몸통 중심이 안정적입니다" : "등받이에 기대지 말고 몸통 중심을 세우세요" }
    ];

    if (status === "Critical") {
      items.push({ label: "즉시 교정 권장", value: "우선 조정", hint: "턱을 당기고 가슴을 펴며 착석 위치를 다시 맞추세요" });
    }

    return items.map(function (item) {
      return [
        '<div class="coach-item">',
        "<div><strong>" + item.label + "</strong><span>" + item.hint + "</span></div>",
        "<strong>" + item.value + "</strong>",
        "</div>"
      ].join("");
    }).join("");
  }

  function animateNumber(selector, start, end, suffix) {
    var range = end - start;
    var duration = 650;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) {
        startTime = timestamp;
      }
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = start + (range * eased);
      $(selector).text(formatNumber(current) + (suffix || ""));
      if (selector === "#score-value") {
        updateScoreRing(current);
      }
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        $(selector).text(formatNumber(end) + (suffix || ""));
        if (selector === "#score-value") {
          updateScoreRing(end);
        }
      }
    }

    window.requestAnimationFrame(step);
  }

  function playAlert() {
    var audioElement = document.getElementById("alert-audio");
    if (audioElement) {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
        var playAttempt = audioElement.play();
        if (playAttempt && typeof playAttempt.catch === "function") {
          playAttempt.catch(function () {
            playToneFallback();
          });
        }
        return;
      } catch (error) {
        playToneFallback();
        return;
      }
    }
    playToneFallback();
  }

  function playToneFallback() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }
    if (!postureAudioContext) {
      postureAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    var oscillator = postureAudioContext.createOscillator();
    var gain = postureAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(0.001, postureAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, postureAudioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, postureAudioContext.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(postureAudioContext.destination);
    oscillator.start();
    oscillator.stop(postureAudioContext.currentTime + 0.25);
  }

  function getAlertCooldownMs(score) {
    if (score >= 80) {
      return 0;
    }
    if (score >= 61) {
      return 4200;
    }
    if (score >= 41) {
      return 1900;
    }
    return 700;
  }

  function maybePlayAlert(score, hasPose) {
    if (!hasPose) {
      return;
    }

    var cooldownMs = getAlertCooldownMs(Number(score || 0));
    if (cooldownMs <= 0) {
      return;
    }
    var now = Date.now();
    if (now - lastAlertAt < cooldownMs) {
      return;
    }

    lastAlertAt = now;
    playAlert();
  }

  function skeletonColor(status) {
    if (status === "Good") return "#26c39f";
    if (status === "Warning") return "#d7a000";
    return "#d94343";
  }

  function coverTransform(fw, fh, cw, ch) {
    var scale = (fw / fh > cw / ch) ? ch / fh : cw / fw;
    return { scale: scale, dx: (cw - fw * scale) / 2, dy: (ch - fh * scale) / 2 };
  }

  function toCanvasPt(coord, t) {
    return { x: coord[0] * t.scale + t.dx, y: coord[1] * t.scale + t.dy };
  }

  function drawSkeleton(coords, status, fw, fh) {
    var canvas = document.getElementById("skeleton-canvas");
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    if (!coords || !Object.keys(coords).length) return;
    var ctx = canvas.getContext("2d");
    var t   = coverTransform(fw, fh, canvas.width, canvas.height);
    var col = skeletonColor(status);

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 8;
    SKELETON_CONNECTIONS.forEach(function (pair) {
      var a = coords[pair[0]], b = coords[pair[1]];
      if (!a || !b) return;
      var pa = toCanvasPt(a, t), pb = toCanvasPt(b, t);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });

    ctx.shadowBlur = 12;
    Object.keys(coords).forEach(function (name) {
      if (SKELETON_SKIP_POINTS[name]) return;
      var coord = coords[name];
      var pt = toCanvasPt(coord, t);
      var r  = SKELETON_KEY_JOINT_RADIUS[name] || 3.5;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r * 0.42, 0, 6.2832);
      ctx.fill();
    });
    ctx.restore();
  }

  function clearSkeleton() {
    var canvas = document.getElementById("skeleton-canvas");
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function setGuideMedia(mode) {
    var showVideo = mode === "video";
    var $imagePanel = $("#guide-image-panel");
    var $videoPanel = $("#guide-video-panel");
    if (!$imagePanel.length || !$videoPanel.length) {
      return;
    }

    $("#show-image").toggleClass("active", !showVideo);
    $("#show-video").toggleClass("active", showVideo);
    $imagePanel.toggleClass("active", !showVideo);
    $videoPanel.toggleClass("active", showVideo);

    if (showVideo) {
      resetGuideVideoPreview();
    } else {
      resetGuideVideoPreview();
    }
  }

  function resetGuideVideoPreview() {
    var $videoPanel = $("#guide-video-panel");
    var $iframe = $("#guide-video-frame");
    if (!$videoPanel.length || !$iframe.length) {
      return;
    }
    $videoPanel.removeClass("playing");
    $iframe.attr("src", "");
  }

  function playGuideVideo() {
    var $videoPanel = $("#guide-video-panel");
    var $iframe = $("#guide-video-frame");
    if (!$videoPanel.length || !$iframe.length) {
      return;
    }
    $iframe.attr("src", "https://www.youtube.com/embed/" + GUIDE_VIDEO_ID + "?autoplay=1&rel=0");
    $videoPanel.addClass("playing");
  }

  function renderHistoryPanels() {
    var sessions = getSessions();
    var events = getEvents();
    $("#history-count").text(sessions.length + "건");

    if ($("#history-list").length) {
      if (!sessions.length) {
        $("#history-empty").show();
        $("#history-list").empty();
      } else {
        $("#history-empty").hide();
        $("#history-list").html(sessions.map(function (session) {
          var itemClass = "history-item " + (session.status ? statusClass(session.status) + "-item" : "");
          return [
            '<div class="' + itemClass + '">',
            '<div class="history-meta">',
            "<strong>" + localizedStatus(session.status) + " 상태</strong>",
            "<span>" + formatTime(session.timestamp) + " · 목 " + session.neck_angle + "° · 어깨 " + formatNumber(session.shoulder_tilt) + "°</span>",
            "</div>",
            '<div class="history-score">' + session.total_score + "</div>",
            "</div>"
          ].join("");
        }).join(""));
      }
    }

    if ($("#event-log").length) {
      if (!events.length) {
        $("#event-log").html([
          '<div class="empty-state">',
          "<strong>아직 기록된 이벤트가 없습니다</strong>",
          "<span>분석, 시뮬레이션, 카메라 상태 변화가 이곳에 누적됩니다.</span>",
          "</div>"
        ].join(""));
      } else {
        $("#event-log").html(events.map(function (event) {
          var eventClass = event.status ? statusClass(event.status) + "-event" : "";
          return [
            '<div class="event-item ' + eventClass + '">',
            "<strong>" + event.title + "</strong>",
            "<span>" + formatTime(event.timestamp) + " · " + event.description + "</span>",
            "</div>"
          ].join("");
        }).join(""));
      }
    }
  }

  function setBackendState(isReady) {
    backendReady = isReady;
  }

  function showConnectionBanner(type, message) {
    var $banner = $("#connection-banner");
    if (!$banner.length) {
      return;
    }
    $banner.removeClass("banner-error banner-warning banner-good");
    $banner.addClass("banner-" + type);
    $("#connection-banner-text").text(message);
    $banner.show();
  }

  function hideConnectionBanner() {
    var $banner = $("#connection-banner");
    if ($banner.length) {
      $banner.hide();
    }
  }

  function closeAnalysisSocket() {
    socketReady = false;
    analysisInFlight = false;
    if (analysisSocket) {
      try {
        analysisSocket.close();
      } catch (error) {
        return;
      } finally {
        analysisSocket = null;
      }
    }
  }

  function stopWebcamSession() {
    console.log("[Session] 자세 교정 세션 종료");
    clearSkeleton();
    stopLiveSimulation();
    closeAnalysisSocket();
    if (webcamStream && typeof webcamStream.getTracks === "function") {
      webcamStream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
    webcamStream = null;
    webcamEnabled = false;
    lastAlertAt = 0;
    var video = document.getElementById("webcam-preview");
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    renderDashboard(fetchPostureData());
    $("#overlay-caption").text("실시간 자세 교정이 종료되었습니다. 다시 시작하려면 자세 교정 시작 버튼을 눌러주세요");
    $("#tracking-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("분석 종료");
    $(".camera-chip").text("웹캠 연결 종료");
    $("#capture-time").text("--:--:--");
    $("#score-caption").text("실시간 분석이 종료되었습니다. 다시 시작하면 자세 점수와 교정 피드백이 갱신됩니다.").css("color", "#ffffff");
    $("#feedback-title").removeClass("good-text critical-text").addClass("warning-text").text("실시간 분석이 중지되었습니다");
    $("#feedback-copy").text("자세 교정 시작 버튼을 누르면 웹캠과 스트리밍 분석이 다시 활성화됩니다.");
    $("#feedback-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("분석 대기");
    saveEvent({
      title: "실시간 분석 종료",
      description: "웹캠 스트리밍과 자세 분석 세션을 종료했습니다",
      status: "Warning",
      timestamp: Date.now()
    });
    renderHistoryPanels();
  }

  function shouldPersistSession(data, sourceLabel) {
    return Boolean(data && data.has_pose !== false && Number(data.total_score || 0) > 0);
  }

  function shouldThrottleSessionPersist(sourceLabel) {
    return sourceLabel === "실시간 스트리밍 분석";
  }

  function canPersistSessionAt(timestamp, sourceLabel) {
    if (!shouldThrottleSessionPersist(sourceLabel)) {
      return true;
    }

    var sessions = getSessions();
    var latestSession = sessions[0];
    if (!latestSession || !latestSession.timestamp) {
      return true;
    }

    return (timestamp - Number(latestSession.timestamp)) >= SESSION_PERSIST_INTERVAL_MS;
  }

  function summarizeSessionIssue(session) {
    if (!session) {
      return "기록된 분석 이슈가 없습니다.";
    }

    var neck = Number(session.neck_angle || 0);
    var shoulder = Number(session.shoulder_tilt || 0);
    var body = Number(session.body_tilt || 0);

    if (neck >= 46 && shoulder <= 4 && body <= 5.5) {
      return "전반적인 자세 흐름은 안정적입니다.";
    }

    if (neck <= 36 && shoulder >= 6 && body >= 8) {
      return "거북목과 상체 붕괴가 함께 크게 나타났습니다.";
    }
    if (neck <= 36 && shoulder >= 6) {
      return "거북목과 어깨 비대칭이 함께 크게 감지되었습니다.";
    }
    if (neck <= 36 && body >= 8) {
      return "거북목과 상체 전방 기울기가 함께 감지되었습니다.";
    }
    if (shoulder >= 7 && body >= 8) {
      return "어깨 비대칭과 상체 기울기가 함께 크게 나타났습니다.";
    }
    if (neck <= 36) {
      return "거북목 경향이 가장 두드러졌습니다.";
    }
    if (neck <= 41) {
      return "목 정렬 붕괴가 대표 이슈로 감지되었습니다.";
    }
    if (shoulder >= 7) {
      return "목 좌우 비대칭에 가까운 어깨 불균형이 크게 나타났습니다.";
    }
    if (shoulder >= 5) {
      return "어깨 좌우 비대칭이 대표 이슈로 감지되었습니다.";
    }
    if (body >= 9) {
      return "등과 상체가 앞으로 무너지는 패턴이 크게 감지되었습니다.";
    }
    if (body >= 6.5) {
      return "상체 중심 흔들림이 대표 이슈로 감지되었습니다.";
    }
    if (neck < 46) {
      return "목이 서서히 앞으로 빠지는 경향이 나타났습니다.";
    }
    return "가벼운 자세 편차가 감지되었습니다.";
  }

  function appendSessionArtifacts(data, sourceLabel) {
    var timestamp = Date.now();
    if (!shouldPersistSession(data, sourceLabel)) {
      return;
    }
    if (!canPersistSessionAt(timestamp, sourceLabel)) {
      return;
    }
    var session = buildSessionEntry(data, timestamp, sourceLabel);
    saveSession(session);
    saveEvent({
      title: sourceLabel,
      description: "점수 " + data.total_score + "점, 상태 " + localizedStatus(data.status),
      status: data.status,
      timestamp: session.timestamp
    });
    initSidebarSummary();
    renderHistoryPanels();
  }

  function renderDashboard(data) {
    var currentStatus = data.status || deriveStatus(data.total_score);
    var currentStatusClass = statusClass(currentStatus);
    var localized = localizedStatus(currentStatus);
    var detailedFeedback = buildDetailedFeedback(data, currentStatus);
    var summaryFeedback = buildSummaryFeedback(data, currentStatus, detailedFeedback);

    $("#system-status-text").text(localized);
    $("#system-status-dot").removeClass("warning critical").addClass(currentStatusClass === "good" ? "" : currentStatusClass);
    $("#stage-status").text(localized);
    $("#overlay-caption").text(
      data.has_pose === false
        ? "상체가 카메라 화면에 충분히 들어오도록 위치를 조정해주세요"
        : currentStatus === "Good"
          ? "상체 랜드마크 추적이 안정적으로 유지됩니다"
          : currentStatus === "Warning"
            ? "자세 편차가 감지되어 교정 안내를 강화합니다"
            : "위험 자세가 감지되어 즉시 교정을 권장합니다"
    );
    $("#score-panel").removeClass("status-good status-warning status-critical").addClass("status-" + currentStatusClass);
    $("#score-status-badge").removeClass("good-bg warning-bg critical-bg").addClass(badgeClass(currentStatus)).text(localized);
    $("#risk-status")
      .removeClass("good warning critical")
      .addClass(currentStatusClass)
      .find(".risk-state")
      .text(localized);
    $("#risk-status .risk-copy span").text(summaryFeedback);
    $("#risk-badge").removeClass("good-bg warning-bg critical-bg").addClass(badgeClass(currentStatus)).text(currentStatus === "Good" ? "위험도 낮음" : currentStatus === "Warning" ? "교정 필요" : "즉시 교정");
    $("#feedback-copy").text(detailedFeedback);
    $("#feedback-badge").removeClass("good-bg warning-bg critical-bg").addClass(badgeClass(currentStatus)).text(currentStatus === "Good" ? "안정적인 자세" : currentStatus === "Warning" ? "가벼운 교정 필요" : "즉시 교정 필요");
    $("#feedback-title").removeClass("good-text warning-text critical-text").addClass(textClass(currentStatus)).text(currentStatus === "Good" ? "현재 자세가 안정적입니다" : currentStatus === "Warning" ? "자세 편차가 감지되었습니다" : "위험 자세가 감지되었습니다");
    $("#tracking-badge")
      .removeClass("good-bg warning-bg critical-bg")
      .addClass(data.has_pose === false ? "warning-bg" : badgeClass(currentStatus))
      .text(data.has_pose === false ? "상체 위치 조정" : currentStatus === "Good" ? "추적 안정" : currentStatus === "Warning" ? "편차 감지" : "위험 감지");

    $("#stage-status").removeClass("good-text warning-text critical-text").addClass(textClass(currentStatus));
    $("#stage-score").removeClass("good-text warning-text critical-text").addClass(textClass(currentStatus));
    $("#score-value").removeClass("good-text warning-text critical-text").css("color", "");
    $("#score-caption").removeClass("good-text warning-text critical-text").css("color", "#ffffff");

    animateNumber("#stage-score", Number($("#stage-score").text()) || 0, data.total_score, "");
    animateNumber("#score-value", lastScore, data.total_score, "");
    lastScore = data.total_score;
    $("#score-caption").text(summaryFeedback);

    updateScoreRing(data.total_score);
    $("#metrics-grid").html(
      createMetricCard("목 정렬 각도", data.neck_angle, "°", data.has_pose === false ? "카메라 각도와 거리를 먼저 맞춰주세요" : getMetricHint("neck", data.neck_angle), data.has_pose === false ? "" : "neck") +
      createMetricCard("어깨 불균형", formatNumber(data.shoulder_tilt), "°", data.has_pose === false ? "상체가 프레임 안에 들어오면 측정을 시작합니다" : getMetricHint("shoulder", data.shoulder_tilt), data.has_pose === false ? "" : "shoulder") +
      createMetricCard("상체 기울기", formatNumber(data.body_tilt), "°", data.has_pose === false ? "어깨와 상체가 모두 보이도록 조정해주세요" : getMetricHint("body", data.body_tilt), data.has_pose === false ? "" : "body") +
      createMetricCard("추적 상태", data.has_pose === false ? "조정 필요" : localized, "", data.has_pose === false ? "좌표 추출 전 단계입니다. 상체 위치를 먼저 맞춰주세요" : currentStatus === "Good" ? "안정적인 자세 흐름이 유지됩니다" : currentStatus === "Warning" ? "가벼운 자세 흔들림이 감지됩니다" : "지속 시 부담이 커질 수 있습니다", "")
    );
    $("#coach-list").html(buildCoachItems(data, currentStatus));
    $("#capture-time").text(new Date().toLocaleTimeString("ko-KR"));
    maybePlayAlert(data.total_score, data.has_pose);
  }

  function randomizeData(seed) {
    var baseline = seed || fetchPostureData();
    var score = Math.max(48, Math.min(97, Number(baseline.total_score) + Math.round((Math.random() - 0.5) * 12)));
    var neck = Math.max(28, Math.min(60, Number(baseline.neck_angle) + Math.round((Math.random() - 0.5) * 8)));
    var shoulder = Math.max(1, Math.min(11, Number((Number(baseline.shoulder_tilt) + (Math.random() - 0.5) * 2.4).toFixed(1))));
    var body = Math.max(2, Math.min(16, Number((Number(baseline.body_tilt) + (Math.random() - 0.5) * 3.2).toFixed(1))));
    var state = deriveStatus(score);
    return {
      status: state,
      total_score: score,
      neck_angle: neck,
      shoulder_tilt: shoulder,
      body_tilt: body,
      feedback: buildDetailedFeedback({ neck_angle: neck, shoulder_tilt: shoulder, body_tilt: body, has_pose: true }, state)
    };
  }

  function runDashboardAction(options) {
    var $button = options.button;
    setButtonLoading($button, true, options.loadingText, options.defaultText);
    $("#overlay-caption").text(options.pendingCaption);
    window.setTimeout(function () {
      var payload = options.payload();
      renderDashboard(payload);
      appendSessionArtifacts(payload, options.eventTitle);
      showToast(options.toast);
      setButtonLoading($button, false, options.loadingText, options.defaultText);
    }, options.delay || 600);
  }

  function runLiveSimulationTick() {
    var video = document.getElementById("webcam-preview");
    if (!backendReady || !webcamEnabled || !video || analysisInFlight || !socketReady || !analysisSocket || analysisSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    analysisInFlight = true;
    var fw = video.videoWidth > 640 ? 640 : (video.videoWidth || 640);
    var fh = video.videoWidth > 0 ? Math.round(video.videoHeight * (fw / video.videoWidth)) : 480;
    lastFrameDims = { w: fw, h: fh };
    captureVideoFrameDataUrl(video, 640).then(function (image) {
      analysisSocket.send(JSON.stringify({ image: image }));
    }).catch(function () {
      analysisInFlight = false;
      $("#overlay-caption").text("웹캠 프레임 캡처에 실패했습니다");
    });
  }

  function waitForVideoReady(video) {
    return new Promise(function (resolve, reject) {
      if (!video) {
        reject(new Error("camera_video_element_missing"));
        return;
      }

      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
        return;
      }

      var resolved = false;
      var timeoutId;

      function cleanup() {
        video.removeEventListener("loadedmetadata", handleReady);
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("playing", handleReady);
        window.clearTimeout(timeoutId);
      }

      function handleReady() {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          return;
        }
        if (resolved) {
          return;
        }
        resolved = true;
        cleanup();
        resolve();
      }

      timeoutId = window.setTimeout(function () {
        if (resolved) {
          return;
        }
        cleanup();
        reject(new Error("camera_video_timeout"));
      }, 4000);

      video.addEventListener("loadedmetadata", handleReady, { once: true });
      video.addEventListener("loadeddata", handleReady, { once: true });
      video.addEventListener("canplay", handleReady, { once: true });
      video.addEventListener("playing", handleReady, { once: true });
    });
  }

  function startLiveSimulation() {
    if (!$("#score-value").length) {
      return;
    }
    window.clearInterval(liveSimulationTimer);
    liveSimulationTimer = window.setInterval(function () {
      runLiveSimulationTick();
    }, LIVE_INTERVAL_MS);
  }

  function stopLiveSimulation() {
    window.clearInterval(liveSimulationTimer);
  }

  function connectAnalysisSocket() {
    if (analysisSocket && (analysisSocket.readyState === WebSocket.OPEN || analysisSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log("[WS] 분석 소켓 연결 시도 중...");
    try {
      analysisSocket = createAnalysisWebSocket({
        onOpen: function () {
          socketReady = true;
          setBackendState(true);
          hideConnectionBanner();
          console.log("[WS] 실시간 분석 스트리밍 연결 성공");
          $("#overlay-caption").text("실시간 분석 스트리밍이 연결되었습니다");
        },
        onMessage: function (payload) {
          analysisInFlight = false;
          renderDashboard(payload);
          if (payload.has_pose && payload.coordinates && Object.keys(payload.coordinates).length > 0) {
            drawSkeleton(payload.coordinates, payload.status, lastFrameDims.w, lastFrameDims.h);
          } else {
            clearSkeleton();
          }
          appendSessionArtifacts(payload, "실시간 스트리밍 분석");
          $("#overlay-caption").text(payload.has_pose === false ? "상체 위치를 조정하면 좌표 추출과 점수 계산이 시작됩니다" : "백엔드 자세 분석 결과가 실시간으로 갱신되고 있습니다");
        },
        onError: function () {
          console.warn("[WS] 스트리밍 연결 에러");
          analysisInFlight = false;
          socketReady = false;
          showConnectionBanner("warning", "⚠ 백엔드 서버와의 스트리밍 연결이 불안정합니다. 서버가 실행 중인지 확인하세요.");
          $("#overlay-caption").text("웹캠은 연결되었지만 실시간 분석 스트리밍 연결이 불안정합니다");
          $("#tracking-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("스트리밍 재연결 중");
        },
        onClose: function () {
          console.log("[WS] 소켓 연결 종료");
          analysisInFlight = false;
          socketReady = false;
          if (webcamEnabled) {
            window.setTimeout(function () {
              connectAnalysisSocket();
            }, 600);
          }
        }
      });
    } catch (error) {
      console.error("[WS] 소켓 생성 실패:", error);
      socketReady = false;
      analysisSocket = null;
      showConnectionBanner("warning", "⚠ 백엔드 서버에 연결할 수 없습니다. 터미널에서 cd backend 후 ../.venv/bin/python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000 을 실행하세요.");
      $("#overlay-caption").text("웹캠은 연결되었지만 실시간 분석 소켓 연결에 실패했습니다");
      $("#tracking-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("소켓 연결 실패");
    }
  }

  function getUserMediaCompat(constraints) {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    var legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (typeof legacyGetUserMedia === "function") {
      return new Promise(function (resolve, reject) {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
      });
    }

    return Promise.reject(new Error("camera_api_unavailable"));
  }

  function initWebcam() {
    var video = document.getElementById("webcam-preview");
    var acquiredStream = null;
    if (webcamEnabled && webcamStream) {
      return Promise.resolve(webcamStream);
    }

    // file:// 프로토콜 감지 — Chrome은 파일 직접 열기에서 getUserMedia를 차단함
    if (window.location.protocol === "file:") {
      var fileMsg = "웹캠은 HTTP 서버를 통해 실행해야 합니다. 터미널에서 frontend/ 폴더를 'python3 -m http.server 5500' 으로 실행한 뒤 http://127.0.0.1:5500/pages/dashboard.html 로 접속하세요.";
      console.error("[Camera] file:// 프로토콜 감지됨 — 브라우저는 파일 직접 열기에서 카메라를 차단합니다. HTTP 서버로 실행하세요.");
      showConnectionBanner("error", "⚠ " + fileMsg);
      $(".camera-chip").text("HTTP 서버 실행 필요");
      $("#overlay-caption").text("웹캠을 사용하려면 HTTP 서버를 통해 실행해야 합니다. README를 확인해주세요.");
      saveEvent({
        title: "파일 직접 열기 감지",
        description: "file:// 프로토콜에서는 웹캠이 작동하지 않습니다. HTTP 서버로 실행하세요.",
        status: "Warning",
        timestamp: Date.now()
      });
      renderHistoryPanels();
      return Promise.reject(new Error("camera_file_protocol"));
    }

    if (!video) {
      $(".camera-chip").text("웹캠 화면 요소 없음");
      return Promise.reject(new Error("camera_video_element_missing"));
    }

    if (!window.isSecureContext && window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") {
      $(".camera-chip").text("보안 컨텍스트 필요");
      saveEvent({
        title: "카메라 보안 컨텍스트 필요",
        description: "카메라는 https 또는 localhost 환경에서만 접근할 수 있습니다",
        status: "Warning",
        timestamp: Date.now()
      });
      renderHistoryPanels();
      return Promise.reject(new Error("camera_insecure_context"));
    }

    console.log("[Camera] getUserMedia 요청 중... (hostname:", window.location.hostname, ")");
    return getUserMediaCompat({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    }).then(function (stream) {
      acquiredStream = stream;
      var track = stream.getVideoTracks()[0];
      console.log("[Camera] 스트림 획득 성공:", track ? track.label : "알 수 없음");
      if (webcamStream && webcamStream !== stream && typeof webcamStream.getTracks === "function") {
        webcamStream.getTracks().forEach(function (existingTrack) {
          existingTrack.stop();
        });
      }
      webcamStream = stream;
      webcamEnabled = true;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("autoplay", "autoplay");
      video.setAttribute("muted", "muted");
      video.setAttribute("playsinline", "playsinline");
      video.srcObject = stream;
      return Promise.resolve(video.play()).catch(function (playError) {
        if (playError && playError.name === "AbortError") {
          return;
        }
        throw playError;
      }).then(function () {
        return waitForVideoReady(video);
      }).then(function () {
        console.log("[Camera] 웹캠 스트리밍 시작 완료");
        $(".camera-chip").text("웹캠 입력 연결됨");
        $("#overlay-caption").text("실시간 웹캠 모니터링이 시작되었습니다");
        $("#tracking-badge").removeClass("warning-bg critical-bg").addClass("good-bg").text("추적 안정");
        saveEvent({
          title: "카메라 연결 성공",
          description: "실시간 모니터링 입력이 활성화되었습니다",
          status: "Good",
          timestamp: Date.now()
        });
        renderHistoryPanels();
        return stream;
      });
    }).catch(function (error) {
      console.error("[Camera] 에러:", error && error.name, "/", error && error.message);
      if (acquiredStream && typeof acquiredStream.getTracks === "function") {
        acquiredStream.getTracks().forEach(function (trackToStop) {
          trackToStop.stop();
        });
      }
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      webcamEnabled = false;
      webcamStream = null;
      var cameraMessage = "카메라 접근 권한이 없어 안내 화면으로 대체되었습니다";
      var cameraChipText = "카메라 권한 필요";
      var eventTitle = "카메라 권한 필요";
      var eventDescription = "웹캠 접근이 차단되어 포스터 화면으로 대체했습니다";

      if (error && (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")) {
        cameraMessage = "연결된 카메라 장치를 찾지 못했습니다";
        cameraChipText = "카메라 장치 없음";
        eventTitle = "카메라 장치 없음";
        eventDescription = "브라우저에서 사용할 수 있는 웹캠 장치를 찾지 못했습니다";
      } else if (error && (error.name === "NotReadableError" || error.name === "TrackStartError")) {
        cameraMessage = "다른 앱이 이미 카메라를 사용 중입니다. Zoom·Teams 등을 종료하고 다시 시도하세요.";
        cameraChipText = "카메라 사용 중";
        eventTitle = "카메라 점유 중";
        eventDescription = "다른 앱이 카메라를 사용 중이라 웹캠을 열지 못했습니다";
      } else if (error && error.message === "camera_api_unavailable") {
        cameraMessage = "이 브라우저의 카메라 API를 사용할 수 없습니다";
        cameraChipText = "브라우저 카메라 미지원";
        eventTitle = "카메라 API 미지원";
        eventDescription = "현재 브라우저에서 카메라 API를 사용할 수 없습니다";
      } else if (error && error.message === "camera_insecure_context") {
        cameraMessage = "카메라는 localhost 또는 https 환경에서만 동작합니다";
        cameraChipText = "보안 컨텍스트 필요";
        eventTitle = "카메라 보안 컨텍스트 필요";
        eventDescription = "카메라 접근에는 localhost 또는 https 환경이 필요합니다";
      } else if (error && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
        cameraMessage = "카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘을 눌러 권한을 허용하거나, macOS 시스템 설정 > 개인정보 보호 > 카메라에서 브라우저 권한을 확인하세요.";
        cameraChipText = "카메라 권한 거부됨";
        eventTitle = "카메라 권한 거부";
        eventDescription = "브라우저 또는 macOS 시스템에서 카메라 권한이 거부되었습니다";
      } else if (error && error.message === "camera_video_timeout") {
        cameraMessage = "카메라 권한은 허용되었지만 브라우저가 영상 스트림을 시작하지 못했습니다. 다른 탭이나 앱에서 카메라를 점유 중인지 확인한 뒤 다시 시도하세요.";
        cameraChipText = "카메라 시작 실패";
        eventTitle = "카메라 스트림 시작 실패";
        eventDescription = "권한 승인 후에도 비디오 프레임이 열리지 않았습니다";
      }

      showConnectionBanner("error", "⚠ " + cameraMessage);
      $("#overlay-caption").text(cameraMessage);
      $("#tracking-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("카메라 대기");
      $(".camera-chip").text(cameraChipText);
      saveEvent({
        title: eventTitle,
        description: eventDescription,
        status: "Warning",
        timestamp: Date.now()
      });
      renderHistoryPanels();
      showToast(cameraMessage);
      throw error;
    });
  }

  function requestWebcamAndAnalyze($button) {
    setButtonLoading($button, true, "웹캠 준비 중...", "자세 교정 시작");
    $("#overlay-caption").text("웹캠 권한 승인을 기다리고 있습니다");
    initWebcam().then(function () {
      connectAnalysisSocket();
      startLiveSimulation();
      setButtonLoading($button, false, "웹캠 준비 중...", "자세 교정 시작");
      $("#overlay-caption").text(socketReady ? "웹캠 프레임을 실시간 스트리밍으로 분석하고 있습니다" : "웹캠은 연결되었습니다. 분석 스트리밍 연결을 시도하고 있습니다");
      showToast("웹캠 연결을 시작했습니다.");
    }).catch(function () {
      setButtonLoading($button, false, "웹캠 준비 중...", "자세 교정 시작");
    });
  }

  function bindWebcamConsentFlow() {
    if (!$("#webcam-consent-modal").length) {
      return;
    }

    $("#analyze-btn").off("click").on("click", function () {
      setWebcamConsentModal(true);
    });

    $("#webcam-cancel-btn").off("click").on("click", function () {
      setWebcamConsentModal(false);
      showToast("웹캠 활성화를 취소했습니다.");
    });

    $("#webcam-allow-btn").off("click").on("click", function () {
      setWebcamConsentModal(false);
      requestWebcamAndAnalyze($("#analyze-btn"));
    });

    $("#webcam-consent-modal").off("click").on("click", function (event) {
      if (event.target === this) {
        setWebcamConsentModal(false);
      }
    });
  }

  function bindStopAnalysisFlow() {
    if (!$("#stop-analysis-modal").length) {
      return;
    }

    $("#stop-analysis-btn").off("click").on("click", function () {
      setStopAnalysisModal(true);
    });

    $("#stop-analysis-cancel-btn").off("click").on("click", function () {
      setStopAnalysisModal(false);
    });

    $("#stop-analysis-confirm-btn").off("click").on("click", function () {
      setStopAnalysisModal(false);
      stopWebcamSession();
      showToast("실시간 자세 교정을 종료했습니다.");
    });

    $("#stop-analysis-modal").off("click").on("click", function (event) {
      if (event.target === this) {
        setStopAnalysisModal(false);
      }
    });
  }

  function shouldAutoOpenWebcamModal() {
    try {
      return new URLSearchParams(window.location.search).get("autostart") === "1";
    } catch (error) {
      return false;
    }
  }

  function initDashboard() {
    if (!$("#score-value").length) {
      return;
    }

    var baseline = getLatestSessionOrBase();
    lastAlertAt = 0;
    renderDashboard(baseline);
    renderHistoryPanels();
    $("#overlay-caption").text("자세 교정 시작 버튼을 누르면 웹캠 허용 안내가 표시됩니다");
    $("#tracking-badge").removeClass("good-bg critical-bg").addClass("warning-bg").text("카메라 대기");
    $(".camera-chip").text("웹캠 연결 대기 중");
    healthcheckBackend().then(function () {
      console.log("[Backend] 서버 연결 성공 (" + (window.API_BASE_URL || "http://127.0.0.1:8000") + ")");
      setBackendState(true);
      hideConnectionBanner();
      saveEvent({
        title: "백엔드 서버 연결 성공",
        description: "FastAPI 자세 분석 서버와 연결되었습니다",
        status: "Good",
        timestamp: Date.now()
      });
      renderHistoryPanels();
    }).catch(function () {
      console.warn("[Backend] 서버 연결 실패 — 백엔드 서버를 먼저 실행하세요 (포트 8000)");
      setBackendState(false);
      showConnectionBanner("warning", "⚠ 백엔드 서버에 연결할 수 없습니다. 터미널에서 cd backend 후 ../.venv/bin/python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000 을 실행하세요.");
      saveEvent({
        title: "백엔드 서버 연결 실패",
        description: "FastAPI 서버가 실행 중인지 확인이 필요합니다",
        status: "Warning",
        timestamp: Date.now()
      });
      renderHistoryPanels();
    });
    bindWebcamConsentFlow();
    bindStopAnalysisFlow();
    if (shouldAutoOpenWebcamModal()) {
      window.setTimeout(function () {
        setWebcamConsentModal(true);
      }, 180);
    }

    $("#refresh-btn").click(function () {
      var video = document.getElementById("webcam-preview");
      if (backendReady && webcamEnabled && video) {
        requestWebcamAndAnalyze($("#analyze-btn"));
        return;
      }
      renderDashboard(fetchPostureData());
      $("#overlay-caption").text("자세 교정 시작 버튼을 누르면 웹캠 허용 안내가 표시됩니다");
      showToast("대기 상태로 초기화했습니다.");
    });

    $("#clear-history-btn").click(function () {
      clearSessions();
      writeStorage(STORAGE_KEYS.events, []);
      renderHistoryPanels();
      renderDashboard(fetchPostureData());
      showToast("세션 히스토리를 초기화했습니다.");
    });
  }

  function buildSeriesFromSessions(sessions) {
    if (!sessions.length) {
      return fetchReportSeries();
    }

    var ordered = sessions.slice().reverse();
    return {
      labels: ordered.map(function (session) {
        return new Date(session.timestamp).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit"
        });
      }),
      score: ordered.map(function (session) { return session.total_score; }),
      neck: ordered.map(function (session) { return session.neck_angle; }),
      shoulder: ordered.map(function (session) { return Number(session.shoulder_tilt); }),
      tilt: ordered.map(function (session) { return Number(session.body_tilt); }),
      notes: ordered.map(function (session) { return summarizeSessionIssue(session); })
    };
  }

  function datasetConfig(series) {
    return [
      {
        key: "score",
        label: "종합 자세 점수",
        data: series.score,
        borderColor: "#0e7c66",
        backgroundColor: "rgba(14, 124, 102, 0.12)",
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 18,
        pointBackgroundColor: "#0e7c66",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2
      },
      {
        key: "neck",
        label: "목 정렬 각도",
        data: series.neck,
        borderColor: "#123a52",
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 18,
        pointBackgroundColor: "#123a52",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2
      },
      {
        key: "shoulder",
        label: "어깨 불균형",
        data: series.shoulder,
        borderColor: "#d7a000",
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 18,
        pointBackgroundColor: "#d7a000",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2
      },
      {
        key: "tilt",
        label: "상체 기울기",
        data: series.tilt,
        borderColor: "#d94343",
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 18,
        pointBackgroundColor: "#d94343",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2
      }
    ];
  }

  function updateReportSummary(series) {
    var scores = series.score;
    var avg = scores.reduce(function (sum, value) { return sum + value; }, 0) / scores.length;
    var sessions = getSessions();
    var latestSession = sessions[0];
    $("#recent-score").text(latestSession ? latestSession.total_score + "점" : scores[scores.length - 1] + "점");
    $("#avg-score").text(Math.round(avg) + "점");
    $("#low-score").text(Math.min.apply(null, scores) + "점");
    $("#high-score").text(Math.max.apply(null, scores) + "점");
  }

  function renderReportHistory(sessions) {
    if (!$("#report-history-list").length) {
      return;
    }
    if (!sessions.length) {
      $("#report-history-empty").show();
      $("#report-history-list").empty();
      return;
    }
    $("#report-history-empty").hide();
    $("#report-history-list").html(sessions.map(function (session) {
      return [
        '<div class="report-history-card">',
        "<strong>" + formatTime(session.timestamp) + " · " + localizedStatus(session.status) + "</strong>",
        '<div class="history-stat-row"><span>종합 점수</span><span>' + session.total_score + "점</span></div>",
        '<div class="history-stat-row"><span>목 정렬</span><span>' + session.neck_angle + "°</span></div>",
        '<div class="history-stat-row"><span>어깨 불균형</span><span>' + formatNumber(session.shoulder_tilt) + "°</span></div>",
        "</div>"
      ].join("");
    }).join(""));
  }

  function getActiveReportSessions() {
    var sessions = getSessions();
    if (!sessions.length) {
      return [];
    }
    if (reportState.range === "today") {
      var todayStr = new Date().toDateString();
      var todaySessions = sessions.filter(function (s) {
        return new Date(s.timestamp).toDateString() === todayStr;
      });
      return todaySessions.length ? todaySessions : sessions.slice(0, 5);
    }
    if (reportState.range === "recent") {
      return sessions.slice(0, 5);
    }
    return sessions;
  }

  function refreshReport() {
    if (!$("#postureChart").length || typeof Chart === "undefined") {
      return;
    }

    var activeSessions = getActiveReportSessions();
    var usingSessions = activeSessions.length >= 2;
    var series = usingSessions ? buildSeriesFromSessions(activeSessions) : fetchReportSeries();
    $("#report-source-badge")
      .removeClass("good-bg warning-bg")
      .addClass(usingSessions ? "good-bg" : "warning-bg")
      .text(usingSessions ? "저장 세션 기반" : "기본 데이터");

    updateReportSummary(series);
    renderReportHistory(getSessions());

    if (!reportChart) {
      reportChart = new Chart(document.getElementById("postureChart"), {
        type: "line",
        data: {
          labels: series.labels,
          datasets: datasetConfig(series)
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false,
            axis: "x"
          },
          hover: {
            mode: "index",
            intersect: false
          },
          plugins: {
            legend: {
              position: "bottom"
            },
            tooltip: {
              enabled: true,
              backgroundColor: "rgba(11, 34, 48, 0.94)",
              titleColor: "#ffffff",
              bodyColor: "rgba(255, 255, 255, 0.92)",
              footerColor: "rgba(213, 228, 227, 0.92)",
              displayColors: true,
              padding: 14,
              cornerRadius: 14,
              caretPadding: 10,
              titleFont: {
                family: "Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif",
                size: 13,
                weight: "700",
                lineHeight: 1.35
              },
              bodyFont: {
                family: "Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif",
                size: 13,
                weight: "600",
                lineHeight: 1.45
              },
              footerFont: {
                family: "Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif",
                size: 12,
                weight: "500",
                lineHeight: 1.4
              },
              bodySpacing: 6,
              footerSpacing: 8,
              boxPadding: 6,
              callbacks: {
                title: function (items) {
                  var item = items[0];
                  return "분석 시각 " + item.label;
                },
                label: function (context) {
                  var rawValue = Number(context.raw);
                  var suffix = context.dataset.key === "score" ? "점" : "°";
                  var formatted = context.dataset.key === "score" ? String(Math.round(rawValue)) : formatNumber(rawValue);
                  return context.dataset.label + ": " + formatted + suffix;
                },
                footer: function (items) {
                  var index = items[0].dataIndex;
                  return "주의 내용: " + (series.notes && series.notes[index] ? series.notes[index] : "기록된 특이사항이 없습니다.");
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: "rgba(21, 35, 45, 0.08)"
              }
            },
            x: {
              grid: {
                display: false
              }
            }
          }
        }
      });
    } else {
      reportChart.data.labels = series.labels;
      reportChart.data.datasets = datasetConfig(series);
      reportChart.options.plugins.tooltip.callbacks.footer = function (items) {
        var index = items[0].dataIndex;
        return "주의 내용: " + (series.notes && series.notes[index] ? series.notes[index] : "기록된 특이사항이 없습니다.");
      };
    }

    reportChart.data.datasets.forEach(function (dataset) {
      dataset.hidden = !reportState.visible[dataset.key];
    });
    reportChart.update();
  }

  function initReport() {
    if (!$("#postureChart").length || typeof Chart === "undefined") {
      return;
    }

    refreshReport();

    $(".report-range").click(function () {
      $(".report-range").removeClass("active");
      $(this).addClass("active");
      reportState.range = $(this).data("range");
      refreshReport();
    });

    $(".metric-toggle").click(function () {
      var key = $(this).data("dataset");
      reportState.visible[key] = !reportState.visible[key];
      $(this).toggleClass("active", reportState.visible[key]);
      refreshReport();
    });
  }

  function updateGuideProgress() {
    var count = $(".guide-check:checked").length;
    var score = Math.round((count / Math.max($(".guide-check").length, 1)) * 100);
    var badgeClass = score >= 75 ? "good-bg" : score >= 40 ? "warning-bg" : "critical-bg";
    $("#guide-progress-badge").removeClass("good-bg warning-bg critical-bg").addClass(badgeClass).text("준비도 " + score + "점");
    $("#guide-progress-fill").css("width", score + "%");
    $(".guide-check").each(function () {
      $(this).closest(".check-item").toggleClass("done", $(this).is(":checked"));
    });
    writeStorage(STORAGE_KEYS.guide, $(".guide-check").map(function () {
      return $(this).is(":checked");
    }).get());
    initSidebarSummary();
  }

  function setGuideInsight(index) {
    var hint = GUIDE_CHECK_HINTS[index] || {
      title: "학습 준비도 안내",
      copy: "체크한 항목 수에 따라 현재 자세 준비도를 바로 확인할 수 있습니다."
    };
    $("#guide-insight-title").text(hint.title);
    $("#guide-insight-copy").text(hint.copy);
  }

  function clearGuideReminderTimer() {
    if (guideReminderTimer) {
      window.clearTimeout(guideReminderTimer);
      guideReminderTimer = null;
    }
  }

  function updateGuideReminderStatus(timestamp) {
    if (!$("#guide-reminder-status").length) {
      return;
    }
    if (!timestamp || timestamp <= Date.now()) {
      $("#guide-reminder-status").text("아직 설정된 리마인더가 없습니다.");
      return;
    }
    $("#guide-reminder-status").text("다음 재점검: " + formatTime(timestamp));
  }

  function showReminderPopup() {
    var $popup = $("#reminder-popup");
    if (!$popup.length) {
      return;
    }
    $popup.addClass("show").attr("aria-hidden", "false");
    $("body").css("overflow", "hidden");
    trapFocus(document.querySelector("#reminder-popup .reminder-popup-card"));
  }

  function hideReminderPopup() {
    var $popup = $("#reminder-popup");
    if (!$popup.length) {
      return;
    }
    $popup.removeClass("show").attr("aria-hidden", "true");
    $("body").css("overflow", "");
    releaseFocusTrap(document.querySelector("#reminder-popup .reminder-popup-card"));
  }

  function requestNotificationPermission() {
    if (!("Notification" in window) || Notification.permission !== "default") {
      return;
    }
    Notification.requestPermission();
  }

  function fireNativeNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    try {
      new Notification("Upright AI — 자세 점검 시간", {
        body: "30분이 지났습니다. 지금 자세를 다시 점검해보세요."
      });
    } catch (error) {
      return;
    }
  }

  function scheduleGuideReminder(timestamp) {
    clearGuideReminderTimer();
    updateGuideReminderStatus(timestamp);
    if (!timestamp || timestamp <= Date.now()) {
      writeStorage(STORAGE_KEYS.guideReminder, null);
      return;
    }

    guideReminderTimer = window.setTimeout(function () {
      writeStorage(STORAGE_KEYS.guideReminder, null);
      updateGuideReminderStatus(null);
      showReminderPopup();
      fireNativeNotification();
      saveEvent({
        title: "가이드 재점검 알림",
        description: "30분 주기 자세 재점검 시간이 도래했습니다",
        status: "Warning",
        timestamp: Date.now()
      });
      renderHistoryPanels();
    }, Math.max(0, timestamp - Date.now()));
  }

  function initGuide() {
    if (!$(".guide-check").length) {
      return;
    }

    if (typeof $.fn.tooltip === "function") {
      $(".guide-keyword-pill, .check-item").tooltip({
        position: { my: "center bottom-10", at: "center top" },
        tooltipClass: "upright-tooltip",
        show: { duration: 160 },
        hide: { duration: 100 }
      });
    }

    if ($("#guide-video-preview").length) {
      resetGuideVideoPreview();
      $("#guide-video-preview").off("click").on("click", function () {
        playGuideVideo();
      });
    }

    var savedChecklist = readStorage(STORAGE_KEYS.guide, []);
    $(".guide-check").each(function (index) {
      $(this).prop("checked", Boolean(savedChecklist[index]));
    });
    updateGuideProgress();
    setGuideInsight(0);

    $(".check-item").off("click").on("click", function () {
      var index = Number($(this).attr("data-guide-index"));
      setGuideInsight(index);
    });

    $(".guide-check").change(function () {
      var index = Number($(this).closest(".check-item").attr("data-guide-index"));
      setGuideInsight(index);
      updateGuideProgress();
    });

    $("#guide-reminder-btn").off("click").on("click", function () {
      requestNotificationPermission();
      var nextReminderAt = Date.now() + (30 * 60 * 1000);
      writeStorage(STORAGE_KEYS.guideReminder, nextReminderAt);
      scheduleGuideReminder(nextReminderAt);
      showToast("30분 후 자세 재점검 알림을 설정했습니다.");
    });

    $("#reminder-popup-close").off("click").on("click", function () {
      hideReminderPopup();
    });

    $("#reminder-popup").off("click").on("click", function (event) {
      if (event.target === this) {
        hideReminderPopup();
      }
    });

    scheduleGuideReminder(readStorage(STORAGE_KEYS.guideReminder, null));
  }

  $(function () {
    initSidebarSummary();
    initDashboard();
    initReport();
    initGuide();
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var wcModal = document.getElementById("webcam-consent-modal");
      var saModal = document.getElementById("stop-analysis-modal");
      var rpPopup = document.getElementById("reminder-popup");
      if (wcModal && wcModal.classList.contains("show")) setWebcamConsentModal(false);
      else if (saModal && saModal.classList.contains("show")) setStopAnalysisModal(false);
      else if (rpPopup && rpPopup.classList.contains("show")) hideReminderPopup();
    });
    window.addEventListener("beforeunload", function () {
      stopLiveSimulation();
      if (analysisSocket && analysisSocket.readyState === WebSocket.OPEN) {
        analysisSocket.close();
      }
    });
  });
})();
