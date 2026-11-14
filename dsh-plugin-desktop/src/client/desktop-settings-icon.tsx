/** Desktop navigation glyph through the native Harness 0.2.2 settings slot. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** The settings shell owns the navigation button and icon wrapper. */
function IconDesktopSettings({ size }: PropsRuntime<'settings.section.icon'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 14h6M8 11.5V14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

/** Register the display glyph for the matching Desktop settings section. */
export function registerDesktopSettingsIcon(ctx: Context, id: string): void {
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id }, IconDesktopSettings))
}
