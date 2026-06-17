---
name: syncthing-debug
description: Diagnose and recover Syncthing workspace sync issues, disconnected remote workspaces, stale relay sessions, device ID drift, and `.stignore` sync confusion. Use when the user mentions Syncthing, disconnected devices, MonkeyCode workspace sync, device IDs, relay reconnects, or restoring a lost workspace link.
---

# Syncthing Debug

Use this skill for MonkeyCode workspace sync problems, especially when a workspace was connected recently and later shows `Disconnected`, or when the user wants device identity to survive rebuilds.

## Known Topology

- Remote MonkeyCode workspace Syncthing home is `/root/.config/syncthing-xcp`.
- The active shared workspace folder may point to `/workspace`.
- The remote daemon may run from `/tmp/opencode/syncthing-v2/syncthing-linux-amd64-v2.1.0/syncthing`.
- Local Windows peers often connect through relay when NAT is port-restricted.

## Identity Rules

- Syncthing device identity comes from `cert.pem` and `key.pem`.
- Reusing the same `cert.pem` and `key.pem` preserves the same device ID across restarts and rebuilds.
- The current project includes helper scripts:
  - Backup: `tools/syncthing_identity_backup.sh`
  - Restore: `tools/syncthing_identity_restore.sh`
- Identity backup is stored at `/workspace/.syncthing-identity/`.

## First Checks

1. Check that the remote daemon is healthy:
   - `curl --silent --max-time 10 "http://127.0.0.1:8384/rest/noauth/health"`
2. Check configured connections:
   - `curl --silent --max-time 10 -H "X-API-Key: <api-key>" "http://127.0.0.1:8384/rest/system/connections"`
3. Check remote device stats and last-seen times:
   - `curl --silent --max-time 10 -H "X-API-Key: <api-key>" "http://127.0.0.1:8384/rest/stats/device"`
4. Check folder state:
   - `curl --silent --max-time 10 -H "X-API-Key: <api-key>" "http://127.0.0.1:8384/rest/db/status?folder=<folder-id>"`
5. Check status and dial errors:
   - `curl --silent --max-time 10 -H "X-API-Key: <api-key>" "http://127.0.0.1:8384/rest/system/status"`
6. Check full config when device names or shared folders are unclear:
   - `curl --silent --max-time 10 -H "X-API-Key: <api-key>" "http://127.0.0.1:8384/rest/config"`

## What Healthy Looks Like

- Health endpoint returns `{"status":"OK"}`.
- Folder status is `idle`.
- `needFiles`, `needBytes`, and `needTotalItems` are all `0`.
- Target device shows `connected: true`.
- Relay sessions often show `type: relay-client` with a relay address.

## Common Failure Patterns

### Stale or Broken Session

Symptoms:

- The workspace was connected recently.
- Device pairing still exists on both sides.
- Folder config is intact.
- Current dial attempts fail with `EOF` or timeout.

Interpretation:

- Discovery or relay state went stale.
- The trust relationship still exists.

Best recovery path:

1. Restart the local Windows Syncthing instance first.
2. Recheck whether the remote device reconnects over relay.
3. Confirm folder state returns to `idle` with `needFiles 0`.

Observed good recovery pattern in this repo:

- Windows restart refreshed discovery and relay state.
- The remote device reconnected successfully as `relay-client`.

### Remote Daemon Stopped After Restart

Symptoms:

- Remote API stops answering after `rest/system/restart`.
- `curl` to `127.0.0.1:8384` fails.
- No Syncthing process remains running.

Interpretation:

- Restart succeeded, but the platform did not auto-spawn the daemon again.

Recovery:

```bash
"/tmp/opencode/syncthing-v2/syncthing-linux-amd64-v2.1.0/syncthing" serve --home="/root/.config/syncthing-xcp" --gui-address="127.0.0.1:8384" --no-browser --no-restart --no-upgrade
```

If the command needs to stay alive, run it as a background process through the agent tooling.

### Device ID Drift After Rebuild

Symptoms:

- Local Syncthing shows a new remote workspace device.
- Older workspace entries stay `Disconnected`.
- The user spent time pairing folders and expects them to persist.

Interpretation:

- The workspace was rebuilt with a fresh Syncthing identity.
- Old device records are still present on the local side.

Recovery:

1. Restore the saved identity:
   - `/workspace/tools/syncthing_identity_restore.sh`
2. Start or restart Syncthing.
3. Verify the remote `myID` matches the previous trusted device.

## Windows-Side Questions For Another Agent

When the remote side looks healthy but the link is still down, ask the Windows-side agent to verify:

- Syncthing is running.
- The remote device is present, trusted, and unpaused.
- The expected folders are shared with that remote device.
- Port `22000` is listening for TCP and QUIC.
- Current local addresses still include the expected LAN address.
- Restarting Windows Syncthing refreshes discovery and relay state.

## `.stignore` Notes

- `.stignore` can be correct while connectivity is still broken.
- Treat ignore rules and connection health as separate concerns.
- A known baseline ignore file used in this repo contains:
  - `.git`
  - `node_modules`
  - `dist`
  - `build`
  - `.next`
  - `coverage`
  - `__pycache__`
  - `*.pyc`
  - `.idea`
  - `*.sync-conflict-*`

## Recommended Order Of Operations

1. Confirm the remote daemon is alive.
2. Confirm folder state and whether sync is already complete.
3. Confirm the remote still knows the expected peer device ID.
4. Read `lastDialStatus` for `EOF`, timeout, or relay failures.
5. Restart the Windows-side Syncthing instance if the pairing still exists.
6. Restart the remote daemon only if the remote side itself is unhealthy.
7. If the remote daemon restart leaves no process behind, start it manually with the known `serve --home=...` command.
8. If the workspace identity changed after rebuild, restore `/workspace/.syncthing-identity/` before reconnecting.

## Output Expectations

When using this skill, report back with:

- Remote `myID`
- Peer device ID and display name
- Whether the daemon is healthy
- Folder states for the affected shares
- Current connection type if connected
- The exact failure signal if disconnected, such as `EOF`, timeout, or relay error
- Whether the issue is session staleness, daemon failure, or identity drift
