@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if not errorlevel 1 (
  start "日志查看-后端" cmd /k "python backend\app.py"
  goto :serve
)
where py >nul 2>&1
if not errorlevel 1 (
  start "日志查看-后端" cmd /k "py -3 backend\app.py"
  goto :serve
)

echo 未找到 python 或 py，请先安装 Python 并加入 PATH。
pause
exit /b 1

:serve
rem 等待后端监听（可按机器情况调整秒数）
timeout /t 3 /nobreak >nul

rem OpenAPI（Swagger UI）
start "" "http://127.0.0.1:5000/docs"
rem 前端缺省页（由同一后端托管静态资源）
start "" "http://127.0.0.1:5000/"

endlocal
