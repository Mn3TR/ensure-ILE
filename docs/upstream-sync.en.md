# Upstream Sync Guide

> Upstream moves; this is how we follow. ensure-ILE is not a copy of upstream — it is **four layers stacked**: a pinned submodule, patched npm packages, a forked desktop shell, and a profile composition. Each layer syncs on its own rhythm: a new pin is not a redone patch, and a shell change is not a plugin change. Treating them as one thing turns "upgrade" and "fix" into the same word.

## 1. Four Identities

| Layer | Carrier | Upstream coordinate | How we change it | Sync action |
| --- | --- | --- | --- | --- |
| ① Source base | `deepseek-harness/` submodule | tag `dsh-v0.2.1-rc.2` = `687f282e86` | **not at all** | move the pin |
| ② Runtime packages | registry `@deepseek-ai/*` + `patches/*.patch` + `vendor/dsh-runtime/` | tarballs of that same version | 29 patches | re-cut patches after a pin move |
| ③ Desktop shell | `dsh-plugin-desktop/` (a workspace in this repo) | `anywhere-labs/dsh-desktop` | edit the source directly | `git fetch upstream` + merge |
| ④ Runtime composition | `profiles/ensure-ile/cordis.patch.yml` | none (ours alone) | row overrides | follow upstream row ids / schemas |

### ① The submodule: upstream source, pinned

`.gitmodules:1-3` points `deepseek-harness` at `https://github.com/deepseek-ai/deepseek-harness.git`. The pin is `687f282e8625c6b8d11ff58211a90524be2e4317`, exactly tag `dsh-v0.2.1-rc.2` (the first column of `git submodule status` says so). The working tree is **untouched**: `git -C deepseek-harness status --short` prints nothing, and `scripts/verify-layout.mjs` asserts the same thing (`deepseek-harness contains local changes`).

The submodule carries its own pnpm workspace (`packageManager` in `deepseek-harness/package.json` is `pnpm@…`); never install into it with the root Yarn. Root `package.json:770-775` provides six bridge scripts:

| Script | What it actually runs |
| --- | --- |
| `upstream:version` | `cd deepseek-harness && corepack pnpm --version` — just confirms pnpm is the submodule's manager |
| `upstream:install` | `CI=true corepack pnpm install --frozen-lockfile` |
| `upstream:build` | `corepack pnpm run build` |
| `upstream:build:official` | same, plus `DSH_BUILD_CLIENT_PROFILE=official` (the official client profile) |
| `upstream:pack:dsh` | `corepack pnpm run release:pack --family dsh` — produces the `@deepseek-ai/*` tarballs |
| `upstream:prepare-runtime` | the last three in a row: install → build:official → pack:dsh. **This is where the vendor directory comes from** |

### ② The npm layer: patches on installed packages

Root `package.json:23-720` holds **697 `resolutions` entries**: **52 of them are `patch:` references pointing at 29 `patches/*.patch` files** (changing upstream behaviour), and the rest pin every `@deepseek-ai/dsh*` to `file:vendor/dsh-runtime/0.2.1-rc.2/*.tgz` (from `package.json:35`), plus a few version convergences such as `koffi`.

`vendor/dsh-runtime/0.2.1-rc.2/` is a tarball tree (344 entries: 343 packages plus `manifest.json`), maintained by `scripts/sync-vendored-runtime.mjs`: `--write` reads `upstream.json`'s `channels.<channel>`, copies tarballs out of `deepseek-harness/dist/npm/`, rewrites `manifest.json`, and regenerates the DSH section of the root `resolutions`; `--check` only verifies. **Its field of view is the current version directory** (`readdirSync(vendorDirectory)`, script lines 114 and 197), so a stale version tree sitting beside it is structurally invisible — pruning old trees is a human action, and it must be followed by `corepack yarn install --immutable` to prove nothing broke.

**Why patches instead of editing the submodule?** The submodule is a pinned contract: it must match `upstream.json`'s commit exactly or `verify-layout` fails outright, and the next pin move would wipe any edit. Patches land on the **installed npm package** instead, so upgrades stay controllable (a patch that no longer fits fails loudly rather than smuggling changes forward), each can be reverted alone (delete one `resolutions` line and upstream behaviour returns), and the upstream source tree stays clean.

### ③ The desktop shell: a fork, not a submodule

`git remote -v` reports `origin` = `https://github.com/Mn3TR/ensure-ILE.git` and `upstream` = `https://github.com/anywhere-labs/dsh-desktop.git` — so "upstream desktop shipped a release" means **porting, not checking out**. The facts:

- `dsh-plugin-desktop/package.json` names the package `dsh-plugin-desktop`, version `2.0.18`; local tags are `v2.0.18`, `v2.0.18-beta.1`, `v2.0.19-next`.
- We **share history** with upstream (the fork root `b67e81ac97` is an ancestor of `upstream/master`); this is not a squashed copy. The divergence point is `6a63b9730b` (2026-10-18, `fix(desktop): support AA Schemastery 3.18.5 builds (#1417)`).
- Against `upstream/master` (`092e2ecef7`, 2026-10-24) we are **33 commits behind and 60 ahead**. The `dsh-plugin-desktop/` tree alone has 732 commits of history.
- `THIRD_PARTY_NOTICES.md` is a generated inventory of the installed artifacts (`@deepseek-ai/*` all at `0.2.1-rc.2`); it says nothing about upstream licensing and is not a sync input.

Two approaches, two prices:

| Approach | How | Price |
| --- | --- | --- |
| **Rebase the upstream tag onto a lifeboat branch** | `git fetch upstream --tags`, then `git rebase upstream/v2.0.19` on `sync/v2.0.19` | 60 local commits replay one by one; conflicts cluster in `dsh-plugin-desktop/src/`, `build/`, `cordis.patch.yml`; you cannot fix-and-verify during the rebase, and a crash means starting over. Linear history in return |
| **Cherry-pick only the fixes we need** | scan `git log upstream/master --oneline`, then `git cherry-pick -x <sha>` | each pick requires judging which upstream refactor the fix depends on; long dependency chains leave you with half a fix. You can stop any time, and risk stays per-commit |

Large structural change (upstream reshuffling Host/Client, say) leaves only rebase; scattered bug fixes are cheaper to cherry-pick.

### ④ The profile layer: runtime patch, not source

`profiles/ensure-ile/cordis.patch.yml` holds only four rows and **none of them is an `insert:`** — every one is a field override of an existing row, matched by `id`:

| Row | Target | What it overrides | Lines |
| --- | --- | --- | --- |
| `desktop-shell` | `dsh-plugin-desktop` (with a `name` guard) | `mode: advanced`, `windowsMaterial: off`, `openBrowser: false`, `networkExposure: loopback` | `:7-13` |
| `desktop-notifications` | `dsh-plugin-desktop/notifications` (with a `name` guard) | `enabled` plus six `notifyOn*` flags, all `false` | `:16-25` |
| `agent-preset-registry` | same-named row | `default: guide` — new sessions start in the guide preset | `:29-31` |
| `workspace-controller` | same-named row | `documentsDirectory: !!js dshHomePath('..')`, pulling the default workspace into the data root | `:37-39` |

Inserting rows is the **package layer's** job, not the profile's: `dsh-plugin-desktop/cordis.patch.yml` carries the `- insert:` block (`desktop-shell`, `desktop-terminal`, `desktop-diagnostics`, `desktop-notifications`, `desktop-pnpm`, `desktop-profiles`, `desktop-updates`), and the same file disables `preset-standard`, `preset-ptc`, `preset-minimal` and `preset-cordis`.

The semantics come from the include plugin's `applyEntryPatches` (`dsh-plugin-desktop/node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js:56-105`): only rows carrying `insert` append (`:69-84`); every other row needs an `id` and overwrites the matched row field by field (`:86-102`).

- `name` is a **guard, not an identity**: when it differs from the target's name the plugin warns `patch: name mismatch for … skipping` and drops the patch (`:95-98`); an `id` that matches nothing warns `patch: entry … not found` (`:91-93`).

So when upstream renames a row id or a plugin specifier, nothing here errors — it just stops applying: rename `agent-preset-registry` and new sessions fall back to `standard`; rename `workspace-controller` and the default workspace lands in the OS Documents folder again; change `desktop-shell`'s package name and all three config fields are lost, dropping the shell back to compatibility mode. The symptoms are in the failure-signal table.

### ⑤ Our own packages

Root `package.json:10-22` declares 11 workspaces; **only the first two need upstream sync**, the other nine have us as their upstream:

| Workspace | Origin |
| --- | --- |
| `dsh-plugin-desktop` | **fork** of `anywhere-labs/dsh-desktop` (see ③) |
| `dsh-plugin-memory` | **fork** of `@max-null/dsh-memory` `v0.18.0`; our version is `0.18.0-ensure-ile.1`; the sync rules live in `dsh-plugin-memory/UPSTREAM.md` (no history merge — copy file by file; the unmerged list sits in the same file) |
| `dsh-plugin-teaching-commons` / `setup` / `guide` / `work` / `hrl` / `bankmanager` / `textbook` / `schedule` | **original**, no upstream, therefore no sync action |
| `dsh-community-fabric` | **original, documentation only**; declares no loadable entry point |

## 2. Patch Inventory (29)

Every entry below was read out of the `.patch` hunks, not copied from a README. Four categories only: **feature** (behaviour we want), **platform** (an upstream package that will not run under Electron/Windows as shipped), **packaging** (installer and asar paths), and **upstream bug fix** (an upstream defect that bites every consumer).

| Patch | Target package | What it does | Category |
| --- | --- | --- | --- |
| `app-builder-lib@26.15.7.patch` | `app-builder-lib` | macOS: import a list of certificates one by one (`importCerts` + `set-key-partition-list`). NSIS: add `ManifestLongPathAware`, detect an already-running instance in the same directory through PowerShell CIM, extract in place with `Nsis7z::Extract` (no second copy out of `$PLUGINSDIR`), and continue with a non-atomic replacement when the old uninstaller returns 2 | packaging |
| `dsh-app-boot@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-app-boot` | Passes `readPatches` and `resolvePackageManifest` through to embedded launchers: the desktop shell owns the bundle graph, but a pending patch document still has to be visible to the config editor | platform |
| `dsh-client-modules@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-modules` | Newline counting switches from `for (const char of value)` to an `indexOf('\\n')` loop during sourcemap correction | upstream bug fix |
| `dsh-client-ui-directory-picker-browse@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` | Directory browser gains two states — native pick and validate-before-enter (`nativePicking`, `validatingDirectory`) — and keeps the parent button inert while busy | feature |
| `dsh-client-ui-plugin-manager@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-plugin-manager` | Adds `plugins.bundle.hidden` / `plugins.item.hidden` preferences and opens the package card, item detail and page header as slots (`plugins.bundle.actions` and friends) so the shell can inject its own controls | feature |
| `dsh-client-ui-primitives@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-primitives` | Wide markdown tables scroll horizontally: `overflow-x` plus a thin scrollbar in `MarkdownText.module.css` | feature |
| `dsh-client-ui-settings-account@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-account` | Lifts the onboarding dialog footer into a `DesktopOnboardingNavigation` component (back / skip) and adds a `data-desktop-onboarding-surface` marker | feature |
| `dsh-client-ui-settings-general@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-general` | Ships a local 16×16 desktop-settings glyph — the upstream slot does not accept icons yet | feature |
| `dsh-client-ui-settings-shell@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-shell` | Recognises a `desktop-windows-pwsh-sandbox` config namespace and prefers it over the upstream `pwsh` card (Electron needs a different executor for ACL launches) | platform |
| `dsh-client-ui-sidebar@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-sidebar` | Adds a `data-sidebar-header-controls` mount point in the sidebar header | feature |
| `dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | `check_permissions` goes through `inner.get('desktopPermissions')`: the shell queries and requests screen/accessibility permissions while the driver reports actual state | platform |
| `dsh-experimental-inspector@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-experimental-inspector` | Turns the empty `reattach(e) {}` stub in a devtools chunk into a real `e()` call | upstream bug fix |
| `dsh-hmr@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-hmr` | Supports public-loader embedding: without module internals it no longer throws `--expose-internals is required` and skips comparison-based module reload | platform |
| `dsh-host-directory-picker-browse@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-host-directory-picker-browse` | Windows reparse and system directories can look like directories yet fail `stat`; treat them as enterable so the parent listing keeps working | platform |
| `dsh-host-open-in-app@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-host-open-in-app` | Scrubs `ELECTRON_RUN_AS_NODE` out of the child environment before launching an external app (both resolvers patched) | platform |
| `dsh-plugin-manager@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-plugin-manager` | Reads `dsh.optionalBundles` / `dsh.exclusiveBundles` from the installation anchor JSON: enabling a mutually exclusive bundle displaces the other, and a protected manager stays protected | feature |
| `dsh-plugin-package-inventory-deepseek@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-plugin-package-inventory-deepseek` | Package inventory resolves through the desktop asar resolver — the shell itself lives in `app.asar`, not in `node_modules` — falling back to upstream lookup on `MODULE_NOT_FOUND` | platform |
| `dsh-ptc-runtime-node@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-ptc-runtime-node` | Sets `ELECTRON_RUN_AS_NODE=1` for the child alone in an Electron host (the host is a utility process and cannot carry the switch) | platform |
| `dsh-sandbox-windows-acl@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-sandbox-windows-acl` | A workspace on a non-system drive such as `D:` may inherit only `Modify`, so even the owner lacks `WRITE_OWNER` and the label write fails with `ERROR_ACCESS_DENIED(5)`; grant `WRITE_OWNER` to self and retry once | platform |
| `dsh-subprocess-local@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-subprocess-local` | The private runner must start in Node mode under an Electron host; delete any inherited `ELECTRON_RUN_AS_NODE` first, then add it, and never leak it into the target env sent over IPC | platform |
| `dsh-web-app@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-web-app` | Scrubs the parent env and gives the browser launcher `ELECTRON_RUN_AS_NODE: '1'` plus `windowsHide: true` | platform |
| `dsh@0.2.1-rc.2.patch` | `@deepseek-ai/dsh` | `rejectElectronProfile` applies only when `manageDesktopProfile` is false, and `readPatches` is threaded into `profile-boot` | platform |
| `fs-ext@2.1.1.patch` | `fs-ext` | Under Electron, resolve the binding from `prebuilds/<platform>-<arch>/electron.abi<N>.node`; `install.js` switches to the local build path | platform |
| `node-pty@1.2.0-beta.15.patch` | `node-pty` | Three-level `spawn-helper` fallback: `DSH_NODE_PTY_SPAWN_HELPER` → `execPath + '-spawn-helper'` → the native directory inside `app.asar.unpacked` | packaging |
| `open@11.0.1.patch` / `open@11.0.4.patch` | `open` | `windowsHide: true` so no console window flashes (one patch per version descriptor) | platform |
| `pi-ai@1.2.0.patch` | `@earendil-works/pi-ai` | All six providers drop `block.arguments = parseStreamingJson(...)` from streaming deltas; the terminating `toolcall_end` / `content_block_stop` parse stays. Side effect: `partial` snapshots no longer expose half-built arguments mid-stream | upstream bug fix |
| `pnpm@11.8.0.patch` | `pnpm` | Fixes `minimumReleaseAge` evaluation: derive the cutoff from `publishedBy` and do not treat non-finite values as violations | upstream bug fix |
| `vscode-ripgrep@1.18.0.patch` | `@vscode/ripgrep` | Rewrites `rgPath` from `app.asar` to `app.asar.unpacked` — spawn needs a real OS path and Electron cannot rewrite spawn commands | packaging |

Tally: 15 platform, 6 feature, 3 packaging, 5 upstream bug fixes. Twenty-eight of the twenty-nine are live; `dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch` currently has **no subject** (see 3.4).

## 3. Sync Procedures

### 3.1 Bumping an npm package only (pin untouched)

Typical trigger: a third-party dependency moves from `open@11.0.4` to `11.0.5`, or `@earendil-works/pi-ai` from 1.2.0 to 1.3.0.

```bash
# 1. before changing anything, check that the selectors still match
grep -n 'patches/' package.json | grep -o '"[^"]*@npm:[^"]*"' | sort -u
node scripts/verify-patch-references.mjs      # non-zero exit means a patch has no subject

# 2. install, then look at whether the lock actually carries the patch
corepack yarn install
grep -c './patches/' yarn.lock                # should match the number of patch: resolutions

# 3. tighten
corepack yarn install --immutable
```

Two failure modes must not be confused:

| Symptom | Cause | Consequence |
| --- | --- | --- |
| Install succeeds, zero warnings, no `patch:` entry in the lock | the selector matches no descriptor any dependent declares | **silent no-op** — the file is there and does nothing |
| Install fails, reporting the patch cannot be applied | the selector matched but the hunk no longer fits the new file | loud failure, which is the safer half |

### 3.2 Moving the submodule pin (changing tag)

```bash
# 1. move the pin
git -C deepseek-harness fetch --tags origin
git -C deepseek-harness checkout dsh-v0.2.2          # target tag
node -p "require('./deepseek-harness/package.json').version"   # note the new sourceVersion

# 2. sync the four upstream.json fields (upstream.json:5-11)
#    commit = git -C deepseek-harness rev-parse HEAD (full 40 chars); sourceVersion = the version above
#    runtimePackageVersion = tarball version family (usually == sourceVersion); runtimeSource = vendor/dsh-runtime/<sourceVersion>/manifest.json

# 3. produce the official runtime tarballs from the submodule (install -> build:official -> pack:dsh)
corepack yarn upstream:prepare-runtime
ls deepseek-harness/dist/npm/publish-order.txt       # packing list; --write reads this file

# 4. land the vendor tree: copy tarballs, drop strays, rewrite manifest.json / upstream.json / the DSH resolutions / dependency ranges
node scripts/sync-vendored-runtime.mjs --write --channel stable

# 5. rename and re-cut patches: file names carry the version (the script only emits patch: when patches/<unscoped>@<version>.patch exists)
```

What `verify-layout` inside `check:layout`, plus `sync-vendored-runtime --check`, actually compare:

- the submodule must be `160000` in the index with an object equal to `upstream.json`'s `commit`;
- the submodule `HEAD` equals that commit, **its working tree is clean**, and its `origin` equals `upstream.json.repository`;
- the submodule's `package.json` version equals `sourceVersion`;
- `.gitmodules` path and url match `upstream.json`, and `activeChannel` is declared under `channels`;
- every `@deepseek-ai/dsh*` the desktop shell depends on equals `runtimePackageVersion`;
- vendored runtime: `manifest.json`'s `repository`/`commit`/`version`/`buildProfile: official` match `upstream.json`, every tarball's size and sha256 match the manifest, both selectors (exact and `^version`) resolve to `expectedResolution`, no stray entries exist in the directory, and no stale DSH resolution for this channel survives.

Finally `corepack yarn install --immutable` must exit 0 — the only proof that moving the pin did not tear the lockfile.

### 3.3 Upstream desktop shell ships a release

```bash
git fetch upstream --tags
git log --oneline HEAD..upstream/master          # currently 33 commits (2026-10-24 baseline)
git diff --stat HEAD...upstream/master -- dsh-plugin-desktop
```

Then pick one (price table in ③):

```bash
# A. rebase the upstream tag onto a lifeboat branch
git switch -c sync/upstream-$(date +%Y%m%d) master
git rebase upstream/master        # 60 local commits replay here
# B. cherry-pick only what is needed
git cherry-pick -x <sha>
```

Conflict hotspots: `dsh-plugin-desktop/src/index.ts` (our desktop HTTP routes), `dsh-plugin-desktop/cordis.patch.yml` (the `insert` block and `disabled` list), `dsh-plugin-desktop/build/installer.nsh` (data-root migration), and the `profiles/` mirror written by `scripts/prepare-profile.mjs`. After merging, run `corepack yarn workspace dsh-plugin-desktop typecheck`, then the 3.5 checklist.

### 3.4 When a patch silently stops applying — this happened

The pi-ai streaming tool-argument patch had not applied since the lock reached 1.2.0, and was only caught by a grep on 2026-10-28. The chain:

1. `resolutions` declared `@earendil-works/pi-ai@npm:^0.87.1` and `@npm:^1.0.2`, while the dependent actually declares `npm:^1.1.0`;
2. Yarn applies a patch only when the selector equals a descriptor that is actually requested, so both were **silently ignored**: no warning, no `patch:` marker in the lock, the file sitting untouched in `patches/`;
3. today the mapping is `package.json:32`'s `@earendil-works/pi-ai@npm:^1.1.0` → `patches/pi-ai@1.2.0.patch`.

A second real entry, still inert: `patches/dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch`. Two resolutions at `package.json:665-666` point it at vendor tarballs, and those tarballs really are in `vendor/dsh-runtime/0.2.1-rc.2/` (all four computer-use packages are). Yet `grep 'cua-driver-native' yarn.lock` returns **zero lines**, and so does `grep 'dsh-computer-use' yarn.lock`: the entire computer-use branch is not in this repository's Yarn dependency graph, and nothing requests those descriptors. **The patch exists, the resolution exists, the tarball exists, but the lock has no entity ⇒ no subject ⇒ silent no-op.**

```bash
node scripts/verify-patch-references.mjs        # marks it INERT with a reason
grep -c 'cua-driver-native' yarn.lock           # manual check: 0 means no subject
```

**Recommendation: keep it, do not delete.** The patch itself is live code (it wires `check_permissions` to `desktopPermissions` to query and request screen/accessibility access), so the moment computer-use returns to the dependency graph — a profile mounting its bundle — both resolutions take effect. The cost of keeping it is 1.7 KB and one INERT line; deleting it would suggest we never intended to support it.

`scripts/verify-patch-references.mjs` is currently an **orphan script**: its own header says `Orphan status: not part of yarn check yet. See docs/upstream-sync.md`. Whether it joins `check:layout` is Li's call — the upside is a red gate on the day a selector drifts, the downside is that it also fails on the legitimate state of "a vendor tarball nothing installs", which is exactly today's state.

### 3.5 Post-sync checklist

Run in order; every command is an existing root `package.json` script.

| # | Command | Assertion |
| --- | --- | --- |
| 1 | `corepack yarn install --immutable` | exit 0 — lockfile and `resolutions` agree |
| 2 | `corepack yarn typecheck` | desktop shell types clean |
| 3 | `corepack yarn check` | = `check:layout` + community-fabric + desktop workspace; **does not run plugin unit tests** |
| 4 | `corepack yarn check:plugins` | typecheck for nine packages plus unit tests for setup/bankmanager/memory/textbook/schedule |
| 5 | `corepack yarn docs:record` | recomputes bilingual hashes, touching only stale lines |
| 6 | `corepack yarn check:bilingual-docs` | records match the files' actual hashes |
| 7 | `corepack yarn icons:check` | icon sources match every platform asset |
| 8 | `corepack yarn dist:win` | a real package; artifacts in `dsh-plugin-desktop/dist/`, installed data root = `dirname(ensure-ILE.exe)\\.ensure-ile` |
| 9 | Update AGENTS.md | version, verification status, new pitfalls |

## 4. Failure Signals

| Symptom | Look here first |
| --- | --- |
| Startup stalls on "loading settings" or lands on the recovery page | `profile-setup/<hash>/state.json.pending` must be exactly `pending\\n` (8 bytes); an empty file sends the main process to recovery. A ~30 s first screen on a cold start is not a hang |
| A plugin row never loads and its tools vanish | the row's `inject` lists an optional channel (`webServer` / `webStartup`) — it must move into a nested `ctx.inject([...], …)`; a top-level `inject` leaves the whole row pending in a profile without web-app |
| Profile edits do nothing; new sessions still use `standard` | the row `id` no longer matches upstream: boot warns `patch: entry … not found`, or `patch: name mismatch for … skipping` when the package name changed (`cordis-plugin-include/lib/index.js:91-98`) |
| A patch appears not to apply | `grep -c './patches/' yarn.lock`; `node scripts/verify-patch-references.mjs`; then check the selector against the descriptor the dependent declares (3.4) |
| Stale version trees under `vendor/dsh-runtime/` | `ls vendor/dsh-runtime/` — only the tree named by `upstream.json` may exist; `--check` looks only at the current directory. After pruning, run `install --immutable` |
| Edited `profiles/ensure-ile/` but an old install still uses the old template | `seedProfile()` **copies only when the file is absent**: delete `.ensure-ile/home/profiles/desktop` and restart, then run `pnpm install --offline` by hand |
| The submodule shows as dirty | `git -C deepseek-harness status --short` is non-empty → `verify-layout` fails with `deepseek-harness contains local changes`; restore it first |
| Desktop dependency versions drift after a pin move | `verify-layout`: `<pkg> @deepseek-ai/dsh-* must use the recorded stable DSH runtime package family` |
| The patch file exists yet install fails | the selector matched but the hunk no longer fits the new file — re-cut the patch, do not edit the selector |
