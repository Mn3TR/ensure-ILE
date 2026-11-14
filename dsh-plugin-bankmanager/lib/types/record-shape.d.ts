/** Runtime shape checks shared by record reads and the final pre-write validation. */
type Rule = (value: unknown, path: string) => void;
/** Domain enums are supplied by store.ts, keeping their single source of truth. */
export declare function recordShape(enums: {
    statuses: readonly string[];
    outcomes: readonly string[];
    affects: readonly string[];
    hints: readonly string[];
    matches: readonly string[];
    choices: readonly string[];
    preferences: readonly string[];
    mediaTypes: readonly string[];
}): Rule;
export {};
