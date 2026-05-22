import json
import os
import shutil
import sys
from pathlib import Path

import folder_paths


EXT_ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = EXT_ROOT / "user" / "derpNodes"
DEST_ROOT = Path(folder_paths.get_user_directory()) / "derpNodes"
STATE_FILE = DEST_ROOT / ".xcp_sync_state.json"

SYNC_FOLDERS = [
    "Palettes",
    "Themes",
    "derpLoraStack",
    "derpPromptBook",
    "derpTriggerWall",
    "nodeSettings",
]


def _is_interactive():
    try:
        return sys.stdin.isatty() and sys.stdout.isatty()
    except Exception:
        return False


def _path_is_system_managed(relative_path: Path):
    parts = list(relative_path.parts)
    if not parts:
        return False

    for part in parts[:-1]:
        if part.startswith("_"):
            return True

    filename = parts[-1]
    return filename.lower().endswith(".json") and filename.startswith("_")


def _file_is_newer(source: Path, dest: Path):
    try:
        return source.stat().st_mtime > dest.stat().st_mtime
    except Exception:
        return False


def _files_identical(source: Path, dest: Path):
    try:
        if source.stat().st_size != dest.stat().st_size:
            return False
        with source.open("rb") as src_handle, dest.open("rb") as dst_handle:
            while True:
                src_chunk = src_handle.read(1024 * 1024)
                dst_chunk = dst_handle.read(1024 * 1024)
                if src_chunk != dst_chunk:
                    return False
                if not src_chunk:
                    return True
    except Exception:
        return False


def _load_state():
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(state):
    try:
        DEST_ROOT.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    except Exception as exc:
        print(f"[xcpDerp] Asset sync state write failed: {exc}")


def _prompt_conflict(relative_path: Path):
    while True:
        answer = input(
            f"[xcpDerp] Overwrite existing file '{relative_path}'? "
            "[y]es/[Y]es to all/[n]o/[N]o to all: "
        ).strip()
        if answer in {"y", "Y", "n", "N"}:
            return answer
        print("[xcpDerp] Please answer with y, Y, n, or N.")


def _copy_file(source: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)


def sync_bundled_assets():
    if not SOURCE_ROOT.exists():
        print(f"[xcpDerp] Bundled asset source missing: {SOURCE_ROOT}")
        return

    interactive = _is_interactive()
    overwrite_all = False
    skip_all = False
    state = _load_state()

    copied = 0
    overwritten = 0
    skipped = 0
    unchanged = 0
    conflicts = 0

    try:
        DEST_ROOT.mkdir(parents=True, exist_ok=True)

        for folder_name in SYNC_FOLDERS:
            source_dir = SOURCE_ROOT / folder_name
            if not source_dir.exists():
                continue

            for source_file in sorted(source_dir.rglob("*")):
                if not source_file.is_file():
                    continue

                relative_path = source_file.relative_to(SOURCE_ROOT)
                dest_file = DEST_ROOT / relative_path

                if not dest_file.exists():
                    _copy_file(source_file, dest_file)
                    copied += 1
                    continue

                if _files_identical(source_file, dest_file):
                    unchanged += 1
                    continue

                conflicts += 1
                managed = _path_is_system_managed(relative_path)
                should_overwrite = False

                if overwrite_all:
                    should_overwrite = True
                elif skip_all:
                    should_overwrite = False
                elif interactive:
                    answer = _prompt_conflict(relative_path)
                    if answer == "Y":
                        overwrite_all = True
                        should_overwrite = True
                    elif answer == "y":
                        should_overwrite = True
                    elif answer == "N":
                        skip_all = True
                        should_overwrite = False
                    else:
                        should_overwrite = False
                else:
                    should_overwrite = managed and _file_is_newer(source_file, dest_file)

                if should_overwrite:
                    _copy_file(source_file, dest_file)
                    overwritten += 1
                else:
                    skipped += 1

        state.update({
            "last_sync_mode": "interactive" if interactive else "non-interactive",
            "last_sync_source": str(SOURCE_ROOT),
            "last_sync_dest": str(DEST_ROOT),
            "copied": copied,
            "overwritten": overwritten,
            "skipped": skipped,
            "unchanged": unchanged,
            "conflicts": conflicts,
        })
        _save_state(state)
        print(
            "[xcpDerp] Bundled asset sync complete: "
            f"mode={'interactive' if interactive else 'non-interactive'}, "
            f"copied={copied}, overwritten={overwritten}, skipped={skipped}, unchanged={unchanged}, conflicts={conflicts}"
        )
    except Exception as exc:
        print(f"[xcpDerp] Bundled asset sync failed: {exc}")
