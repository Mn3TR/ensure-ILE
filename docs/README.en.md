# ensure-ILE Documentation

[中文文档](README.md)

This directory is the product and developer documentation index for ensure-ILE. The root [`README.en.md`](../README.en.md) is the short product entry point; these pages explain why the project exists, how to use it, how to build plugins for it, and what this fork adds. Want to contribute? See [Contributing](../CONTRIBUTING.en.md).

## Read by goal

Ordinary users can start with the [user guide](user-guide.en.md) and never need the developer documentation.

### User documentation

| Document | Covers |
| --- | --- |
| [User guide](user-guide.en.md) | Installation, profiles, modes, terminal, plugins, and updates |
| [FAQ](faq.en.md) | Direct answers about platforms, bundled runtime, project status, data, plugins, and updates |
| [Privacy Policy](../PRIVACY.en.md) | Official updates, downloads, local data, third-party services, and user choices |
| [Why Desktop](why-desktop.en.md) | The boundary with upstream Harness and the case for plugins |

### What ensure-ILE adds

Upstream DSH Desktop documentation has none of this: four modes, a shared data root, and nine local `dsh-plugin-*` packages besides the desktop shell. Each package's own `README.md` is that component's manual — this page only indexes them and does not copy their content.

**A mode is a preset.** [`profiles/ensure-ile/package.json`](../profiles/ensure-ile/package.json) decides which bundles are mounted, and [`profiles/ensure-ile/cordis.patch.yml`](../profiles/ensure-ile/cordis.patch.yml) makes `guide` the default preset:

| Preset id | Display name | Package |
| --- | --- | --- |
| `setup` | 开学 (setup) | [dsh-plugin-setup](../dsh-plugin-setup/README.md) |
| `guide` (default) | 引导模式 (guided) | [dsh-plugin-guide](../dsh-plugin-guide/README.md) |
| `work` | 独立做题 (independent) | [dsh-plugin-work](../dsh-plugin-work/README.md) |
| `hrl` | 答案优化 (answer refinement) | [dsh-plugin-hrl](../dsh-plugin-hrl/README.md) |

All four presets use `complete: true`, which replaces the whole system prompt, so the shared prose (safety boundaries, voice, bank rules, subject notes) lives once in [dsh-plugin-teaching-commons](../dsh-plugin-teaching-commons/README.md) and is concatenated when each preset mounts.

**Shared data.** The data root is `.ensure-ile/` in development and `<install dir>\.ensure-ile\` for installed builds; `DSH_HOME` is the `home/` directory inside it.

| Data | Location | Who reads and writes it |
| --- | --- | --- |
| Problem bank | `<DSH_HOME>/bank/problems/<id>.json` | [dsh-plugin-bankmanager](../dsh-plugin-bankmanager/README.md): one JSON file per problem, schema v2.1 split into `guide` / `work` / `hrl` blocks, with handoff packages and a review ladder |
| Learner profile | `<DSH_HOME>/profile/*.md` | [dsh-plugin-memory](../dsh-plugin-memory/README.md): `profile_read` / `profile_write`, fixed file names, never retrieved and never injected |
| Onboarding progress | `<DSH_HOME>/setup.json` | [dsh-plugin-setup](../dsh-plugin-setup/README.md): field-granular and resumable |
| Timetable and pace | `<DSH_HOME>/schedule/schedule.json` | [dsh-plugin-schedule](../dsh-plugin-schedule/README.md): timetable, pace, review queue, and preparation anchors |
| Textbook corpus | `dsh-plugin-textbook/data/` | [dsh-plugin-textbook](../dsh-plugin-textbook/README.md): extracted text from the required-course PDFs with zero runtime dependencies; the PDFs themselves stay in the workspace `教材/` folder |

### Research

| Document | Covers |
| --- | --- |
| [Open-source AI study-companion survey, 2026-10-25](research/2026-10-25-开源AI学习伴侣调研.md) | A comparison of 13 open-source projects, with verification records and self-corrections; entries marked `⚠️ 仅描述` are designs that are not shipped yet |
| [Rewriting or clearing context inside one session, 2026-10-29](research/2026-10-29-单会话上下文重写.md) | Four candidate paths with costs and a recommendation, plus mechanism notes: how history is assembled, who may rewrite it, and why the system prompt cannot be cleared |

### Developer and maintainer documentation

| Document | Covers |
| --- | --- |
| [Plugin ecosystem manifesto](plugin-ecosystem.en.md) | The vision of an open, composable, sustainable plugin ecosystem and its three principles |
| [Plugin development](plugin-development.en.md) | Ordinary DSH plugins, Desktop services, compatibility, and lifecycle |
| [Community Fabric Draft](../dsh-community-fabric/README.md) | Community interoperability drafts spanning manifest/capability foundations, Runtime/Presentation, service composition, and provenance diagnostics |
| [Fabric community-feedback disposition](../dsh-community-fabric/docs/research/community-issue-23-review.md) | Which Issue #23 proposals were adopted, split into focused RFCs, deferred, or kept out of portable core |
| [Fabric framework and plugin-needs research](../dsh-community-fabric/docs/research/mature-plugin-frameworks.md) | Mature Koishi, Chrome, and VS Code patterns plus requirements observed in real DSH plugins |
| [VS Code extension-model research](../dsh-community-fabric/docs/research/vscode-extension-model.md) | Implemented declaration, Provider, UI, placement, and lifecycle patterns, with concrete constraints for the Fabric RFC |
| [Architecture](architecture.en.md) | Electron, Host, the Web carrier, profiles, and packaging |
| [Upstream sync guide](upstream-sync.en.md) | The four identities (submodule, npm packages, forked shell, profile), the 29-patch inventory, four sync procedures, and a failure-signal table |
| [Desktop service reference](../dsh-plugin-desktop/docs/plugin-services.md) | Stable `desktopProfiles` and `desktopPnpm` contracts with TypeScript examples |
| [Package reference](../dsh-plugin-desktop/README.md) | Detailed build, runtime, release, and limitation notes |

## How the README files are organized

The outer repository has two formal product READMEs plus one legacy compatibility entry:

- [`README.md`](../README.md): the Chinese product entry point.
- [`README.en.md`](../README.en.md): the English product entry point with the same product scope.
- [`README.zh.md`](../README.zh.md): a legacy Chinese-path compatibility page with a few redirect lines and no independent content.

`README.i18n.yaml` records the bilingual blob hashes for those two formal entry points; it is not a user guide. The privacy policy follows the same naming convention: [`PRIVACY.md`](../PRIVACY.md) is the Chinese text, [`PRIVACY.en.md`](../PRIVACY.en.md) is the English text, and `PRIVACY.i18n.yaml` records their hashes.

`dsh-plugin-desktop/README.md` and `dsh-plugin-desktop/README.zh.md` ship with the npm package and are the more technical package reference. `dsh-plugin-desktop/docs/` contains stable API contracts rather than marketing copy. `docs/design/` holds the paper-skin design specimen, its screenshots (`screenshots/`), and the font subsets; `docs/evidence/` holds installer and upgrade evidence. `.agents/notes/implemented/` contains dated maintainer decision records and does not replace user documentation.

`deepseek-harness/` is the pinned upstream submodule. Its README and `docs/` belong to the upstream project, not to the Desktop product, and are excluded from the outer documentation inventory.

## Status convention

These pages distinguish shipped behavior, platform limits, and roadmap items.

The shell still offers three presentation modes: compatibility mode keeps the upstream default Web client below an independent Desktop frame; the extended window installs its own Desktop layout/sidebar registration and hosts official occupants in an inverted L; enhanced mode retains a separate root registration with compact internal captions. Desktop frames provide capability-gated native materials. ensure-ILE's own profile selects **enhanced mode** (`desktop-shell` with `mode: advanced` in [`cordis.patch.yml`](../profiles/ensure-ile/cordis.patch.yml)).

**No plugin market.** `dshmarket` is neither a dependency nor present in `yarn.lock`, `.yarn/patches/` carries no patch for it, and no `market:*` script exists; the market toggle in settings has no provider left to mount. Plugins are added only through explicit commands such as `dsh plugin`, which forwards its arguments to pnpm inside the profile.

The upstream Beta / Next variant packages, the community market (`dsh-community-market/`), and `vendor/agents-anywhere/` have all been removed; packaging ships only the Node + pnpm payload, with no Python interpreter and no Office skills. Two items remain on the roadmap: the image path (photo in, problem out) and a separate Evaluator. Neither is implemented, and these pages will not present them as shipped.

`docs/research/` holds research documents with dated file names; a `⚠️ 仅描述` marker inside them means the design is not shipped yet.
