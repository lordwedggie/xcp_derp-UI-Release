param(
    [string]$Message = "Turn complete, My Lord.",
    [string]$PiperExe = "$env:LOCALAPPDATA\piper\piper\piper.exe",
    [string]$ModelPath = "$env:LOCALAPPDATA\piper\piper\en_GB-cori-high.onnx",
    [int]$Volume = 50
)

if (-not (Test-Path $PiperExe)) {
    Write-Warning "Piper not found at $PiperExe"
    exit 1
}
if (-not (Test-Path $ModelPath)) {
    Write-Warning "Voice model not found at $ModelPath"
    exit 1
}

$tempWav = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "codewhale_turn_complete.wav")

# Piper logs info to stderr — capture but don't fail
$piperOutput = $Message | & $PiperExe --model $ModelPath --output_file $tempWav 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Piper failed (exit $LASTEXITCODE): $piperOutput"
    Remove-Item $tempWav -ErrorAction SilentlyContinue
    exit 1
}

$ffplay = Get-Command ffplay -ErrorAction SilentlyContinue
if ($ffplay) {
    & $ffplay.Source -volume $Volume -nodisp -autoexit $tempWav 2>$null
} else {
    $player = New-Object System.Media.SoundPlayer
    $player.SoundLocation = $tempWav
    $player.PlaySync()
    $player.Dispose()
}
Remove-Item $tempWav -ErrorAction SilentlyContinue
