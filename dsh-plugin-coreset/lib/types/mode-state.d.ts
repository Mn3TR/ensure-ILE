import { z } from 'zod';
import type { IleUnitState } from './types.ts';
/** Both completed switches and acknowledged pending intents replay from the log. */
export declare const ileProjectionDefinition: {
    key: "ile";
    stateVersion: number;
    stateSchema: z.ZodObject<{
        mode: z.ZodString;
        summary: z.ZodNullable<z.ZodString>;
        pending: z.ZodNullable<z.ZodObject<{
            mode: z.ZodString;
            summary: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    init: () => IleUnitState;
    apply: (state: NoInfer<IleUnitState>, event: import("@deepseek-ai/dsh-session").SessionEvent) => IleUnitState;
    wire: {
        viewSchema: z.ZodObject<{
            mode: z.ZodString;
            summary: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        view: (state: NoInfer<IleUnitState>) => {
            mode: string;
            summary: string | null;
        };
    };
};
