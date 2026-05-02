var API_BASE_URL = (function () {
  var host = window.location.hostname || "127.0.0.1";
  var protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return protocol + "//" + host + ":8000";
})();

var WS_BASE_URL = (function () {
  var host = window.location.hostname || "127.0.0.1";
  var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return protocol + "//" + host + ":8000";
})();

function fetchPostureData() {
  return {
    status: "Warning",
    total_score: 0,
    neck_angle: 0,
    shoulder_tilt: 0,
    body_tilt: 0,
    feedback: "웹캠을 켜고 분석을 시작하면 실시간 자세 점수와 교정 피드백이 표시됩니다.",
    has_pose: false,
    visibility_ok: false,
    tracking_score: 0,
    view_mode: "unknown",
    coordinates: {}
  };
}

function fetchReportSeries() {
  return {
    labels: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"],
    score: [79, 83, 81, 88, 90, 92, 91],
    neck: [39, 42, 45, 48, 50, 52, 51],
    shoulder: [8.1, 6.7, 5.8, 4.8, 3.9, 2.5, 3.2],
    tilt: [11.5, 10.6, 9.8, 7.5, 6.8, 5.0, 5.6],
    notes: [
      "고개가 앞으로 나가며 상체가 함께 기울었습니다.",
      "어깨 높이 차이가 크고 목 정렬이 불안정합니다.",
      "상체 중심이 아직 흔들리지만 이전보다 완화되었습니다.",
      "상체 기울기가 개선되고 시선 높이가 안정되고 있습니다.",
      "전반적으로 안정적이지만 어깨 긴장은 계속 점검이 필요합니다.",
      "자세 흐름이 안정적입니다.",
      "양호한 자세가 유지되고 있습니다."
    ]
  };
}

function normalizeBackendStatus(status) {
  if (status === "Good" || status === "Warning" || status === "Critical") {
    return status;
  }
  return "Critical";
}

function mapBackendPayload(payload) {
  return {
    status: normalizeBackendStatus(payload.status),
    total_score: Number(payload.total_score || 0),
    neck_angle: Number(payload.neck_angle_deg || 0),
    shoulder_tilt: Number(payload.shoulder_tilt_deg || 0),
    body_tilt: Number(payload.upper_body_tilt_deg || 0),
    feedback: payload.feedback_message || "",
    has_pose: payload.has_pose !== false,
    visibility_ok: Boolean(payload.visibility_ok),
    tracking_score: Number(payload.tracking_score || 0),
    view_mode: payload.view_mode || "unknown",
    coordinates: payload.coordinates || {}
  };
}

function healthcheckBackend() {
  console.log("[Backend] 헬스체크 요청 →", API_BASE_URL + "/health");
  return fetch(API_BASE_URL + "/health", {
    method: "GET"
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("backend_health_failed");
    }
    return response.json();
  }).then(function (data) {
    console.log("[Backend] 헬스체크 성공:", data);
    return data;
  });
}

function captureVideoFrameBlob(video) {
  return new Promise(function (resolve, reject) {
    if (!video || !video.videoWidth || !video.videoHeight) {
      reject(new Error("video_not_ready"));
      return;
    }

    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    var context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("canvas_context_unavailable"));
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function (blob) {
      if (!blob) {
        reject(new Error("frame_capture_failed"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.92);
  });
}

function captureVideoFrameDataUrl(video, maxWidth) {
  return new Promise(function (resolve, reject) {
    if (!video || !video.videoWidth || !video.videoHeight) {
      reject(new Error("video_not_ready"));
      return;
    }

    var scale = 1;
    if (maxWidth && video.videoWidth > maxWidth) {
      scale = maxWidth / video.videoWidth;
    }

    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    var context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("canvas_context_unavailable"));
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL("image/jpeg", 0.68));
  });
}

function analyzeVideoFrame(video) {
  return captureVideoFrameBlob(video).then(function (blob) {
    var formData = new FormData();
    formData.append("file", blob, "webcam-frame.jpg");

    return fetch(API_BASE_URL + "/analyze", {
      method: "POST",
      body: formData
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (message) {
          throw new Error(message || "backend_analyze_failed");
        });
      }
      return response.json();
    }).then(function (payload) {
      return mapBackendPayload(payload);
    });
  });
}

function createAnalysisWebSocket(handlers) {
  var wsUrl = WS_BASE_URL + "/ws/analyze";
  console.log("[WS] 연결 시도 →", wsUrl);
  var socket = new WebSocket(wsUrl);

  socket.addEventListener("open", function () {
    console.log("[WS] 연결 성공");
    if (handlers && typeof handlers.onOpen === "function") {
      handlers.onOpen();
    }
  });

  socket.addEventListener("message", function (event) {
    if (!handlers || typeof handlers.onMessage !== "function") {
      return;
    }

    try {
      var payload = JSON.parse(event.data);
      if (payload && !payload.error) {
        handlers.onMessage(mapBackendPayload(payload), payload);
        return;
      }
      var errCode = payload && payload.error ? payload.error : "websocket_message_error";
      console.warn("[WS] 서버 에러 응답:", errCode);
      if (typeof handlers.onError === "function") {
        handlers.onError(errCode);
      }
    } catch (error) {
      console.error("[WS] 메시지 파싱 실패:", error);
      if (handlers && typeof handlers.onError === "function") {
        handlers.onError("websocket_parse_error");
      }
    }
  });

  socket.addEventListener("error", function (event) {
    console.error("[WS] 연결 에러. 백엔드 서버가 실행 중인지 확인하세요.", event);
    if (handlers && typeof handlers.onError === "function") {
      handlers.onError("websocket_connection_error");
    }
  });

  socket.addEventListener("close", function (event) {
    console.log("[WS] 연결 종료 (code=" + event.code + ", reason=" + (event.reason || "없음") + ")");
    if (handlers && typeof handlers.onClose === "function") {
      handlers.onClose();
    }
  });

  return socket;
}
