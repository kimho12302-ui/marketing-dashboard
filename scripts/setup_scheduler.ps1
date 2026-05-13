# PPMI 마케팅 데이터 자동 수집 — 작업 스케줄러 등록
# 실행: PowerShell을 관리자 권한으로 열고 .\setup_scheduler.ps1
#
# 실행 순서:
#   07:00  Meta Ads 수집   (7일 백필)
#   07:00  Google Ads 수집 (7일 백필)
#   07:30  Naver SA 수집   (7일 백필)
#   08:00  시트 -> DB (sync_all)
#   08:30  DB -> 원본 시트
#   08:40  DB -> Data Hub

$CMD     = "C:\Windows\System32\cmd.exe"
$LOG_DIR = "C:\PPMI\logs"
$BAT_DIR = "C:\PPMI\scripts"

if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR | Out-Null
}
if (-not (Test-Path $BAT_DIR)) {
    New-Item -ItemType Directory -Path $BAT_DIR | Out-Null
}

$SETTINGS = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$TASKS = @(
    @{ Name="PPMI_Meta_Ads_Sync";   Time="07:00"; Bat="run_meta.bat" },
    @{ Name="PPMI_Google_Ads_Sync"; Time="07:00"; Bat="run_google.bat" },
    @{ Name="PPMI_Naver_SA_Sync";   Time="07:30"; Bat="run_naver.bat" },
    @{ Name="PPMI_GA4_Sync";        Time="08:10"; Bat="run_ga4.bat" },
    @{ Name="PPMI_Sync_All";        Time="08:30"; Bat="run_sync_all.bat" },
    @{ Name="PPMI_DB_To_Sheet";     Time="08:30"; Bat="run_db_to_sheet.bat" },
    @{ Name="PPMI_DB_To_DataHub";   Time="08:40"; Bat="run_db_to_datahub.bat" }
)

foreach ($t in $TASKS) {
    $action  = New-ScheduledTaskAction `
        -Execute $CMD `
        -Argument "/c $BAT_DIR\$($t.Bat)" `
        -WorkingDirectory $BAT_DIR
    $trigger = New-ScheduledTaskTrigger -Daily -At $t.Time
    Register-ScheduledTask `
        -TaskName $t.Name `
        -Action $action `
        -Trigger $trigger `
        -Settings $SETTINGS `
        -RunLevel Highest `
        -Force | Out-Null
    Write-Host "OK $($t.Name) ($($t.Time))"
}

Write-Host ""
Write-Host "등록 완료:"
Get-ScheduledTask | Where-Object { $_.TaskName -like "PPMI_*" } | Select-Object TaskName, State | Format-Table -AutoSize
