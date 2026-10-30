import { n as defaultStateFile, r as readState } from "./state-AWeyxRsN.js";
import z from "@deepseek-ai/schemastery";
import { Service } from "@deepseek-ai/cordis";
//#region src/presets.ts
/**
* The 开学 preset, registered only while onboarding is unfinished.
*
* The registry has no hidden flag: `list()` reads the live definitions, so not
* registering is how 开学 disappears from the picker. The state is read once at
* startup — a learner who finishes onboarding sees it gone after the next start.
*
* @module dsh-plugin-setup/presets
*/
/** The one preset this package owns. */
const SETUP_PRESET = {
	id: "setup",
	name: "开学",
	description: "第一次见面：问清年级、课表、作息和解题偏好，然后告诉学生下一步",
	order: 30,
	plugins: [{
		name: "dsh-plugin-coreset",
		config: { mode: "setup" }
	}, { name: "dsh-plugin-setup" }]
};
/**
* Registers {@link SETUP_PRESET} when onboarding has not been finished.
* Registration is awaited in {@link Service.init} because the registry returns
* the disposer this row must hold.
*/
var SetupPresets = class {
	ctx;
	config;
	static inject = ["agentPresets"];
	static Config = z.object({ stateFile: z.string().default("") });
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.config = config;
	}
	async *[Service.init]() {
		if (readState(this.config.stateFile !== void 0 && this.config.stateFile.length > 0 ? this.config.stateFile : defaultStateFile()).onboarding === "done") {
			yield () => {};
			return;
		}
		yield await this.ctx.agentPresets.register(SETUP_PRESET);
	}
};
//#endregion
export { SETUP_PRESET, SetupPresets as default };

//# sourceMappingURL=presets.js.map