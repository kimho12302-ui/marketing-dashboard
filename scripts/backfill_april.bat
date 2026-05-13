@echo off
chcp 65001 > nul
echo ========================================
echo PPMI 4월 데이터 백필 (4/1 ~ 4/5)
echo ========================================

set PYTHON=C:\Users\김호\AppData\Local\Programs\Python\Python312\python.exe

echo.
echo [1/4] Meta Ads 백필 (5일)...
cd /d C:\Users\김호\Projects\meta-ads-sheets
%PYTHON% main.py --days 6
if errorlevel 1 echo ❌ Meta 실패

echo.
echo [2/4] Google Ads 백필 (5일)...
cd /d C:\Users\김호\Projects\google-ads-sheets
%PYTHON% main.py --days 6
if errorlevel 1 echo ❌ Google 실패

echo.
echo [3/4] Naver SA 백필 (5일)...
cd /d C:\Users\김호\Projects\naver-searchad-sheets
%PYTHON% main.py --days 6
if errorlevel 1 echo ❌ Naver 실패

echo.
echo [4/4] 시트 → Supabase 동기화...
cd /d C:\Users\김호\Projects\marketing-dashboard\scripts
%PYTHON% sync_all.py
if errorlevel 1 echo ❌ sync_all 실패

echo.
echo ========================================
echo 백필 완료. 대시보드에서 확인하세요.
echo ========================================
pause
