# Upstream synchronization for alpha11

## Scope and preservation

The previous working tree was saved as commit `7271543a09` before synchronization. The work is on `sync/upstream-20261114`. Commit `2e219e1ff7` records the Harness gitlink and `upstream.json` separately from the runtime and desktop adaptation.

- Harness source and official runtime: `dsh-v0.2.2-rc.3`, commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`; 375 verified vendored packages.
- Desktop: merge the shared `dsh-plugin-desktop/` subtree from the fixed `v2.0.23-next` release snapshot. Keep the existing desktop architecture and the independent `0.1.0-alpha11` product version.
- Memory: `0.23.0-ensure-ile.1`; retain the two local profile tools. Diary tools raise the default memory surface to 16 tools and the teaching-session surface to 32. Cloud synchronization stays disabled by default.
- Skin: `0.21.0-ensure-ile.1`; preserve the three built-in brand images, both welcome slogans, wordmark proportions, internal routes, DOM attributes and existing student-replaceable brand directory.

Teaching modes, question records, review scheduling, handoffs, isolated data roots and the restricted student UI remain in place. Additional official packages satisfy runtime closure; installing them does not enable their preset rows. No installed student profile was deleted, reseeded or used for testing.

## Compatibility decisions

Cordis 4.1 uses the public profile `.cordis/resolve.mjs` loader boundary and passes a fiber to `internal/config`. Update the desktop resolver and settings bridge to those contracts. Initialize session projections asynchronously, keep their registration handle and read turn boundaries from the agent service.

Harness routes now include `{ resource }` handlers. Preserve capability checks for HTTP requests while forwarding admitted in-process peer reads using the native resource protocol. Account watch events contain `{ type, state }`; read login attempts from `state.attempt`. Regression tests cover the changed behavior.

Move official bundle constants to `dsh-official-bundles`, explicitly provide required runtime peers and keep first-party closure validation. Update the isolated flat-CLI fixture to include the newly imported constants package. Retain the desktop CLI-management exception in the real hashed CLI implementation, beyond its new carrier shim.

Retire the settings icon patch in favor of the native icon slot. Retire the obsolete pi-ai patch after verifying the incremental argument stream and final parse behavior. Keep 34 patches: 33 effective and the existing explicitly allowed inactive computer-use driver patch. Add BlueOak license handling after inspecting the actual dependency license; regenerate third-party notices.

Memory prompt-assembly tests mount the real native executor required by the new default composition. The production base bundle already supplies it. Fix the image test fixture to give events immutable creation timestamps, preserving the real future-event guard and image round-trip assertions.

The real packaged cold-start check found another gap: the packaged profile still declared three built-in compaction packages as registry dependencies. With no cached metadata, the initial offline pnpm invocation failed with `ERR_PNPM_NO_OFFLINE_META`, leaving the profile without its skin and entering recovery. The packaging script now validates those exact versions against the desktop runtime and delegates their imports to the existing runtime overlay. Only the eleven vendored local packages remain installation dependencies; the development template keeps its declarations. A regression test installs the generated profile into an empty pnpm store and composes it. The rebuilt, unmodified packaged executable subsequently completed a fresh offline first boot, seeded its brand files and served the first teaching turn with all 32 tools against a local fake model endpoint in 21.71 seconds. The check confirmed `app.isPackaged`, alpha11 and the isolated user-data path; the rendered brand, conversation and composer were inspected. Its harness explicitly waits for the first-run setup surface before skipping it, so a late overlay cannot swallow the send action. Development UI fixtures preinstalled junctions and could not cover this cold-start path.

## Verification

Build and validation ran serially on this machine: concurrent compiler/runtime preparation exhausted Windows native commit even at a small JavaScript heap. This is a local scheduling constraint; the repository's normal parallel gate implementation is unchanged.

Verified before packaging:

- All desktop host, client and native UI builds; declaration generation and the five TypeScript configurations.
- Desktop unit suite: 143 files, 1,785 passed, 29 skipped, 1,814 total cases, including the empty-store offline profile installation regression.
- Plugin suite: 499 passed; all plugin type checks; nine committed libraries rebuild byte-for-byte.
- All desktop closure, CLI, loader, profile, license and operation gates. Runtime closure has 351 first-party nodes; notices cover 624 production packages.
- Electron UI: five specs, all 23 cases passed against the fake DeepSeek endpoint and temporary data roots, including restart recovery, mode folding, workspace-preserving handoff and exact retry behavior.
- Immutable dependency installation, repository gate and community document gate passed again after the final dependency changes.
- The unmodified packaged executable passed a fresh-data-root offline first boot and first teaching turn with 32 tools; runtime, seeded assets and rendered conversation were checked.

Intermittent full-suite Host RPC `stop` timeouts did not recur in three consecutive focused integration runs or the subsequent full suite. Timeout messages now identify the method. No shutdown semantics fix is claimed. Temporary generated-output instrumentation was removed by rebuilding from source before final packaging. Early concurrent UI/runtime preparation also failed under native-memory pressure; the isolated runtime preparation and complete serial UI run subsequently passed without weakening behavior assertions or increasing waits.

## Delivery boundary

The final clean source build, full desktop unit suite and normal-compression unsigned Windows packaging job passed in 681.15 seconds. The runtime inventory hook and installer verifier passed. The installer is `dsh-plugin-desktop/dist/ensure-ILE-0.1.0-alpha11-x64-Setup.exe`, 181,476,170 bytes (173.07 MiB), SHA-256 `a9ae009dedd036533bbfbc3999c4ff8afcfefbabcaad679209e057802823a251`. Native and WASM Office engines remain excluded under the existing product policy.

Installer execution over the student's real installation and real-key/model pedagogical validation remain separate acceptance steps.
