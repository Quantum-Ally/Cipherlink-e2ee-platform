@echo off
REM Launch Firefox treating network IP as secure context
REM This enables crypto.subtle on http://192.168.18.125:5173

echo Starting Firefox with insecure origin override...
echo.
echo Network IP will be treated as secure context:
echo http://192.168.18.125:5173
echo.
echo Press Ctrl+C to stop Firefox when done testing.
echo.

REM Create temp profile directory if it doesn't exist
if not exist "C:\temp\firefox-insecure" mkdir "C:\temp\firefox-insecure"

REM Launch Firefox with security override
"C:\Program Files\Mozilla Firefox\firefox.exe" ^
  -new-instance ^
  -profile "C:\temp\firefox-insecure" ^
  -pref "dom.securecontext.allowlist=192.168.18.125:5173" ^
  "http://192.168.18.125:5173"

echo.
echo Firefox closed.
pause
