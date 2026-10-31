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
	name: "Setup",
	description: "第一次见面：问清年级、课表、作息和解题偏好，然后告诉学生下一步",
	order: 30,
	plugins: [{
		id: "ile",
		name: "cordis:group",
		group: true,
		isolate: { ileModes: true },
		config: [{
			id: "coreset",
			name: "dsh-plugin-coreset",
			config: { mode: "setup" }
		}, {
			id: "setup",
			name: "dsh-plugin-setup"
		}]
	}]
};
/**
* Whether 开学 still belongs in the picker.
*
* The registry has no hidden flag, so this decides between registering the
* preset and never registering it — a finished learner sees it gone rather than
* greyed out.
* @param stateFile - absolute path to the progress file.
*/
function shouldRegisterSetup(stateFile) {
	return readState(stateFile).onboarding !== "done";
}
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
		if (!shouldRegisterSetup(this.config.stateFile !== void 0 && this.config.stateFile.length > 0 ? this.config.stateFile : defaultStateFile())) {
			yield () => {};
			return;
		}
		yield await this.ctx.agentPresets.register(SETUP_PRESET);
	}
};
//#endregion
export { SETUP_PRESET, SetupPresets as default, shouldRegisterSetup };

//# sourceMappingURL=presets.js.map