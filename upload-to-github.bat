@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   VIS OpenClaw GitHub Upload Script
echo ========================================
echo.

set GITHUB_USER=haiqinghao
set REPO_NAME=vis-openclaw
set REPO_URL=https://github.com/%GITHUB_USER%/%REPO_NAME%.git

echo Target: %REPO_URL%
echo.

git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not installed!
    echo Download: https://git-scm.com/downloads
    pause
    exit /b 1
)

if exist .git (
    echo [INFO] Git repo exists
) else (
    echo [STEP 1] Initializing Git repo...
    git init
    echo Done!
    echo.
)

echo [STEP 2] Adding files...
git add .
echo Done!
echo.

echo [STEP 3] Status:
git status --short
echo.

echo [STEP 4] Committing...
git commit -m "feat: VIS OpenClaw v0.9.0 release - Multi-Agent monitoring platform"
if errorlevel 1 (
    echo [INFO] Nothing to commit or commit failed
)
echo Done!
echo.

git remote -v | findstr "origin" >nul
if errorlevel 1 (
    echo [STEP 5] Adding remote...
    git remote add origin %REPO_URL%
) else (
    echo [STEP 5] Updating remote...
    git remote set-url origin %REPO_URL%
)
echo Done!
echo.

echo [STEP 6] Setting main branch...
git branch -M main
echo Done!
echo.

echo [STEP 7] Pushing to GitHub...
echo Note: GitHub login window may pop up
echo.
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed!
    echo Possible reasons:
    echo   1. Repo not created yet
    echo   2. Not logged in - run: git config --global user.name "YourName"
    echo   3. Permission denied
    pause
    exit /b 1
)

echo.
echo ========================================
echo   SUCCESS!
echo ========================================
echo.
echo Repo: https://github.com/%GITHUB_USER%/%REPO_NAME%
echo.

set /p CREATE_TAG="Create v0.9.0 tag? (Y/N): "
if /i "%CREATE_TAG%"=="Y" (
    echo.
    echo [STEP 8] Creating tag...
    git tag -a v0.9.0 -m "VIS OpenClaw v0.9.0"
    git push origin v0.9.0
    echo Done!
    echo.
    echo Create release at:
    echo https://github.com/%GITHUB_USER%/%REPO_NAME%/releases/new
)

echo.
pause