import { B as rebuildIndex, G as summarizeProblem, K as summarizeStats, L as readBankIndex, M as migrateLegacyProblems, O as isReviewDue, P as pendingHandoffs, R as readProblem, V as resumeView, b as defaultBankDirectory, k as listProblems, q as updateProblem, r as BankError, v as attachProblemImages, w as indexIsCurrent, y as createProblem, z as readProblemImage } from "./store-Cda-Ufy7.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { appendPluginRecord } from "@deepseek-ai/dsh-session";
//#region src/handoff-target.ts
/** A handoff selects a mode inside a preset; study modes all belong to Work. */
function handoffMode(mode) {
	const key = mode?.trim().toLowerCase();
	if (key === "guide" || key === "引导模式") return "guide";
	if (key === "work" || key === "独立做题") return "work";
	if (key === "hrl" || key === "答案优化") return "hrl";
	if (key === "chat" || key === "聊天") return "chat";
	if (key === "setup" || key === "开学") return "setup";
}
//#endregion
//#region src/api.ts
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 65536;
/** Route prefix owned by this plugin. */
const ROUTE_PREFIX = "/bank/api";
var BankApiError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "BankApiError";
	}
};
function writeJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
function writeError(res, error) {
	if (error instanceof BankApiError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	if (error instanceof BankError) {
		writeJson(res, 400, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new BankApiError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new BankApiError("bad-request", "request body is not valid JSON");
	}
}
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL("http://" + authority);
	} catch {
		return;
	}
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}
/**
* Whether one request may reach the plugin routes.
* @param request - inbound request headers.
* @param trustedHosts - hosts the Host already trusts for its own API.
* @returns true for loopback or trusted authority, same-origin only.
*/
function isTrusted(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!(isLoopbackHostname(hostUrl.hostname) || trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		return entryUrl !== void 0 && entryUrl.host === hostUrl.host;
	}))) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/**
* Every problem whose handoff nobody accepted yet, newest first.
* @param directory - bank directory.
* @returns the card-shaped pending rows.
*/
function pendingRows(directory) {
	const { records } = listProblems(directory);
	const rows = [];
	for (const entry of pendingHandoffs(records)) {
		const record = records.find((candidate) => candidate.id === entry.id);
		if (record === void 0) continue;
		rows.push({
			id: record.id,
			subject: record.subject,
			status: record.status,
			statement: record.statement,
			handoff: entry.handoff
		});
	}
	return rows;
}
/** Only log the learner-selected mode in an idle, previously unused study session. */
function initializeHandoffMode(host, record, sessionId) {
	const mode = handoffMode(record.handoff?.to);
	if (mode === void 0 || mode === "setup" || record.handoff?.consumerSessionId === sessionId) return;
	const sessions = host.get?.("sessions", false);
	const projections = host.get?.("sessionProjections", false);
	const session = sessions?.get(sessionId);
	if (session === void 0 || projections === void 0) throw new BankApiError("session-unavailable", "交接会话尚未就绪，请重试", 409);
	const boundary = projections.stateOf(session, "turnBoundary");
	if (boundary === void 0) throw new BankApiError("session-unavailable", "交接会话尚未就绪，请重试", 409);
	if (boundary.lastTurn !== 0 || boundary.openTurnStartSeq !== null) return;
	const preset = projections.stateOf(session, "agentPreset");
	if (preset !== "work" && preset !== "chat") throw new BankApiError("invalid-preset", "请在 Work 或 Chat 中接着做题", 409);
	const current = projections.stateOf(session, "ile");
	if (current === void 0) throw new BankApiError("session-unavailable", "交接会话缺少模式服务，请重试", 409);
	if (current.mode !== "") return;
	appendPluginRecord(session, "plugin:ile/mode", {
		mode,
		summary: record.handoff?.state ?? null
	});
}
/**
* Mount the browser data channel.
* @param ctx - profile-root context.
* @param directory - bank directory the client reads and writes through this route.
*/
function mountBankApi(ctx, directory) {
	const host = ctx;
	if (typeof host.get !== "function" || typeof host.effect !== "function") return;
	const webServer = host.get("webServer");
	const webStartup = host.get("webStartup");
	if (webServer === void 0 || webStartup === void 0) return;
	const api = {
		"handoff.pending": () => pendingRows(directory),
		"handoff.consume": async (payload) => {
			const id = typeof payload.id === "string" ? payload.id : "";
			const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
			if (id === "") throw new BankApiError("bad-request", "missing or invalid \"id\"");
			if (sessionId === "") throw new BankApiError("bad-request", "missing or invalid \"sessionId\"");
			initializeHandoffMode(host, readProblem(directory, id), sessionId);
			const record = await updateProblem(directory, id, { handoffConsume: sessionId });
			return {
				id: record.id,
				consumedAt: record.handoff?.consumedAt ?? null,
				consumerSessionId: record.handoff?.consumerSessionId ?? null
			};
		}
	};
	const fence = (req) => isTrusted(req, webStartup.trustedHosts);
	host.effect(() => webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler: async (rawReq, rawRes) => {
			const req = rawReq;
			const res = rawRes;
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/bank/api/") ? pathname.slice(10) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new BankApiError("not-found", "unknown bank API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new BankApiError("not-found", "unknown bank API method \"" + method + "\"", 404);
				writeJson(res, 200, {
					ok: true,
					value: await handler(payload ?? {})
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-plugin-bankmanager: /bank/api routes");
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "plugin-bankmanager";
/**
* Services used by this row. Only the tool registry is required: the browser channel's
* web pair (`webServer` / `webStartup`) arrives through a nested inject, so a profile
* without the web-app bundle still gets every tool instead of a permanently pending row.
*/
const inject = ["tools"];
/** Runtime schema for the bank row. */
const Config = z.object({ 
/** Absolute bank directory; empty means `<DSH_HOME>/bank/problems`. */
directory: z.string().default("") });
/** Model-facing text for a store failure. */
function explain(error) {
	if (error instanceof BankError) return error.code + ": " + error.message;
	return "bank error: " + (error instanceof Error ? error.message : String(error));
}
/** 本地时区的「今天结束」，到期判断留出整天余量。 */
function endOfToday(now = /* @__PURE__ */ new Date()) {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}
/** One-line JSON with a stable order. */
function json(value) {
	return JSON.stringify(value, null, 2);
}
/** A picture older than this no longer belongs to the exchange being answered. */
const IMAGE_WINDOW_MS = 10 * 6e4;
/** Pictures one `bank_image` call may return; the message-level image bound is the reason. */
const MAX_IMAGES_PER_CALL = 4;
/** Output schema of one durable image reference. */
const IMAGE_REF_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		attachmentId: {
			type: "string",
			required: true,
			description: "存储标识"
		},
		mediaType: {
			type: "string",
			required: true,
			description: "图片类型"
		},
		bytes: {
			type: "number",
			required: true,
			description: "字节数"
		},
		width: {
			type: "number",
			required: true,
			description: "宽"
		},
		height: {
			type: "number",
			required: true,
			description: "高"
		}
	}
};
/** Image references carried by one user message's content. */
function imagesOf(content) {
	return content.flatMap((part) => part.type === "image" ? [part.attachment] : []);
}
/**
* Pictures from the prompt this call is answering.
*
* Walks back over the user messages of the current exchange — a photo sent on
* its own and a "这题怎么做" typed after it are the same question — and stops
* once the messages are older than {@link IMAGE_WINDOW_MS}, so the previous
* problem's picture never rides along by accident.
* @param agent - the agent owning the tool call.
* @param now - clock injection for tests.
*/
function promptImages(agent, now = Date.now()) {
	if (agent === void 0) return [];
	const session = agent.session;
	const nodes = session.surface.nodes;
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		const seq = nodes[index];
		if (seq === void 0) continue;
		const event = session.eventAt(seq);
		if (event === void 0 || event.type !== "user/message") continue;
		if (event.time > now || now - event.time > IMAGE_WINDOW_MS) return [];
		const images = imagesOf(event.data.content);
		if (images.length > 0) return images;
	}
	return [];
}
/** Copy the prompt's pictures into the problem folder; a no-op without an attachment store. */
async function captureImages(ctx, agent, directory, id) {
	const images = promptImages(agent);
	if (images.length === 0) return 0;
	const reader = ctx.get("attachments", false);
	if (reader === void 0) return 0;
	const copies = [];
	for (const image of images) {
		const stored = await reader.readImage(image);
		copies.push({
			data: stored.data,
			mediaType: image.mediaType,
			width: image.width,
			height: image.height
		});
	}
	return (await attachProblemImages(directory, id, copies)).attachments.length;
}
/**
* Mount the bank tools on this scope.
* @param ctx - profile-root context; the row registers host-wide tools.
* @param config - where the bank directory lives.
*/
function apply(ctx, config) {
	const directory = config.directory !== void 0 && config.directory.length > 0 ? config.directory : defaultBankDirectory();
	try {
		const migration = migrateLegacyProblems(directory);
		if (migration.migrated.length > 0) ctx.logger.info("dsh-plugin-bankmanager: migrated %d legacy problem files into folders", migration.migrated.length);
		for (const skipped of migration.skipped) ctx.logger.warn("dsh-plugin-bankmanager: left %s in place: %s", skipped.file, skipped.reason);
	} catch (error) {
		ctx.logger.warn("dsh-plugin-bankmanager: legacy migration failed: %o", error);
	}
	rebuildIndex(directory).catch((error) => {
		ctx.logger.warn("dsh-plugin-bankmanager: could not rebuild bank index: %o", error);
	});
	const scoped = ctx;
	if (typeof scoped.inject === "function") scoped.inject(["webServer", "webStartup"], (webCtx) => {
		mountBankApi(webCtx, directory);
	});
	ctx.tools.register(defineTool({
		name: "bank_add",
		description: [
			"把一道新题存进题库，返回题目 id。",
			"用在：学生第一次把一道题发给你、或者你判断这次要开始引导一道新题时。",
			"statement 是题干原文，尽量完整（含小问）；subject 是科目，自由写（math、arts、physics、chemistry…）；",
			"tags 可选，放知识点。",
			"学生这条消息里带的图片会自动存进这道题的文件夹，不用另做一步；图片不在手上了就用 bank_list 先找题。",
			"同一道题只建一次：不确定建过没有，先用 bank_list 看。"
		].join("\n"),
		parameters: {
			statement: {
				type: "string",
				required: true,
				description: "题干原文"
			},
			subject: {
				type: "string",
				required: true,
				description: "科目，自由字符串"
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "知识点标签，可省略"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args, exec) => {
			try {
				const record = await createProblem(directory, {
					statement: args.statement,
					subject: args.subject,
					...args.tags === void 0 ? {} : { tags: args.tags }
				});
				let imageNote = "";
				try {
					const captured = await captureImages(ctx, exec.agent, directory, record.id);
					if (captured > 0) imageNote = "\n图片：" + captured + " 张已存进题目文件夹";
				} catch (error) {
					imageNote = "\n图片没存成：" + explain(error);
				}
				return "已建题：" + record.id + "\n状态：new，科目：" + record.subject + imageNote;
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_image",
		description: [
			"把题目里存着的图片重新给你看。",
			"用在：bank_show 显示这道题有附件，而你要看图才能讲；或者学生问的就是图上的东西，但这条消息里没带图。",
			"一次最多 4 张：默认全给，which 指定第几张（从 1 开始）。"
		].join("\n"),
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "题目 id"
			},
			which: {
				type: "integer",
				description: "要第几张（从 1 开始），省略就返回全部"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: {
						type: "string",
						required: true,
						description: "这道题有几张图、这次给了哪几张"
					},
					images: {
						type: "array",
						required: true,
						items: IMAGE_REF_SCHEMA
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}, ...value.images.map((image) => ({
				type: "image",
				attachment: image
			}))]
		},
		execute: async (args) => {
			try {
				const record = readProblem(directory, args.id.trim());
				if (record.attachments.length === 0) return {
					text: "这道题没有存图片：" + record.id,
					images: []
				};
				const store = ctx.get("attachments", false);
				if (store === void 0) return {
					text: "这个 profile 没挂附件服务，图读不出来。",
					images: []
				};
				const total = record.attachments.length;
				const wanted = args.which === void 0 ? record.attachments.slice(0, MAX_IMAGES_PER_CALL) : [record.attachments[args.which - 1]].filter((entry) => entry !== void 0);
				if (wanted.length === 0) return {
					text: "这道题只有 " + total + " 张图，没有第 " + String(args.which) + " 张。",
					images: []
				};
				const images = [];
				for (const entry of wanted) {
					const data = readProblemImage(directory, record.id, entry);
					images.push(await store.saveImage({
						data,
						mediaType: entry.mediaType,
						name: entry.file
					}));
				}
				const left = total - images.length;
				return {
					text: "题目 " + record.id + " 有 " + total + " 张图，这次给了 " + images.length + " 张" + (left > 0 ? "（还有 " + left + " 张，用 which 指定）" : "") + "。",
					images
				};
			} catch (error) {
				return {
					text: explain(error),
					images: []
				};
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_list",
		description: [
			"按状态列出题库里的题，每行：id、状态、科目、建立日期、题干前 40 字。",
			"用在：学生说「接着上次那道题」，或者你想知道现在手上有哪些题。",
			"status 可选：new / guide / hrl / review / mastered / parked；不传则全部。",
			"due: true 只看今天该复习的（review.nextAt 已到期，含今天），用来开复习场。",
			"接续时用 bank_show 读完整记录；复习先传 bank_show({ id, recall: true }) 隐藏旧解，学生实际作答后再核验。"
		].join("\n"),
		parameters: {
			status: {
				type: "string",
				description: "只看某个状态"
			},
			subject: {
				type: "string",
				description: "只看某个科目"
			},
			due: {
				type: "boolean",
				description: "只看今天到期该复习的题；mastered / parked 不会出现"
			},
			limit: {
				type: "integer",
				description: "最多返回几条，默认 20"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			try {
				const { records, skipped } = listProblems(directory);
				const ids = records.map((record) => record.id);
				if (!indexIsCurrent(readBankIndex(directory), ids)) await rebuildIndex(directory);
				let rows = records;
				if (args.status !== void 0 && args.status.length > 0) rows = rows.filter((record) => record.status === args.status);
				if (args.subject !== void 0 && args.subject.length > 0) {
					const wanted = args.subject.toLowerCase();
					rows = rows.filter((record) => record.subject.toLowerCase() === wanted);
				}
				if (args.due === true) {
					const horizon = endOfToday();
					rows = rows.filter((record) => isReviewDue(record, horizon));
				}
				const limit = args.limit === void 0 ? 20 : Math.max(1, Math.min(100, args.limit));
				const lines = rows.slice(-limit).map(summarizeProblem);
				if (lines.length === 0) return args.due === true ? "今天没有到期的题。" : "题库里没有符合条件的题。";
				const header = args.due === true ? "今天该复习 " + rows.length + " 道，显示最近 " + lines.length + " 道：" : "共 " + rows.length + " 道，显示最近 " + lines.length + " 道：";
				const broken = skipped.length > 0 ? "\n跳过 " + skipped.length + " 个损坏文件：" + skipped.map((item) => item.file).join("、") : "";
				return header + "\n" + lines.join("\n") + broken;
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_show",
		description: [
			"读一道题；默认返回完整记录（题干、引导会话、尝试、复习、历史）。",
			"复习开始先传 recall: true，只返回题干和图片引用，不返回旧答案、insight、交接或学习记录；先让学生独立重建，再按需读完整记录核验。",
			"id 来自 bank_add 或 bank_list。",
			"接着引导一道旧题前，先读它，别让学生重复讲一遍题干。"
		].join("\n"),
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "题目 id"
			},
			recall: {
				type: "boolean",
				description: "复习先用 true：只读题干和图片引用，隐藏旧解与线索"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			try {
				const record = readProblem(directory, args.id);
				return json(args.recall === true ? {
					id: record.id,
					subject: record.subject,
					statement: record.statement,
					attachments: record.attachments
				} : record);
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_update",
		description: [
			"更新一道题。显式字段：status、guideOutcome（solved / stuck / abandoned）、whereStuck、guideResult、insight、reviewNextAt、reviewInterval、reviewPassed。",
			"判过（status 变 review）自动排第一次复习。learningEvidence 记录实际作答：guided / independent / delayed-recall / transfer，support 记本次用过的最重帮助，answer 逐字。引导中完成不等于之后独立完成。",
			"delayed-recall 证据会自动更新复习：仅 support=none 且 outcome=solved 升一档 1/3/7/14/30/60/120 天，其余回第一档。reviewPassed=true 必须同时有这份证据；可省略 reviewPassed，不能与证据矛盾。transfer 单独记，不推进原题复习。",
			"affect（frustrated / neutral / excited）与 effectiveHint（confirm / position / feature / structure / result）记这一轮的学生状态和哪个档的视角有效，写进当前引导会话。",
			"workAttempt：交一次卷——answer 原文 + verdict（ok / partial / wrong）。只放学生独立做的卷；引导里做出来的写 guideResult。",
			"hrl：答案优化的增量写入，四段都可选，按 input → teacher → step → result 的顺序应用。",
			"  input 是这次在打磨哪份答案；teacher 是教师轨迹（一次写全，按学生偏好写）；",
			"  step 写进最近一个还没有 result 的 pairing；围绕关键决策比较，机械步骤可随同确认后逐条保存；result 是这条 pairing 拼好的最终解。",
			"  step.decision 记比较的决策，understanding{question,answer,verdict} 记方法适用条件的问题、学生原话和 supported / partial / unclear；与 chosen、整体 preference 分开，没问或拒答就不编造。",
			"  teacher.steps 每步的 improvement 记这一步相对他原写法改了什么（是差异，不是优劣）；preference 在收尾时写，记学生整体更喜欢哪版。",
			"  学生每确认一步就立即写 step；按 chosen 取 studentQuote / teacherStep 对应的 body / mergedText，核对整条推理衔接后写 result，未完成时保持 hrl。",
			"handoff：交接包（from / to / why / state / detail）。同一道题最多一个未接收的，新的会顶掉旧的。",
			"handoffConsume：传会话 id 表示这份交接已被接收；传空字符串表示撤销接收，卡片重新可点。",
			"patch 是自由对象，浅合并进记录（数组整体替换），用来写工具还没覆盖的字段。",
			"每次修改都会追加 history，updatedAt 自动刷新。",
			"引导模式收尾：学生已给出结果并说明关键依据后，问「这题你自己做出来了吗」。做出来 → status=review、guideOutcome=solved；",
			"没做出来 → guideOutcome=stuck，status 保持 guide。独立做题按 workAttempt 判卷，答案优化按逐步选择后的完整轨迹验收，不写虚构的引导结局。"
		].join("\n"),
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "题目 id"
			},
			status: {
				type: "string",
				description: "new / guide / hrl / review / mastered / parked"
			},
			guideOutcome: {
				type: "string",
				description: "solved / stuck / abandoned"
			},
			whereStuck: {
				type: "string",
				description: "卡在哪一步（配合 guideOutcome=stuck）"
			},
			guideResult: {
				type: "string",
				description: "引导结束时他自己写出来的原稿"
			},
			insight: {
				type: "string",
				description: "这道题的关键转折，写给以后的自己"
			},
			reviewNextAt: {
				type: "string",
				description: "下次复习时间（ISO 8601）"
			},
			reviewInterval: {
				type: "integer",
				description: "复习间隔（天）"
			},
			reviewPassed: {
				type: "boolean",
				description: "可省略；true 需同次提交 delayed-recall、none、solved 证据，false 回第一档"
			},
			learningEvidence: {
				type: "object",
				additionalProperties: false,
				description: "本次实际学习证据；延迟提取会自动更新复习，时间由服务端填写",
				properties: {
					context: {
						type: "string",
						required: true,
						description: "guided / independent / delayed-recall / transfer"
					},
					support: {
						type: "string",
						required: true,
						description: "本次最重帮助：none / attention / explanation / example；看过旧解计 example"
					},
					outcome: {
						type: "string",
						required: true,
						description: "solved / partial / stuck"
					},
					answer: {
						type: "string",
						required: true,
						description: "学生实际作答原文，包括明确表示不会；不编造"
					},
					note: {
						type: "string",
						description: "观察依据、哪处帮助撤掉了；变式的题干也记在这里"
					},
					willingness: {
						type: "string",
						description: "学生明确表达的 continue / pause；没有表达则省略"
					}
				}
			},
			affect: {
				type: "string",
				description: "这一轮学生的状态：frustrated / neutral / excited"
			},
			effectiveHint: {
				type: "string",
				description: "这一轮哪个档的视角有效：confirm / position / feature / structure / result"
			},
			workAttempt: {
				type: "object",
				additionalProperties: false,
				description: "记录一次独立作答",
				properties: {
					answer: {
						type: "string",
						required: true,
						description: "学生原文"
					},
					verdict: {
						type: "string",
						required: true,
						description: "ok / partial / wrong"
					}
				}
			},
			hrl: {
				type: "object",
				additionalProperties: false,
				description: "答案优化的增量写入",
				properties: {
					input: {
						type: "object",
						additionalProperties: false,
						description: "这次打磨的是哪份答案",
						properties: {
							at: {
								type: "string",
								description: "ISO 时间，省略用当前时间"
							},
							from: {
								type: "string",
								description: "work（从题库带的）或 pasted（学生当场贴的）"
							},
							attemptAt: {
								type: "string",
								description: "对应 work.attempts 里的 at"
							},
							answer: {
								type: "string",
								required: true,
								description: "原文"
							}
						}
					},
					teacher: {
						type: "object",
						additionalProperties: false,
						description: "教师轨迹，一次写全",
						properties: {
							writtenAt: {
								type: "string",
								description: "ISO 时间，省略用当前时间"
							},
							answer: {
								type: "string",
								required: true,
								description: "教师版最终答案"
							},
							note: {
								type: "string",
								description: "按什么偏好写的，可省略"
							},
							steps: {
								type: "array",
								description: "按步拆开的全解",
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										index: {
											type: "integer",
											required: true
										},
										body: {
											type: "string",
											required: true,
											description: "这一步做什么"
										},
										reason: {
											type: "string",
											required: true,
											description: "为什么能这么做"
										},
										improvement: {
											type: "string",
											description: "这一步相对他原写法改了什么（差异，不是优劣）"
										}
									}
								}
							}
						}
					},
					step: {
						type: "object",
						additionalProperties: false,
						description: "一个小步的对比",
						properties: {
							index: {
								type: "integer",
								required: true
							},
							studentQuote: {
								type: "string",
								description: "学生原句，逐字"
							},
							teacherStep: {
								type: "integer",
								description: "对应教师轨迹的 index"
							},
							match: {
								type: "string",
								required: true,
								description: "same / partial / missing"
							},
							chosen: {
								type: "string",
								description: "student / teacher / merged"
							},
							mergedText: {
								type: "string",
								description: "chosen=merged 时学生自己重写的这步"
							},
							chosenAt: {
								type: "string",
								description: "ISO 时间"
							},
							note: {
								type: "string",
								description: "为什么这么选"
							},
							decision: {
								type: "string",
								description: "本组关键决策，如求导还是配方"
							},
							understanding: {
								type: "object",
								additionalProperties: false,
								properties: {
									question: {
										type: "string",
										required: true,
										description: "围绕适用条件或变化情形问的一个问题"
									},
									answer: {
										type: "string",
										required: true,
										description: "学生实际回答，逐字；拒答不伪造"
									},
									verdict: {
										type: "string",
										required: true,
										description: "supported / partial / unclear；依据实际解释，不按偏好推断"
									}
								}
							}
						}
					},
					result: {
						type: "string",
						description: "这条 pairing 逐条选完后拼出的解"
					},
					preference: {
						type: "string",
						description: "收尾时写：student / teacher / merged，他整体更喜欢哪版"
					}
				}
			},
			handoff: {
				type: "object",
				additionalProperties: false,
				description: "给下一个模式的交接包",
				properties: {
					id: {
						type: "string",
						description: "省略则自动生成"
					},
					from: {
						type: "string",
						required: true,
						description: "work / guide / hrl / setup"
					},
					to: {
						type: "string",
						required: true,
						description: "目标模式"
					},
					why: {
						type: "string",
						required: true,
						description: "一句话，为什么换"
					},
					state: {
						type: "string",
						required: true,
						description: "这题到哪了"
					},
					detail: {
						type: "object",
						additionalProperties: false,
						description: "三段散文，给下一个模式的你",
						properties: {
							lastWords: {
								type: "string",
								description: "学生最后说了什么"
							},
							blocker: {
								type: "string",
								description: "卡点"
							},
							nextStep: {
								type: "string",
								description: "下一步从哪接"
							}
						}
					}
				}
			},
			handoffConsume: {
				type: "string",
				description: "接受这份交接的会话 id；空字符串表示撤销接收"
			},
			patch: {
				type: "json",
				description: "自由字段浅合并"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			try {
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const workAttempt = args.workAttempt === void 0 ? void 0 : {
					answer: args.workAttempt.answer,
					verdict: args.workAttempt.verdict
				};
				let hrl;
				if (args.hrl !== void 0) {
					const source = args.hrl;
					hrl = {};
					if (source.input !== void 0) hrl.input = {
						at: source.input.at ?? now,
						from: source.input.from ?? "pasted",
						answer: source.input.answer,
						...source.input.attemptAt === void 0 ? {} : { attemptAt: source.input.attemptAt }
					};
					if (source.teacher !== void 0) hrl.teacher = {
						writtenAt: source.teacher.writtenAt ?? now,
						answer: source.teacher.answer,
						steps: source.teacher.steps ?? [],
						...source.teacher.note === void 0 ? {} : { note: source.teacher.note }
					};
					if (source.step !== void 0) {
						const step = source.step;
						hrl.step = {
							index: step.index,
							match: step.match,
							...step.studentQuote === void 0 ? {} : { studentQuote: step.studentQuote },
							...step.teacherStep === void 0 ? {} : { teacherStep: step.teacherStep },
							...step.chosen === void 0 ? {} : { chosen: step.chosen },
							...step.mergedText === void 0 ? {} : { mergedText: step.mergedText },
							...step.chosenAt === void 0 ? {} : { chosenAt: step.chosenAt },
							...step.note === void 0 ? {} : { note: step.note },
							...step.decision === void 0 ? {} : { decision: step.decision },
							...step.understanding === void 0 ? {} : { understanding: step.understanding }
						};
					}
					if (source.result !== void 0) hrl.result = source.result;
					if (source.preference !== void 0) hrl.preference = source.preference;
				}
				const handoff = args.handoff === void 0 ? void 0 : {
					from: args.handoff.from,
					to: args.handoff.to,
					why: args.handoff.why,
					state: args.handoff.state,
					...args.handoff.id === void 0 ? {} : { id: args.handoff.id },
					...args.handoff.detail === void 0 ? {} : { detail: args.handoff.detail }
				};
				const record = await updateProblem(directory, args.id, {
					...args.status === void 0 ? {} : { status: args.status },
					...args.guideOutcome === void 0 ? {} : { guideOutcome: args.guideOutcome },
					...args.whereStuck === void 0 ? {} : { whereStuck: args.whereStuck },
					...args.guideResult === void 0 ? {} : { guideResult: args.guideResult },
					...args.insight === void 0 ? {} : { insight: args.insight },
					...args.reviewNextAt === void 0 ? {} : { reviewNextAt: args.reviewNextAt },
					...args.reviewInterval === void 0 ? {} : { reviewInterval: args.reviewInterval },
					...args.reviewPassed === void 0 ? {} : { reviewPassed: args.reviewPassed },
					...args.learningEvidence === void 0 ? {} : { learningEvidence: args.learningEvidence },
					...args.affect === void 0 ? {} : { affect: args.affect },
					...args.effectiveHint === void 0 ? {} : { effectiveHint: args.effectiveHint },
					...workAttempt === void 0 ? {} : { workAttempt },
					...hrl === void 0 ? {} : { hrl },
					...handoff === void 0 ? {} : { handoff },
					...args.handoffConsume === void 0 ? {} : { handoffConsume: args.handoffConsume },
					...args.patch === void 0 ? {} : { patch: args.patch }
				});
				return "已更新 " + record.id + "：状态 " + record.status + "，历史 " + record.history.length + " 条。";
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_resume",
		description: [
			"接上一道题。不给 id：列出所有待接的交接（谁留的、留给谁、为什么、这题到哪了）。",
			"给 id：直接返回那道题的题干、交接包、insight 和最后一次作答——学生说「接着上次那道题」时用这个，别让他重讲题干。",
			"新会话开场先不带 id 调一次，看不到「待接」就说明没有要接的。"
		].join("\n"),
		parameters: { id: {
			type: "string",
			description: "题目 id；省略则只列待接交接"
		} },
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async (args) => {
			try {
				if (args.id === void 0 || args.id.length === 0) {
					const { records } = listProblems(directory);
					const pending = pendingHandoffs(records);
					if (pending.length === 0) return "没有待接的交接。";
					return pending.map((entry) => {
						const handoff = entry.handoff;
						return "- " + entry.id + "：" + handoff.from + " -> " + handoff.to + "｜" + handoff.why + "｜" + handoff.state;
					}).join("\n");
				}
				return json(resumeView(readProblem(directory, args.id)));
			} catch (error) {
				return explain(error);
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "bank_stats",
		description: ["题库概况：各状态计数、总数、待接交接数、最久没动的 5 道题。", "用在：学生问「我还有多少题没做」，或者你判断先带哪道题。"].join("\n"),
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		execute: async () => {
			try {
				const { records, skipped } = listProblems(directory);
				const stats = summarizeStats(records);
				const lines = [
					"总数：" + stats.total,
					"待接交接：" + stats.pendingHandoffs,
					"按状态：" + (Object.keys(stats.byStatus).length === 0 ? "（空）" : Object.entries(stats.byStatus).map(([key, value]) => key + "=" + value).join("，")),
					"按科目：" + (Object.keys(stats.bySubject).length === 0 ? "（空）" : Object.entries(stats.bySubject).map(([key, value]) => key + "=" + value).join("，")),
					"最久没动：",
					...stats.stalest.length === 0 ? ["（空）"] : stats.stalest.map((item) => "- " + item.id + " " + item.status + " " + item.updatedAt.slice(0, 10))
				];
				if (skipped.length > 0) lines.push("损坏文件：" + skipped.length + " 个");
				return lines.join("\n");
			} catch (error) {
				return explain(error);
			}
		}
	}));
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map