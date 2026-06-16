---
name: update-codewhale
description: Diagnose and repair stale CodeWhale installs, especially when the user says to update CodeWhale, CodeWhale says an update is available, codewhale doctor reports an old current version, codewhale-tui is stale, npm shims hang, or codewhale --version disagrees with doctor.
---

# Update CodeWhale

## Purpose

Update CodeWhale by checking every launch path, then repair the wrapper, TUI, and npm shim copies until `codewhale doctor` agrees that the install is current.

This skill exists because a prior update took over an hour: `codewhale --version` and `codewhale update` both appeared successful, but `codewhale doctor` still reported a stale `codewhale-tui` runtime.

## First Rule

Do not trust `codewhale --version` or `codewhale update` alone. Always verify with `codewhale doctor` and direct `codewhale-tui.exe --version` checks.

Avoid editing repo code for this task unless updating this skill. This is a local tool installation repair, not a project source change.

## Diagnose All Entrypoints

Run these checks before changing anything:

```powershell
where.exe codewhale
Get-Command codewhale -All
codewhale --version
codewhale doctor
& "$env:LOCALAPPDATA\Programs\CodeWhale\bin\codewhale.exe" --version
& "$env:LOCALAPPDATA\Programs\CodeWhale\bin\codewhale-tui.exe" --version
& "$env:APPDATA\npm\codewhale.cmd" --version
& "$env:APPDATA\npm\codewhale-tui.cmd" --version
& "$env:USERPROFILE\.cargo\bin\codewhale-tui.exe" --version
```

Expected paths may include:

- PowerShell profile function: `C:\Users\xuchuang\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
- npm shims: `C:\Users\xuchuang\AppData\Roaming\npm\codewhale*`
- Cargo binary: `C:\Users\xuchuang\.cargo\bin\codewhale-tui.exe`
- AppData install: `C:\Users\xuchuang\AppData\Local\Programs\CodeWhale\bin\codewhale.exe` and `codewhale-tui.exe`

## Known Misleading States

A broken update can look like this:

- `codewhale.exe --version` reports `codewhale 0.8.61 (14ac0319e8f4)`.
- `codewhale update` says latest stable is `v0.8.61` and `Already up to date.`
- `codewhale doctor` still reports `codewhale-tui: 0.8.60`, `current: v0.8.60`, `latest: v0.8.61`, and tells the user to update.

These attempts were incorrect or insufficient:

- Running only `codewhale.exe update`; it may update/check the wrapper CLI while leaving `codewhale-tui.exe` stale.
- Checking only `codewhale --version`; it does not prove the TUI runtime is current.
- Trusting npm global package metadata; `codewhale@0.8.61` can coexist with stale or missing embedded binaries.
- Relying on npm shims before `bin\downloads` contains binaries and `.version` marker files; the shims can hang.
- Re-running forced npm download when GitHub checksum fetch times out at `https://github.com/Hmbown/CodeWhale/releases/download/v0.8.61/codewhale-artifacts-sha256.txt`.
- Using `CODEWHALE_USE_CNB_MIRROR=1` if the CNB mirror returns 404 for the checksum manifest.
- Using `C:\Users\xuchuang\AppData\Local\Temp\codewhale-tui-new.exe`; it had an MZ header but Windows rejected it as invalid for the OS.

## Repair Workflow

Use the installed target version from `codewhale doctor` as `TARGET`, for example `0.8.61`.

1. Install the TUI through Cargo:

```powershell
cargo install codewhale-tui --locked
& "$env:USERPROFILE\.cargo\bin\codewhale-tui.exe" --version
```

2. Back up the stale AppData TUI before replacing it:

```powershell
$bin = Join-Path $env:LOCALAPPDATA 'Programs\CodeWhale\bin'
$target = '0.8.61'
Copy-Item -LiteralPath (Join-Path $bin 'codewhale-tui.exe') -Destination (Join-Path $bin "codewhale-tui.exe.pre-$target-codex-update.bak") -Force
```

3. Copy the Cargo-built TUI into the AppData install:

```powershell
Copy-Item -LiteralPath (Join-Path $env:USERPROFILE '.cargo\bin\codewhale-tui.exe') -Destination (Join-Path $bin 'codewhale-tui.exe') -Force
```

4. Repair npm package embedded downloads so npm shims stop hanging or using stale files:

```powershell
$downloads = Join-Path $env:APPDATA 'npm\node_modules\codewhale\bin\downloads'
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $bin 'codewhale.exe') -Destination (Join-Path $downloads 'codewhale.exe') -Force
Copy-Item -LiteralPath (Join-Path $env:USERPROFILE '.cargo\bin\codewhale-tui.exe') -Destination (Join-Path $downloads 'codewhale-tui.exe') -Force
Set-Content -LiteralPath (Join-Path $downloads 'codewhale.exe.version') -Value $target -NoNewline
Set-Content -LiteralPath (Join-Path $downloads 'codewhale-tui.exe.version') -Value $target -NoNewline
```

## Verify

Run every check and report the exact result lines:

```powershell
codewhale --version
& "$env:LOCALAPPDATA\Programs\CodeWhale\bin\codewhale.exe" --version
& "$env:LOCALAPPDATA\Programs\CodeWhale\bin\codewhale-tui.exe" --version
& "$env:APPDATA\npm\codewhale.cmd" --version
& "$env:APPDATA\npm\codewhale-tui.cmd" --version
& "$env:LOCALAPPDATA\Programs\CodeWhale\bin\codewhale.exe" doctor
```

Success for the 0.8.61 incident was:

- `codewhale 0.8.61 (14ac0319e8f4)` from the normal command and AppData wrapper.
- `codewhale-tui 0.8.61` from AppData and npm shim paths.
- `doctor` showed `codewhale-tui: 0.8.61`, `current: v0.8.61`, `latest: v0.8.61`, and `Already up to date.`

## Final Report

Summarize which install paths were stale, which files were backed up/replaced, and the `doctor` current/latest lines. Mention any failed mirror or download attempts only if they happened in the current run.
