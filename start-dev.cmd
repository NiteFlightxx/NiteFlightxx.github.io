@echo off
chcp 65001 >nul
title Nite Portfolio - Dev Server
cd /d "E:\UnrealProjects\wanglinfeng-portfolio"

echo ============================================
echo   Nite Portfolio - Local Dev Server
echo ============================================
echo.
echo Starting Astro dev server on port 5173...
echo.
echo   Browser:  http://localhost:5173/
echo   Stop:     Ctrl + C
echo.
echo --------------------------------------------

npx astro dev --port 5173

echo.
echo --------------------------------------------
echo Server stopped.
pause
