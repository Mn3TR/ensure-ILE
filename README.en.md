# ensure-ILE — DeepSeek Harness Desktop in Learning

> One student. One problem in front of them. Let **them** solve it.
> No answers.

Forked from [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop). Base untouched: `deepseek-harness/` is a pinned submodule, never edited; window, plugin system and packaging come from upstream. Everything we add lives in `dsh-plugin-*` packages mounted at the profile root — the shell does not know they exist.

**EnSure Lab / 因需** — "cause and need": every step says why.

---

## What it does

Student sends a problem. Model does not grade, score or answer. It gives attention:

- "Something in this expression repeats itself."
- "These terms look alike — see it?"
- "Why did the author put this paragraph here?"

Student decides the next move. It may not be the move the model expected — that is the point.

## Three presets, five modes

Preset picks the team. Mode picks the stance. New preset = new session; new mode = new persona inside the session, tool set unchanged.

| Preset | Mounts | Job |
| --- | --- | --- |
| **Work** `work` | core + guide/work/hrl personas + bank / textbook / schedule / memory | Starts in guide. Solves alone → `work`; has an answer to polish → `hrl` |
| **Chat** `chat` | core + chat persona | Ask anything, no problem involved |
| **Setup** `setup` | core + setup persona + `setup_*` tools | First meeting: grade, timetable, rhythm, preferences. Unregisters once done |

Modes: `guide` (lead them to it), `work` (solve alone, we judge), `hrl` (teacher trajectory, step-by-step A/B), `chat`, `setup` (not switchable).

Shared teaching text (safety, voice, bank rules, subject notes) exists once: [dsh-plugin-teaching-commons](dsh-plugin-teaching-commons/). The session core: [dsh-plugin-coreset](dsh-plugin-coreset/).

## One data root

`.ensure-ile/` in a checkout, `<install dir>\.ensure-ile\` for an installed build:

- `home/bank/problems/<id>.json` — the problem bank, one file per problem, schema v2.1 split by `guide / work / hrl`, with handoff packets and a review ladder
- `home/storages/` — memory and the student profile
- `deepseek-harness/default-workspace/` — session workspace, textbooks live here too
- `home/profiles/desktop/` — profile definition and the offline-installed plugins

Overwrite install keeps data; manual uninstall removes it.

## Run it

Node `^22.19.0` or `>=24`, Yarn 4.18 through Corepack.

```bash
corepack yarn install --immutable
corepack yarn build                                # build the shell, mirror the profile template in
corepack yarn workspace dsh-plugin-desktop start   # development run
corepack yarn dist:win                             # build the Windows installer
```

Gates:

```bash
corepack yarn test                                  # unit tests
corepack yarn typecheck                             # types
corepack yarn check                                 # full gate (no plugin unit tests)
corepack yarn check:plugins                         # the nine plugin packages
corepack yarn workspace dsh-plugin-desktop test:ui   # end-to-end UI, 18 cases, ~2 min
```

Stale bilingual hashes heal themselves: `yarn docs:record`.

## CI

Windows only; other platforms are out of scope.

- `.github/workflows/ci.yml` — `changes` (doc gate + change classification), `check` (full gate), `desktop-windows` (package gate, installer, portable), `upstream-command-windows`
- `.github/workflows/release-windows.yml` — on a `v*` tag: verify the tag matches `package.json`, run the package gate, produce `Setup.exe` + `.sha256`, publish a release (versions with `-` are marked prerelease); manual runs produce the artifact only

## Where it stands (2026-10-31, `0.1.0-alpha1`)

- ✅ Guide mode ran one real problem end to end: prompt composition, bank writes, reply length and banned words all correct
- ✅ Three presets + in-session persona switch, bank schema v2.1, memory `profile_*`, review ladder, profile fields
- ✅ Windows installer builds and installs; 18 end-to-end UI cases green; skin is claude-style with the en∫ure brand
- 🔄 `work` / `hrl` / `setup` have not met a real student
- ⬜ Compaction engine (long sessions hit the window and fail hard), permission approval UI, native windows never checked after the token swap, handoff card, image pipeline, independent evaluator

Reasoning and pitfalls: [AGENTS.md](AGENTS.md) — **code is the first source of truth**, documents only index it.

## Deliberately not doing

Accounts / multi-tenancy, 4–24 week learning paths, a capability course workbench, A/B voting UI, the model switching its own mode, changing prompts inside one session, trimming the tool set per mode. Reasons in [AGENTS.md](AGENTS.md#deliberately-not-doing).

## Docs

- [AGENTS.md](AGENTS.md) — engineering rules, status, pitfalls (first source)
- [docs/README.en.md](docs/README.en.md) — product and developer documentation index
- Each plugin package's `README.md` — that package's own documentation

## Boundaries and license

An independent community project. Not affiliated with, endorsed by, or licensed by DeepSeek or the DSH Desktop upstream; upstream contributors shown come from inherited fork history. MIT, see [LICENSE](LICENSE).
