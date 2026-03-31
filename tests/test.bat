@echo off
setlocal
cd /d "%~dp0.."

where python >nul 2>&1
if errorlevel 1 (
  where py >nul 2>&1
  if errorlevel 1 (
    echo 未找到 python 或 py，请先安装 Python 并加入 PATH。
    pause
    exit /b 1
  )
  set PY=py -3
) else (
  set PY=python
)

echo 运行后端测试 ^(pytest tests^) ...
echo.

%PY% -m pip install -q -r requirements.txt
%PY% -m pytest tests -v
set EX=%ERRORLEVEL%

echo.
if %EX% equ 0 (
  echo 全部通过。报告见 test_reports\backend_test_report_*.md
) else (
  echo 存在失败，退出码 %EX%
)
echo.
pause
endlocal
exit /b %EX%
