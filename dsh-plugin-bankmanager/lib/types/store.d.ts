/**
 * Problem-bank storage: one directory per problem under `<DSH_HOME>/bank/problems`.
 *
 * `<id>/problem.json` holds everything that ever happened to one problem — the
 * statement, the guide sessions, attempts, the review schedule and an append-only
 * history; `<id>/images/` holds the pictures that came with it, copied out of the
 * inbound attachment pipeline so a problem travels as one folder. Files are
 * written atomically and read defensively: one broken folder is skipped and
 * reported, never a reason to fail a listing.
 * @module dsh-plugin-bankmanager/store
 */
/** Statuses a problem can carry. */
export declare const PROBLEM_STATUSES: readonly ["new", "guide", "hrl", "review", "mastered", "parked"];
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];
/** Record file inside one problem folder. */
export declare const PROBLEM_FILE = "problem.json";
/** Derived table of contents beside the problem folders. */
export declare const BANK_INDEX_FILE = "index.json";
/** Image folder inside one problem folder. */
export declare const IMAGES_DIR = "images";
/** Source formats accepted for problem pictures, matching the inbound pipeline. */
export declare const PROBLEM_IMAGE_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
export type ProblemImageMediaType = (typeof PROBLEM_IMAGE_MEDIA_TYPES)[number];
/** One picture copied into a problem folder. */
export interface ProblemAttachment {
    /** Path relative to the problem folder, `images/<sha256>.<ext>`. */
    file: string;
    /** Digest of the stored bytes; the file name without its extension. */
    sha256: string;
    mediaType: ProblemImageMediaType;
    bytes: number;
    width?: number;
    height?: number;
    addedAt: string;
}
/** How one guide session ended. */
export declare const GUIDE_OUTCOMES: readonly ["solved", "stuck", "abandoned"];
export type GuideOutcome = (typeof GUIDE_OUTCOMES)[number];
/** One guided session over a problem. */
export interface GuideSession {
    sessionId?: string;
    startedAt: string;
    endedAt?: string;
    outcome?: GuideOutcome;
    whereStuck?: string;
    /** What the learner wrote at the end of the session, verbatim. */
    result?: string;
    /** How the learner came across this session; the cheapest learner signal we keep. */
    affect?: Affect;
    /** Which rung of the hint ladder actually moved him. */
    effectiveHint?: HintLevel;
}
/** How the learner seemed during one session. */
export declare const AFFECTS: readonly ["frustrated", "neutral", "excited"];
export type Affect = (typeof AFFECTS)[number];
/**
 * The five rungs of guide.md's hint ladder, lightest first. Recorded per session
 * so the next guide knows what actually moved this learner.
 */
export declare const HINT_LEVELS: readonly ["confirm", "position", "feature", "structure", "result"];
export type HintLevel = (typeof HINT_LEVELS)[number];
/** Fixed review intervals in days; the scheduler walks this ladder. */
export declare const REVIEW_LADDER: readonly [1, 3, 7, 14, 30, 60, 120];
/** One handed-in answer from a session where the learner worked alone. */
export interface ProblemAttempt {
    at: string;
    answer: string;
    verdict: string;
    source: 'text';
}
/** One step of the teacher's trajectory. */
export interface TeacherStep {
    index: number;
    body: string;
    reason: string;
}
/** The teacher's own complete solution, written once per problem. */
export interface TeacherTrajectory {
    writtenAt: string;
    answer: string;
    /** Why it was written this way. Optional; fill it only when it is not obvious. */
    note?: string;
    steps: TeacherStep[];
}
/** How one teacher step lines up with the learner's own words. */
export declare const PAIRING_MATCHES: readonly ["same", "partial", "missing"];
export type PairingMatch = (typeof PAIRING_MATCHES)[number];
/** Which side the learner kept for one step. */
export declare const PAIRING_CHOICES: readonly ["student", "teacher", "merged"];
export type PairingChoice = (typeof PAIRING_CHOICES)[number];
/** One aligned step of the learner's rollout against the teacher's trajectory. */
export interface PairingStep {
    index: number;
    /** The learner's own words, verbatim. Absent when the step is missing. */
    studentQuote?: string;
    /** Index into the teacher's steps. */
    teacherStep?: number;
    match: PairingMatch;
    chosen?: PairingChoice;
    /** The learner's rewrite, present only when `chosen` is `merged`. */
    mergedText?: string;
    chosenAt?: string;
    note?: string;
}
/** One pass of step-by-step A/B over one handed-in answer. */
export interface Pairing {
    at: string;
    attemptAt?: string;
    steps: PairingStep[];
    /** The solution assembled from the choices; present once the pass closes. */
    result?: string;
}
/** The answer-optimization state, present once HRL touched this problem. */
export interface HrlState {
    input?: {
        at: string;
        from: 'work' | 'pasted';
        attemptAt?: string;
        answer: string;
    };
    teacher?: TeacherTrajectory;
    pairings: Pairing[];
}
/** What one mode leaves for the next one. At most one may be unconsumed. */
export interface Handoff {
    id: string;
    at: string;
    from: string;
    to: string;
    why: string;
    state: string;
    detail?: {
        lastWords?: string;
        blocker?: string;
        nextStep?: string;
    };
    /** Set when a session accepted it; clear it to make the package selectable again. */
    consumedAt?: string;
    consumerSessionId?: string;
}
/** Review schedule state; the scheduler that fills it comes later. */
export interface ReviewState {
    nextAt?: string;
    interval?: number;
    count: number;
    history: string[];
}
/** One history entry. */
export interface HistoryEntry {
    at: string;
    event: string;
    detail?: string;
}
/** A whole problem record. Each mode owns its own section. */
export interface ProblemRecord {
    schema: 2;
    id: string;
    subject: string;
    tags: string[];
    statement: string;
    attachments: ProblemAttachment[];
    status: ProblemStatus;
    createdAt: string;
    updatedAt: string;
    guide: {
        sessions: GuideSession[];
        insight?: string;
    };
    work: {
        attempts: ProblemAttempt[];
    };
    hrl?: HrlState;
    handoff?: Handoff;
    review: ReviewState;
    history: HistoryEntry[];
}
/** Failure with a stable code so tools can explain themselves. */
export declare class BankError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/** True when the value names a known status. */
export declare function isProblemStatus(value: string): value is ProblemStatus;
/** True when the value names a known guide outcome. */
export declare function isGuideOutcome(value: string): value is GuideOutcome;
/**
 * Turn a free-form subject into the file-name segment of an id.
 * Lowercase ASCII letters and digits survive; every other run collapses to one
 * dash. An empty result becomes `other`.
 * @param subject - the model-chosen subject, in any language.
 */
export declare function slugSubject(subject: string): string;
/** Format one local date as `YYYYMMDD`. */
export declare function formatDate(date: Date): string;
/**
 * Build a fresh problem id.
 * @param subject - free-form subject used for the readable middle segment.
 * @param now - clock injection for tests.
 * @param suffix - six hex characters; random by default.
 */
export declare function makeProblemId(subject: string, now?: Date, suffix?: string): string;
/** Default bank directory under the Harness home shared with the desktop app. */
export declare function defaultBankDirectory(home?: string | undefined): string;
/** Folder of one problem; the id is the folder name. */
export declare function problemDir(directory: string, id: string): string;
/** Path of the record inside one problem folder. */
export declare function problemPath(directory: string, id: string): string;
/** File extension for one accepted image type. */
export declare function mediaTypeExtension(mediaType: string): string;
/** Relative path one stored image keeps inside its problem folder. */
export declare function imageRelPath(sha256: string, mediaType: string): string;
/**
 * Validate one parsed file. Corrupt files are the caller's to skip; this throws
 * so the message names the exact field that broke.
 * @param raw - parsed JSON of one problem file.
 */
export declare function parseRecord(raw: unknown): ProblemRecord;
/** Read one problem, or throw a model-facing error. */
export declare function readProblem(directory: string, id: string): ProblemRecord;
/** Result of a defensive listing. */
export interface ProblemListing {
    records: ProblemRecord[];
    skipped: {
        file: string;
        reason: string;
    }[];
}
/**
 * List every readable problem. A corrupt file is skipped and named; it never
 * fails the listing.
 * @param directory - bank directory.
 */
export declare function listProblems(directory: string): ProblemListing;
/** Input accepted when a problem enters the bank. */
export interface CreateProblemInput {
    statement: string;
    subject: string;
    tags?: string[];
    /** Pictures already copied into the problem folder. */
    attachments?: ProblemAttachment[];
    now?: Date;
    suffix?: string;
}
/** Create and persist one problem. */
export declare function createProblem(directory: string, input: CreateProblemInput): Promise<ProblemRecord>;
/**
 * Copy one picture into a problem folder and describe it for the record.
 *
 * The bytes come from the inbound attachment pipeline already normalized, so
 * the digest names the stored file and a repeated save is a no-op. The caller
 * still has to put the returned entry into `record.attachments`.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param input - normalized bytes, their declared type and pixel size.
 * @returns the entry to store in the record.
 */
export declare function saveProblemImage(directory: string, id: string, input: {
    data: Uint8Array;
    mediaType: ProblemImageMediaType;
    width?: number;
    height?: number;
    now?: Date;
}): Promise<ProblemAttachment>;
/**
 * Read one picture back out of a problem folder.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param attachment - the entry from the record.
 * @returns the exact stored bytes.
 * @throws a BankError when the file is missing or no longer matches its digest.
 */
export declare function readProblemImage(directory: string, id: string, attachment: ProblemAttachment): Uint8Array;
/** One picture handed to {@link attachProblemImages}. */
export interface ProblemImageInput {
    data: Uint8Array;
    mediaType: ProblemImageMediaType;
    width?: number;
    height?: number;
}
/**
 * Copy pictures into one problem folder and record them, under the same lock an update takes.
 *
 * Entries already recorded with the same digest are left alone, so re-running with
 * the same picture adds nothing.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param images - normalized bytes in the order they arrived.
 * @returns the updated record.
 */
export declare function attachProblemImages(directory: string, id: string, images: readonly ProblemImageInput[]): Promise<ProblemRecord>;
/** What one legacy migration pass did. */
export interface LegacyMigration {
    migrated: string[];
    skipped: {
        file: string;
        reason: string;
    }[];
}
/**
 * Move `problems/<id>.json` records into `problems/<id>/problem.json` once.
 *
 * Idempotent and non-destructive: the legacy file is renamed to `.migrated`
 * only after the new record reads back with the same id, and anything that
 * cannot be moved is left exactly where it is.
 * @param directory - bank directory.
 * @returns the ids that moved and the files that stayed, with reasons.
 */
export declare function migrateLegacyProblems(directory: string): LegacyMigration;
/** One handed-in answer from work mode. */
export interface WorkAttemptInput {
    answer: string;
    verdict: string;
}
/** One incremental write into the answer-optimization section. */
export interface HrlUpdateInput {
    input?: HrlState['input'];
    teacher?: TeacherTrajectory;
    step?: PairingStep;
    result?: string;
}
/** A handoff to write; the id is minted when absent. */
export interface HandoffInput {
    id?: string;
    from: string;
    to: string;
    why: string;
    state: string;
    detail?: Handoff['detail'];
}
/** Fields a caller may change explicitly; everything else goes through `patch`. */
export interface UpdateProblemInput {
    status?: string;
    guideOutcome?: string;
    whereStuck?: string;
    guideResult?: string;
    insight?: string;
    reviewNextAt?: string;
    reviewInterval?: number;
    /** A review sitting: true walks one rung up, false resets to the first. */
    reviewPassed?: boolean;
    affect?: string;
    effectiveHint?: string;
    workAttempt?: WorkAttemptInput;
    hrl?: HrlUpdateInput;
    handoff?: HandoffInput;
    /** Session id accepting the pending handoff; an empty string releases it. */
    handoffConsume?: string;
    patch?: Record<string, unknown>;
    now?: Date;
}
/**
 * Apply one update under a cross-process file lock. Unknown fields merge
 * shallowly; arrays replace.
 * @param directory - bank directory.
 * @param id - problem id.
 * @param input - explicit fields plus the free patch.
 */
export declare function updateProblem(directory: string, id: string, input: UpdateProblemInput): Promise<ProblemRecord>;
/** True when this problem carries a handoff no session has accepted yet. */
export declare function hasPendingHandoff(record: ProblemRecord): boolean;
/**
 * Every problem carrying a handoff nobody accepted yet.
 * @param records - readable records.
 * @returns the id and package of each pending handoff, newest first.
 */
export declare function pendingHandoffs(records: ProblemRecord[]): {
    id: string;
    handoff: Handoff;
}[];
/** The part of one problem the next mode needs to pick it up. */
export interface ResumeView {
    id: string;
    statement: string;
    subject: string;
    status: ProblemStatus;
    insight?: string;
    handoff?: Handoff;
    lastAttempt?: ProblemAttempt;
    guideResult?: string;
}
/**
 * Build the resume package for one problem.
 * @param record - the problem.
 * @returns statement, handoff, insight and the last answer, nothing else.
 */
export declare function resumeView(record: ProblemRecord): ResumeView;
/** One-line summary used by `bank_list`; a pending handoff is named so the list can offer it. */
export declare function summarizeProblem(record: ProblemRecord): string;
/**
 * When the next review sitting is due, as a millisecond stamp.
 * Undefined when the problem has no schedule yet or the stamp is unreadable.
 * @param record - the problem.
 */
export declare function reviewDueAt(record: ProblemRecord): number | undefined;
/**
 * True when a review sitting has come due. mastered/parked never come up again;
 * every other status does once its date arrives. Pass an end-of-day stamp to ask
 * "还差今天这几小时算不算到期".
 * @param record - the problem.
 * @param now - the instant to compare against.
 */
export declare function isReviewDue(record: ProblemRecord, now?: Date): boolean;
/** Counts and the stalest problems. */
export interface BankStats {
    total: number;
    byStatus: Record<string, number>;
    bySubject: Record<string, number>;
    /** Problems whose handoff no session has accepted yet. */
    pendingHandoffs: number;
    stalest: {
        id: string;
        status: string;
        updatedAt: string;
    }[];
}
/**
 * Aggregate the whole bank.
 * @param records - readable records.
 * @param limit - how many stalest problems to report.
 */
export declare function summarizeStats(records: ProblemRecord[], limit?: number): BankStats;
/** The derived table of contents: which problems the folder directory holds. */
export interface BankIndex {
    schema: 1;
    updatedAt: string;
    /** Problem ids in folder order, which is creation order. */
    problems: string[];
}
/** Path of the bank index inside the problem directory. */
export declare function indexPath(directory: string): string;
/**
 * Read the index, or nothing when it is missing or unreadable.
 * @param directory - bank directory.
 * @returns the index, if it parses.
 */
export declare function readBankIndex(directory: string): BankIndex | undefined;
/**
 * Rewrite the index from the directory listing.
 *
 * The index is a cache, never a source of truth: it carries ids only, rebuilds
 * in one `readdir`, and losing it costs one extra scan. Call it after a create
 * and at mount; a stale entry can never hide or invent a problem.
 * @param directory - bank directory.
 * @param now - clock injection for tests.
 * @returns the index just written.
 */
export declare function rebuildIndex(directory: string, now?: Date): Promise<BankIndex>;
/** True when the index already names exactly these ids. */
export declare function indexIsCurrent(index: BankIndex | undefined, ids: readonly string[]): boolean;
