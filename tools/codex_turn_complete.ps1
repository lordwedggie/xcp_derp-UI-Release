param(
    [string]$Message = "Turn complete, My Lord.",
    [string]$Voice = "Microsoft Huihui Desktop"
)

Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice($Voice)
} catch {
    Write-Warning "Voice '$Voice' is not available. Using default voice."
}
$speaker.Speak($Message)
