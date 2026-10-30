import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
//#region src/state.ts
/**
* Progress record for the first-run conversation.
*
* Kept apart from the plugin row so it carries no Cordis or tool dependency:
* the store is testable on its own and the row is only wiring.
* @module dsh-plugin-setup/state
*/
/** Whether the onboarding conversation has finished. */
const ONBOARDING_STATES = ["pending", "done"];
const FACT_KEYS = [
	"grade",
	"schedule",
	"rhythm",
	"preference"
];
/**
* Resolve the default progress file under the Harness home.
* @returns the absolute path.
*/
function defaultStateFile() {
	const home = process.env.DSH_HOME?.trim();
	return home !== void 0 && home.length > 0 ? join(home, "setup.json") : join(process.cwd(), "setup.json");
}
/**
* Read the progress record, or an empty pending one.
* @param file - absolute path.
* @returns the record; a corrupt file starts over rather than blocking onboarding.
*/
function readState(file) {
	if (!existsSync(file)) return {
		schema: 1,
		onboarding: "pending",
		got: {}
	};
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return {
			schema: 1,
			onboarding: "pending",
			got: {}
		};
	}
	const value = typeof raw === "object" && raw !== null ? raw : {};
	const got = {};
	const source = typeof value.got === "object" && value.got !== null ? value.got : {};
	for (const key of FACT_KEYS) {
		const entry = source[key];
		if (typeof entry === "string" && entry.length > 0) got[key] = entry;
	}
	return {
		schema: 1,
		onboarding: value.onboarding === "done" ? "done" : "pending",
		got,
		...typeof value.next === "string" ? { next: value.next } : {},
		...typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}
	};
}
/**
* Apply one patch and persist it atomically.
* @param file - absolute path.
* @param patch - the fields to write.
* @param now - clock injection for tests.
* @returns the merged record.
*/
function updateState(file, patch, now = /* @__PURE__ */ new Date()) {
	const current = readState(file);
	const got = { ...current.got };
	for (const key of FACT_KEYS) {
		const value = patch[key];
		if (value !== void 0) got[key] = value;
	}
	const next = {
		schema: 1,
		onboarding: patch.onboarding === "done" ? "done" : patch.onboarding === "pending" ? "pending" : current.onboarding,
		got,
		...patch.next !== void 0 ? { next: patch.next } : current.next !== void 0 ? { next: current.next } : {},
		updatedAt: now.toISOString()
	};
	mkdirSync(dirname(file), { recursive: true });
	const temporary = file + ".tmp";
	writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
	renameSync(temporary, file);
	return next;
}
//#endregion
export { updateState as i, defaultStateFile as n, readState as r, ONBOARDING_STATES as t };

//# sourceMappingURL=state-AWeyxRsN.js.map