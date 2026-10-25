# ensure-ILE — DeepSeek Harness Desktop in Learning

> Take one student and the one problem in front of them, and let **them** solve it.
> Not by handing over the answer.

A learning build forked from [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop). The base stays untouched: `deepseek-harness/` is a pinned, unmodified submodule, and the window, plugin system and packaging pipeline come from upstream. Everything we add lives in this repository's own `dsh-plugin-*` packages; the shell does not know they exist.

**EnSure Lab / 因需** — the name reads "cause and need": every step has to say why.

---

## What it is

One mode is one agent preset. A student sends in a problem; the model does not grade, score or answer. It offers **attention**:

- "Something in this expression repeats itself."
- "Notice how these terms look alike?"
- "Why did the author put this paragraph here?"

The student decides what to do next. It may differ from what the model expected — that is the point.

Four modes, each its own package and preset:

| Preset | Package | Job |
| --- | --- | --- |
| **Guide** `guide` (default) | [dsh-plugin-guide](dsh-plugin-guide/) | The student has not solved it yet; lead them to solve it themselves. No grading. |
| **Setup** `setup` | [dsh-plugin-setup](dsh-plugin-setup/) | First meeting: grade, timetable, rhythm, solving preferences. Done once it can name the next step. |
| **Work** `work` | [dsh-plugin-work](dsh-plugin-work/) | The student solves alone and hands in; we judge. One resubmission, then back to Guide. |
| **Refine** `hrl` | [dsh-plugin-hrl](dsh-plugin-hrl/) | They already have an answer: teacher trajectory plus step-by-step A/B, they choose. |

Shared teaching text (safety boundaries, voice, problem-bank rules, subject notes) exists once, in [dsh-plugin-teaching-commons](dsh-plugin-teaching-commons/).

## One data root

`.ensure-ile/` in a checkout, `<install dir>\.ensure-ile\` for an installed build:

- `home/bank/problems/<id>.json` — the problem bank, one file per problem, schema v2.1 split by `guide / work / hrl`, with handoff packets and a review ladder
- `home/storages/` — memory and the student profile
- `deepseek-harness/default-workspace/` — the session workspace (textbooks live here too)
- `home/profiles/desktop/` — profile definition and the offline-installed plugins

Overwrite installs keep the data; a manual uninstall removes it.

## Run it

Node `^22.19.0` or `>=24`, Yarn 4.18 through Corepack.

```bash
corepack yarn install --immutable
corepack yarn build                 # build the shell and mirror the profile template into it
corepack yarn workspace dsh-plugin-desktop start   # development run
corepack yarn dist:win              # build the Windows installer
```

Tests and type checking:

```bash
corepack yarn test
corepack yarn typecheck
```

CI is Windows only: `changes` (documentation gate and change classification), `check` (full unit tests), `desktop-windows` (package gate, installer, portable), `upstream-command-windows`. Stale bilingual hashes heal themselves with `yarn docs:record`.

## Where it stands (2026-10-25)

- ✅ Guide mode ran one real problem end to end: prompt composition, bank writes, reply length and banned words all correct
- ✅ Four presets, bank schema v2.1, memory `profile_*`, review ladder and profile fields implemented
- ✅ Windows installer builds and installs; first launch installs the seven plugin packages offline; overwrite installs keep data
- 🔄 Work, Refine and Setup have not been exercised with a real student yet
- ⬜ Handoff card, resume UI, independent evaluator, image pipeline

The reasoning and the pitfalls live in [AGENTS.md](AGENTS.md) — **code is the first source of truth**, documents only index it.

## Deliberately not doing

Accounts and multi-tenancy, 4–24 week learning paths, a capability course workbench, A/B voting UI, the model switching its own mode, changing prompts inside one session. Reasons are in [AGENTS.md](AGENTS.md#明确不做2026-10-25-定).

## Docs

- [AGENTS.md](AGENTS.md) — engineering rules, status, pitfalls (first source)
- [docs/README.en.md](docs/README.en.md) — product and developer documentation index
- Each plugin's `README.md` — documentation for that mode

## Boundaries and license

An independent community project. It is not affiliated with, endorsed by, or licensed by DeepSeek or the DSH Desktop upstream; upstream contributors shown come from inherited fork history. MIT, see [LICENSE](LICENSE).
