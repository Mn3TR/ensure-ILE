/**
 * Shared teaching text for every ensure-ILE mode.
 *
 * Each mode replaces the whole system prompt (a `complete` section), so the
 * parts every mode keeps — how to talk, safety, bank usage — live here once and
 * get composed at mount time. Subject notes are read by the `read_note` tool.
 * @module dsh-plugin-teaching-commons
 */
/** The shared prompt fragments a mode may compose. */
export declare const SHARED_PARTS: readonly ["common", "bank"];
export type SharedPart = (typeof SHARED_PARTS)[number];
/**
 * Read one shared prompt fragment.
 * @param part - fragment name.
 * @returns the fragment text, without a trailing newline.
 */
export declare function sharedPrompt(part: SharedPart): string;
/**
 * Compose the shared fragments and a mode's own prompt into one section body.
 * @param parts - shared fragments, in order.
 * @param own - the mode's own prompt text.
 * @returns the joined text with a single trailing newline.
 */
export declare function composePrompt(parts: readonly SharedPart[], own: string): string;
/** Subject notes shipped with this package. */
export declare function availableNotes(): string[];
/**
 * Read one subject note, or explain which names exist.
 * @param note - subject key supplied by the model.
 * @returns the note body, or a model-facing error sentence.
 */
export declare function readNote(note: string): string;
