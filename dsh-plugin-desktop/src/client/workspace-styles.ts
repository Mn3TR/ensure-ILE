/**
 * One workspace, so nothing to choose.
 *
 * The upstream client assumes a user with several projects: the composer carries
 * a workspace chip, the sidebar row offers rename/remove, and the section header
 * offers "add workspace". A learner has exactly one fixed workspace — the three
 * affordances only lead to dialogs that cannot help them.
 *
 * What stays: the sidebar group header itself. It is how sessions are grouped, so
 * removing it would orphan the list rather than simplify it.
 *
 * Installed as a `<style>` element, not imported CSS: every stylesheet in this
 * bundle is wrapped in `@scope (:root:has(.dshDesktopOnboardingContent))` by
 * `vite.client.config.ts`, so an imported rule would apply only while the
 * onboarding wizard is open.
 */

const STYLE_ID = 'dsh-desktop-workspace-styles'

const CSS = `
body[data-dsh-claude-style] :is(button, div):has(> [data-dsh-claude-part~="workspace-chip-label"]) {
  display: none !important;
}

body[data-dsh-claude-style] button[aria-label*="添加工作区"] {
  display: none !important;
}

body[data-dsh-claude-style] [data-dsh-claude-part~="project-row"] [data-dsh-claude-part~="row-actions"] {
  display: none !important;
}
`

/** Install the single-workspace sheet once; tolerate headless Client boot. */
export function installWorkspaceStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/workspace'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
