/**
 * Pure types of the ile domain: the mode definition, the switch event, and the
 * ONE home of the `ile` projection-key declaration. No host-side value imports,
 * so a client carrier can read the same wire shape without pulling cordis in.
 *
 * @module dsh-plugin-coreset/types
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

/** Name of the one `complete` prompt section ensure-ILE owns. */
export const ILE_SECTION = 'ile'

/** The mode every session can fall back to; always registered by the core. */
export const CHAT_MODE = 'chat'

/**
 * One mode a session can be in. A mode is persona text plus its default
 * preset: the tool catalog is identical in every mode, so switching never
 * rewrites the request header beyond the system prompt itself.
 */
export interface IleModeDefinition {
  /** Stable id `context_switch` accepts. */
  readonly id: string
  /** Chinese display name, shown to the student and used in handoff notices. */
  readonly name: string
  /** The persona text this mode contributes to the system prompt. */
  readonly text: string
  /**
   * Whether `context_switch` may target this mode. False for a mode that only
   * exists as its own preset's starting point (开学), whose tools are not
   * mounted inside the other presets.
   */
  readonly switchable: boolean
}

/** What a committed switch leaves in the log. */
export interface IleModeEvent {
  readonly mode: string
  readonly summary: string | null
}

/** Host fold state of the `ile` projection. */
export interface IleUnitState {
  readonly mode: string
  readonly summary: string | null
  /** Durable intent, applied at the next turn boundary and cleared by plugin:ile/mode. */
  readonly pending: IleModeEvent | null
}

/** Wire value of the `ile` projection. */
export interface IleProjection {
  readonly mode: string
  readonly summary: string | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Legacy in-memory events are still understood by the projection. */
    'ile/mode': IleModeEvent
  }
  interface PluginRecordMap {
    /** Ignorable, replayable mode state; never enters the conversation surface. */
    'plugin:ile/mode': IleModeEvent
    /** Logged before context_switch acknowledges the request. */
    'plugin:ile/switch-requested': IleModeEvent
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Host fold state of the ile mode. */
    ile: IleUnitState
  }
  interface SessionProjectionMap {
    /** The mode a session is in, folded from `ile/mode` events. */
    ile: IleProjection
  }
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** The notice that stands in for the history a switch folded away. */
    'ile-handoff': { kind: 'ile-handoff' } & ContextFormed
  }
}
