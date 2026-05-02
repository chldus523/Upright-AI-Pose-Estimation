@echo off
chcp 65001 >nul
setlocal

echo.
echo  ==========================================
echo   Upright AI -- Windows Launcher
echo  ==========================================
echo.

REM Python 설치 확인
where python >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 없습니다.
    echo        https://www.python.org 에서 Python 3.13 이상을 설치하세요.
    pause
    exit /b 1
)

REM 가상환경이 없으면 생성 및 패키지 설치
if not exist "%~dp0.venv\Scripts\python.exe" (
    echo [설치] 가상환경 생성 중 (.venv)...
    python -m venv "%~dp0.venv"
    if errorlevel 1 (
        echo [오류] 가상환경 생성에 실패했습니다.
        pause
        exit /b 1
    )
    echo [설치] 패키지 설치 중 (requirements.txt)...
    "%~dp0.venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt"
    if errorlevel 1 (
        echo [오류] 패키지 설치에 실패했습니다.
        pause
        exit /b 1
    )
    echo [설치] 완료
    echo.
)

echo [1/2] 백엔드 서버 시작 중 (포트 8000)...
start "Upright - Backend" cmd /k cd /d "%~dp0backend" ^&^& "%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

timeout /t 1 /nobreak >nul

echo [2/2] 프론트엔드 서버 시작 중 (포트 5500)...
start "Upright - Frontend" cmd /k cd /d "%~dp0frontend" ^&^& "%~dp0.venv\Scripts\python.exe" -m http.server 5500

echo.
echo  ==========================================
echo   서버가 시작되었습니다!
echo  ==========================================
echo.
echo   접속 URL:
echo.
echo   [랜딩]     http://127.0.0.1:5500/
echo   [대시보드] http://127.0.0.1:5500/pages/dashboard.html
echo   [리포트]   http://127.0.0.1:5500/pages/report.html
echo   [가이드]   http://127.0.0.1:5500/pages/guide.html
echo.
echo   백엔드 헬스체크: http://127.0.0.1:8000/health
echo.
echo   종료: 각 터미널 창을 닫으세요.
echo  ==========================================
echo.
pause
