@echo off
title Ramu's Ledger - Shop Manager
echo ========================================================
echo          Ramu's Ledger - Shop Manager Server
echo ========================================================
echo.
echo Starting FastAPI Backend Server on http://localhost:8000 ...
echo Open your browser at http://localhost:8000
echo.
echo Press Ctrl+C anytime to stop the server.
echo ========================================================
echo.

cd /d "%~dp0"
py -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
pause
