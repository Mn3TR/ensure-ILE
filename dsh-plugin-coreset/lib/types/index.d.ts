/**
 * ensure-ILE core: one `complete` prompt section, one mode registry, one
 * in-session switch.
 *
 * The four persona packages (guide / work / hrl / setup) stopped owning a
 * section, a tool and the cwd shadow of their own: exactly one `complete`
 * section may be active in a scope, so a session that mounts three personas
 * would throw. The core owns the section and reads the persona text of the mode
 * in force; the personas only `registerMode()` their text.
 *
 * A switch is the student's, not the model's alone: `context_switch` only
 * records an intent, and the next turn boundary folds everything the switch
 * replaces into one handoff notice. Tools never change — the catalog is the
 * same in every mode — so a switch costs the system prompt and nothing else.
 *
 * @module dsh-plugin-coreset
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { z as zod } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { IleModeDefinition, IleUnitState } from './types.ts';
export { CHAT_MODE, ILE_SECTION } from './types.ts';
export type { IleModeDefinition, IleModeEvent, IleProjection, IleUnitState } from './types.ts';
/** Tool name the model calls to ask for a mode change. */
export declare const CONTEXT_SWITCH = "context_switch";
/** Deployment-owned configuration of the core. */
export interface CoreSetConfig {
    /** Mode a session starts in before any `ile/mode` event. */
    mode?: string;
}
/** Projection of the logged mode and its handoff summary. */
export declare const ileProjectionDefinition: {
    key: "ile";
    stateVersion: number;
    stateSchema: zod.ZodObject<{
        mode: zod.ZodString;
        summary: zod.ZodNullable<zod.ZodString>;
    }, zod.core.$strict>;
    init: () => IleUnitState;
    apply: (state: NoInfer<IleUnitState>, event: import("@deepseek-ai/dsh-session").SessionEvent) => IleUnitState;
    wire: {
        viewSchema: zod.ZodObject<{
            mode: zod.ZodString;
            summary: zod.ZodNullable<zod.ZodString>;
        }, zod.core.$strict>;
        view: (state: NoInfer<IleUnitState>) => {
            mode: string;
            summary: string | null;
        };
    };
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The mode registry every persona plugin contributes to. */
        ileModes: IleModes;
    }
}
/**
 * `ctx.ileModes`: owns the persona section, the shared tools, the mode registry
 * and the fold-with-handoff switch. One instance per preset scope; the
 * projection key is shared, so several presets may mount it at once.
 */
export declare class IleModes extends Service {
    static inject: string[];
    static Config: z<CoreSetConfig>;
    /** Mode a session starts in. */
    private readonly defaultMode;
    /** Modes this preset can be in, by id. Per instance: a preset owns its persona set. */
    private readonly modes;
    /** Switches waiting for the next turn boundary, per session. */
    private readonly pendingIntents;
    constructor(ctx: Context, config?: CoreSetConfig);
    /**
     * Contribute a mode to this preset.
     * @param definition - id, display name, persona text and whether the switch may target it.
     * @returns disposer that removes the mode again.
     */
    registerMode(definition: IleModeDefinition): () => void;
    /** The mode this preset starts in. */
    get startMode(): string;
    /** Modes `context_switch` accepts, in registration order. */
    switchableModes(): IleModeDefinition[];
    /** The mode in force for a session (logged state, else this preset's start mode). */
    loggedMode(session: Session): string;
    /**
     * The mode whose text this step's system prompt carries. A pending switch is
     * already in force for the assembly of the turn it belongs to, which starts
     * before the fold happens; mid-turn steps keep the logged mode.
     */
    effectiveMode(session: Session): string;
    /** Whether this step is the first of its turn, i.e. history has not grown yet. */
    private isTurnStart;
    /** The complete section: the persona in force plus the switch footer. */
    private renderSection;
    /** Display name of a mode id, falling back to the id itself. */
    private modeName;
    /**
     * Fold the switched-away conversation into one notice and record the mode.
     * The system head is left alone: the runtime replaces it with the new mode's
     * text as soon as the surface generation changes.
     */
    private commit;
}
export default IleModes;
