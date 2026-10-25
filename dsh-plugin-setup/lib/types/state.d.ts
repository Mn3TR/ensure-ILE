/**
 * Progress record for the first-run conversation.
 *
 * Kept apart from the plugin row so it carries no Cordis or tool dependency:
 * the store is testable on its own and the row is only wiring.
 * @module dsh-plugin-setup/state
 */
/** Whether the onboarding conversation has finished. */
export declare const ONBOARDING_STATES: readonly ["pending", "done"];
export type OnboardingState = (typeof ONBOARDING_STATES)[number];
/** The four facts the conversation collects; every field is optional until said. */
export interface SetupFacts {
    grade?: string;
    schedule?: string;
    rhythm?: string;
    preference?: string;
}
/** The whole progress record. */
export interface SetupState {
    schema: 1;
    onboarding: OnboardingState;
    got: SetupFacts;
    /** What happens next; the conversation is not finished without it. */
    next?: string;
    updatedAt?: string;
}
/** One write into the progress record; absent keys are left alone. */
export interface SetupPatch extends SetupFacts {
    onboarding?: string;
    next?: string;
}
/**
 * Resolve the default progress file under the Harness home.
 * @returns the absolute path.
 */
export declare function defaultStateFile(): string;
/**
 * Read the progress record, or an empty pending one.
 * @param file - absolute path.
 * @returns the record; a corrupt file starts over rather than blocking onboarding.
 */
export declare function readState(file: string): SetupState;
/**
 * Apply one patch and persist it atomically.
 * @param file - absolute path.
 * @param patch - the fields to write.
 * @param now - clock injection for tests.
 * @returns the merged record.
 */
export declare function updateState(file: string, patch: SetupPatch, now?: Date): SetupState;
