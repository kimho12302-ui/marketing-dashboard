$PYTHON = "C:\Users\김호\AppData\Local\Programs\Python\Python312\python.exe"

Write-Host "========================================"
Write-Host "PPMI 4월 데이터 백필 (4/1 ~ 4/5)"
Write-Host "========================================"

Write-Host "`n[1/4] Meta Ads 백필..."
Set-Location "C:\Users\김호\Projects\meta-ads-sheets"
& $PYTHON main.py --days 6
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Meta 실패" }

Write-Host "`n[2/4] Google Ads 백필..."
Set-Location "C:\Users\김호\Projects\google-ads-sheets"
& $PYTHON main.py --days 6
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Google 실패" }

Write-Host "`n[3/4] Naver SA 백필..."
Set-Location "C:\Users\김호\Projects\naver-searchad-sheets"
& $PYTHON main.py --days 6
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Naver 실패" }

Write-Host "`n[4/4] 시트 → Supabase 동기화..."
Set-Location "C:\Users\김호\Projects\marketing-dashboard\scripts"
& $PYTHON sync_all.py
if ($LASTEXITCODE -ne 0) { Write-Host "❌ sync_all 실패" }

Write-Host "`n========================================"
Write-Host "완료. 대시보드에서 확인하세요."
Write-Host "========================================"
