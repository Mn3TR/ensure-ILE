/**
 * ensure-ILE's own brand lockup on top of `dsh-claude-style`.
 *
 * The skin draws the sidebar brand as two pieces: an 18px square mark, then the
 * wordmark. Our wordmark already carries the `∫` the mark would repeat, so the
 * sidebar keeps the wordmark alone and the mark is drawn only where it earns its
 * place — beside the new-session slogan.
 *
 * Installed as a `<style>` element rather than imported as CSS: every stylesheet
 * in this bundle is wrapped in `@scope (:root:has(.dshDesktopOnboardingContent))`
 * by `vite.client.config.ts`, which is right for onboarding chrome and wrong for
 * a rule aimed at the sidebar. Onboarding also *is* what the mark is for, but the
 * scope root only exists while the wizard is open, so it cannot carry this rule.
 *
 * Only `brand-mark` — not `rail-mark`. The collapsed rail has room for the mark
 * alone, so hiding it there would leave an empty button.
 */

const STYLE_ID = 'dsh-desktop-brand-styles'

const CSS = `
body[data-dsh-claude-style] [data-slot="sidebar"] [data-dsh-claude-part~="brand-mark"] {
  display: none !important;
}
`

/** Install the brand shelving sheet once; tolerate headless Client boot. */
export function installBrandStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/brand'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
