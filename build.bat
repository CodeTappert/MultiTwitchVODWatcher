@echo off
setlocal

set TARGET=%1

where npm >nul 2>nul
if errorlevel 1 (
  echo [error] npm not found on PATH. Install Node.js first.
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 exit /b 1

if "%TARGET%"=="" set TARGET=default

if /I "%TARGET%"=="win"     goto buildwin
if /I "%TARGET%"=="linux"   goto buildlinux
if /I "%TARGET%"=="mac"     goto buildmac
if /I "%TARGET%"=="clean"   goto clean
goto builddefault

:builddefault
echo Building for the current OS...
call npm run dist
goto done

:buildwin
echo Building Windows installers (nsis + portable)...
call npm run dist:win
goto done

:buildlinux
echo Building Linux packages (AppImage + deb)...
call npm run dist:linux
goto done

:buildmac
echo Building macOS packages (dmg + zip)...
call npm run dist:mac
goto done

:clean
echo Cleaning dist/...
if exist dist rmdir /s /q dist
echo Done.
goto :eof

:done
if errorlevel 1 (
  echo [error] Build failed.
  exit /b 1
)
echo.
echo Build complete. Output is in the dist\ folder.
