# Upright AI — 실시간 AI 자세 교정 플랫폼

> 웹캠 하나로 목·어깨·상체 정렬을 실시간 분석하고, 점수·피드백·리포트·가이드를 한 플랫폼에서 제공하는 SaaS형 자세 교정 웹 서비스

---

## 개요

Upright AI는 브라우저 웹캠 피드를 Python FastAPI 백엔드로 전달해 **MediaPipe Pose Landmarker** 기반의 상체 자세 분석을 수행합니다.  
분석된 목 정렬 각도, 어깨 불균형, 상체 기울기를 종합해 0–100점 척도의 자세 점수를 산출하고, 상태별 교정 피드백과 시계열 리포트, 단계별 가이드를 제공합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 실시간 자세 분석 | WebSocket 스트리밍으로 매 240ms 프레임을 백엔드에 전송해 즉시 점수 갱신 |
| 종합 점수 산출 | 목 정렬(neck angle), 어깨 불균형(shoulder tilt), 상체 기울기(body tilt) 3축 가중합 |
| 상태별 피드백 | 요약 멘트(점수 카드)와 상세 교정 가이드(피드백 패널) 분리 제공 |
| 자세 경보 알림 | 점수 구간별 Web Audio API 경보음 — 위험 자세 감지 시 즉시 알림 |
| 세션 히스토리 | 최근 12세션을 localStorage에 자동 저장, 이벤트 타임라인과 함께 표시 |
| 시계열 리포트 | Chart.js 인터랙티브 그래프 — 오늘·최근 5회·전체 구간 필터 지원 |
| 이미지·영상 가이드 | 블로그 원본 이미지 2장 비교 + 한국어 YouTube 교정 스트레칭 영상 |
| 체크리스트 & 준비도 | 4항목 자세 체크리스트 — jQuery UI 툴팁 안내 포함 |
| 30분 리마인더 | 설정 후 30분 경과 시 팝업 알림 + Web Notifications API 네이티브 알림 |
| 반응형 레이아웃 | 모바일·태블릿·데스크탑 3단계 반응형 대응 |

---

## 기술 스택

### Backend
| 기술 | 역할 |
|------|------|
| Python 3.13 | 런타임 |
| FastAPI + Uvicorn | REST API 및 WebSocket 서버 |
| MediaPipe Pose Landmarker | 상체 33개 랜드마크 추출 |
| OpenCV | 이미지 디코딩 및 전처리 |
| NumPy / Pillow | 수치 연산 및 이미지 처리 |

### Frontend
| 기술 | 역할 |
|------|------|
| HTML5 / CSS3 | 마크업 및 스타일링 |
| JavaScript (ES5+) | 비즈니스 로직, DOM 조작, WebSocket 클라이언트 |
| jQuery 3.7.1 | DOM 유틸리티, 이벤트 바인딩, AJAX |
| jQuery UI 1.13.3 | Tooltip 플러그인 |
| Chart.js | 자세 추이 시계열 차트 |
| Web Audio API | 자세 경보음 합성 (AudioContext oscillator) |
| Web Notifications API | 네이티브 리마인더 알림 |
| localStorage | 세션·이벤트·체크리스트 영속화 |

---

## 화면 구성

```
index.html              랜딩 페이지 — 서비스 소개 + 대시보드 실시간 미리보기
pages/dashboard.html    실시간 자세 교정 대시보드
pages/report.html       점수 추이 시계열 리포트
pages/guide.html        이미지·영상 가이드 + 체크리스트 + 리마인더
```

---

## 프로젝트 구조

```
upright/
├── backend/
│   ├── app.py              FastAPI 앱 — REST /analyze, WebSocket /ws/analyze, /health
│   ├── posture.py          자세 점수 산출 및 상태 판정 로직
│   ├── mediapipe_util.py   MediaPipe Pose Landmarker 초기화 및 추론
│   ├── angle.py            목·어깨·상체 각도 계산 함수
│   ├── main.py             OpenCV 단독 실행 진입점
│   ├── model_assets/
│   │   └── pose_landmarker_lite.task   백엔드가 직접 읽는 MediaPipe 모델 파일
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── pages/
│   │   ├── dashboard.html
│   │   ├── report.html
│   │   └── guide.html
│   ├── js/
│   │   ├── api.js          백엔드 통신, WebSocket, 프레임 캡처
│   │   ├── main.js         전체 UI 로직, jQuery 이벤트, 상태 관리
│   │   └── landing.js      랜딩 스크롤 애니메이션, 앵커 스크롤
│   ├── css/
│   │   ├── style.css       앱 공통 스타일 (대시보드·리포트·가이드)
│   │   └── landing.css     랜딩 페이지 전용 스타일
│   └── assets/
│       ├── audio/alert.mp3
│       └── video/posture_guide.mp4
├── model_assets/
│   └── pose_landmarker_lite.task   저장소 루트에 포함된 모델 원본 파일
└── .venv/
```

---

## 설치 및 실행

> **중요**
> 현재 백엔드 코드는 `backend/model_assets/pose_landmarker_lite.task` 경로의 모델 파일을 읽습니다.
> 팀원이 `pose_landmarker_lite.task` 누락 오류를 겪었다면, 실행 전에 아래 파일이 실제로 존재하는지 먼저 확인하세요.
>
> `backend/model_assets/pose_landmarker_lite.task`
>
> 저장소 루트의 `model_assets/pose_landmarker_lite.task`만 있고 `backend/model_assets/` 안이 비어 있으면, 루트 파일을 `backend/model_assets/`로 복사한 뒤 실행해야 합니다.

### Windows

#### 1. 사전 준비

1. [python.org](https://www.python.org)에서 Python 3.13 이상을 설치합니다.
2. 설치 중 반드시 `Add Python to PATH` 옵션을 체크합니다.
3. 저장소를 받은 뒤, 아래 파일이 있는지 먼저 확인합니다.

```text
backend/model_assets/pose_landmarker_lite.task
```

4. 위 파일이 없고 아래 파일만 있다면:

```text
model_assets/pose_landmarker_lite.task
```

루트의 모델 파일을 `backend/model_assets/` 폴더로 복사합니다.

#### 2. 가장 쉬운 실행 방법

프로젝트 루트에서 `run.bat`을 실행합니다.

방법 A. 파일 탐색기에서 `run.bat` 더블클릭  
방법 B. 명령 프롬프트에서 실행

```bat
cd C:\path\to\upright
run.bat
```

#### 3. 실행되면 일어나는 일

1. Python 설치 여부를 확인합니다.
2. `.venv` 가 없으면 자동으로 가상환경을 생성합니다.
3. `backend/requirements.txt` 기준으로 패키지를 설치합니다.
4. 백엔드 서버를 `127.0.0.1:8000` 에서 실행합니다.
5. 프론트엔드 서버를 `127.0.0.1:5500` 에서 실행합니다.

#### 4. 정상 실행 확인

`run.bat` 실행 후 두 개의 터미널 창이 열려야 합니다.

- `Upright - Backend`
- `Upright - Frontend`

브라우저에서 아래 주소로 접속합니다.

- 랜딩 페이지: `http://127.0.0.1:5500/`
- 대시보드: `http://127.0.0.1:5500/pages/dashboard.html`

백엔드 상태 확인:

```text
http://127.0.0.1:8000/health
```

브라우저에 `{"status":"ok"}` 가 보이면 정상입니다.

---

### macOS

#### 1. 사전 준비

1. 터미널을 엽니다.
2. 프로젝트 루트로 이동합니다.
3. 아래 모델 파일이 있는지 먼저 확인합니다.

```bash
cd /path/to/upright
ls backend/model_assets/pose_landmarker_lite.task
```

4. 위 파일이 없고 루트 파일만 있다면 아래처럼 복사합니다.

```bash
mkdir -p backend/model_assets
cp model_assets/pose_landmarker_lite.task backend/model_assets/pose_landmarker_lite.task
```

#### 2. 가상환경 생성 및 패키지 설치

프로젝트 루트에서 아래 순서대로 실행합니다.

```bash
cd /path/to/upright
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txtcd
```

#### 3. 백엔드 실행

터미널 1개를 열고 아래 명령을 실행합니다.

```bash
cd /path/to/upright/backend
../.venv/bin/python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

정상 확인:

```bash
curl http://127.0.0.1:8000/health
```

응답:

```bash
# {"status":"ok"}
```

#### 4. 프론트엔드 실행

터미널 2개째를 열고 아래 명령을 실행합니다.

```bash
cd /path/to/upright/frontend
../.venv/bin/python -m http.server 5500
```

#### 5. 브라우저 접속

아래 주소 중 하나로 접속합니다.

- 랜딩: `http://127.0.0.1:5500/`
- 대시보드: `http://127.0.0.1:5500/pages/dashboard.html`
- 리포트: `http://127.0.0.1:5500/pages/report.html`
- 가이드: `http://127.0.0.1:5500/pages/guide.html`

---

### 브라우저 접속 (공통)

| 페이지 | URL |
|--------|-----|
| 랜딩 | `http://127.0.0.1:5500/` |
| 대시보드 | `http://127.0.0.1:5500/pages/dashboard.html` |
| 리포트 | `http://127.0.0.1:5500/pages/report.html` |
| 가이드 | `http://127.0.0.1:5500/pages/guide.html` |

> **주의** `file://` 로 직접 열면 웹캠이 동작하지 않습니다. 반드시 `http://127.0.0.1:5500` 경로로 접속하세요.

---

## 사용 흐름

### 대시보드
1. **자세 교정 시작** 클릭 → 웹캠 동의 모달 확인
2. 브라우저 권한 팝업에서 카메라 허용
3. 실시간 점수·상태·교정 피드백 확인
4. **자세 교정 종료** 또는 탭 닫기로 세션 종료

### 리포트
- 기간 필터(오늘 / 최근 5회 / 전체)로 구간 전환
- 차트 호버 → 시점별 수치 및 대표 이슈 툴팁 확인
- 그래프 표시 토글(점수·목·어깨·상체) 개별 on/off

### 가이드
- 이미지 2장 비교 및 YouTube 교정 영상 재생
- 체크리스트 항목 hover → jQuery UI 툴팁으로 상세 설명
- 4항목 체크 완료율 기반 준비도 점수 확인
- **30분 후 다시 점검** → 타이머 설정, 시간 경과 시 팝업 알림 표시

---

## 점수 체계

| 상태 | 점수 구간 | 색상 |
|------|-----------|------|
| 양호 (Good) | 80 – 100 | 초록 |
| 주의 (Warning) | 65 – 79 | 노랑 |
| 위험 (Critical) | 0 – 64 | 빨강 |

점수는 목 정렬 각도, 어깨 좌우 불균형, 상체 전방 기울기의 가중합으로 산출됩니다.  
80점 전후 구간에 완화 보정이 적용되어 일상적인 착석 자세에서도 안정적인 점수를 유지합니다.

---

## 평가 요소 대응

| # | 평가 요소 | 구현 위치 |
|---|-----------|-----------|
| 1 | CSS3 수평 정렬 | `display: flex; justify-content` — nav, topbar, metrics-bar 등 전반 |
| 2 | CSS3 중앙 정렬 | `align-items: center; justify-content: center` — 모달, 오버레이, CTA 등 |
| 3 | CSS3 One True Layout | `display: grid; grid-template-columns: 260px 1fr` — app-shell 2열 등높이 구조 |
| 4 | CSS3 절대 좌표 | `position: absolute` — 웹캠 오버레이, scan-frame, cta-ring 등 |
| 5 | 반응형 웹 | `@media` 1200px · 900px · 768px · 600px 4단계 미디어 쿼리 |
| 6 | JS · 객체 · DOM · jQuery · 플러그인 | main.js 전체, jQuery 3.7.1, **jQuery UI Tooltip 플러그인** |
| 7 | 효과적인 디자인 구성 | CSS 변수, `@keyframes`, `transition`, `backdrop-filter`, 그라디언트 시스템 |
| 8 | 오디오 및 동영상 | `<audio>` alert.mp3, Web Audio API, YouTube iframe, webcam `<video>` |

---

## 트러블슈팅

### 백엔드 연결 실패

```bash
curl http://127.0.0.1:8000/health
# 응답 없으면 백엔드 재실행

lsof -i :8000   # 포트 점유 확인
```

### `pose_landmarker_lite.task` 파일 누락 오류

현재 코드 기준으로 필요한 파일 경로는 아래입니다.

```text
backend/model_assets/pose_landmarker_lite.task
```

다음 순서로 확인하세요.

1. `backend/model_assets/` 폴더가 있는지 확인
2. 그 안에 `pose_landmarker_lite.task` 파일이 있는지 확인
3. 없으면 루트의 `model_assets/pose_landmarker_lite.task` 파일을 `backend/model_assets/`로 복사

macOS:

```bash
mkdir -p backend/model_assets
cp model_assets/pose_landmarker_lite.task backend/model_assets/pose_landmarker_lite.task
```

Windows:

```bat
mkdir backend\model_assets
copy model_assets\pose_landmarker_lite.task backend\model_assets\pose_landmarker_lite.task
```

### 웹캠이 켜지지 않음

- 주소가 `http://127.0.0.1:5500/...` 인지 확인 (`file://` 불가)
- 브라우저 주소창 카메라 아이콘 → 허용
- macOS **시스템 설정 → 개인정보 보호 및 보안 → 카메라** 에서 브라우저 권한 확인
- Zoom, Meet, Teams 등 카메라 점유 앱 종료 후 재시도

### uvicorn 옵션 오류

`—reload` (긴 대시) 대신 `--reload` (하이픈 2개) 를 사용해야 합니다.

```bash
# 올바른 실행
../.venv/bin/python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

### 브라우저 콘솔 디버그 로그

| 접두사 | 내용 |
|--------|------|
| `[Backend]` | 헬스체크 성공·실패 |
| `[WS]` | WebSocket 연결·종료·에러 |
| `[Camera]` | 카메라 초기화 상태 |
| `[Session]` | 세션 시작·종료 |

---

## OpenCV 단독 테스트 (브라우저 없이)

```bash
cd /path/to/upright/backend
../.venv/bin/python main.py --camera-id 0 --width 1280 --height 720 --mode auto
# 종료: q 또는 Esc
```

---

## 권장 환경

- macOS (Apple Silicon / Intel)
- Python 3.13
- Chrome 또는 Safari 최신 버전
- 웹캠 장착 환경

---

## 참고

- 첫 실행 시 MediaPipe 모델 로딩과 캐시 생성으로 수 초 소요될 수 있습니다.
- IDE Python 인터프리터는 `.venv` 를 선택하세요.
- 자세 이미지 출처: [팀엘리시움 블로그](https://blog.teamelysium.kr/student_posture_imbalance2)
