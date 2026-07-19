# Auto-updates (Tauri updater)

Toodoo checks GitHub Releases for a newer **signed** build and installs it in
place — no reinstall. Users trigger it from **Settings → Updates → Check for
updates**.

## How it works

- The app reads `latest.json` from the repo's **latest published Release**
  (`https://github.com/EphraimTJ/toodoo/releases/latest/download/latest.json`),
  configured under `plugins.updater` in `src-tauri/tauri.conf.json`.
- Every update artifact is signed with a **minisign** private key. The app has
  the matching **public key** baked into `tauri.conf.json` and refuses anything
  not signed by our key. (This is independent of Windows Authenticode signing.)
- `bundle.createUpdaterArtifacts: true` makes `tauri build` emit the signed
  `.sig` + updater manifest.

## One-time setup — GitHub secrets

The release workflow (`.github/workflows/release.yml`) needs two repo secrets
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The **entire contents** of the private key file (`~/.tauri/toodoo-updater.key`). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password chosen when the key was generated. |

**Back up the private key and password** (e.g. a password manager). If they're
lost, you can never ship an update that existing installs will accept — users
would have to reinstall manually.

## Cutting a release

1. Bump the version in **all three**: `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, and `package.json` (e.g. `1.0.0` → `1.1.0`).
2. Commit, then tag and push:
   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```
3. The **Release** workflow builds + signs the installer and creates a **draft**
   release with `latest.json` attached.
4. Review the draft on GitHub and **Publish** it. Publishing is what makes the
   update reach existing installs (the updater only reads the *latest published*
   release).

## First rollout caveat

The currently installed 1.0.0 build predates the updater, so it can't self-update
to the first updater-enabled release — that one must be installed manually. Every
release **after** it updates in-app.
