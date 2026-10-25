window.__ModuleLoader__.load({
	id: "dsh-plugin-bankmanager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/handoff-model.ts
		function asText(value) {
			return typeof value === "string" && value.trim().length > 0 ? value : void 0;
		}
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		/** 解析 `bank_resume` 的结果文本；不是那次调用的 JSON 形状时返回 undefined。 */
		function readHandoffView(text) {
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				return;
			}
			const root = record(parsed);
			if (root === void 0) return void 0;
			const id = asText(root.id);
			const statement = asText(root.statement);
			if (id === void 0 || statement === void 0) return void 0;
			const handoff = record(root.handoff);
			const detail = handoff === void 0 ? void 0 : record(handoff.detail);
			return {
				id,
				statement,
				status: asText(root.status),
				lastWords: detail === void 0 ? void 0 : asText(detail.lastWords),
				blocker: detail === void 0 ? void 0 : asText(detail.blocker),
				nextStep: detail === void 0 ? void 0 : asText(detail.nextStep),
				from: handoff === void 0 ? void 0 : asText(handoff.from),
				to: handoff === void 0 ? void 0 : asText(handoff.to),
				why: handoff === void 0 ? void 0 : asText(handoff.why)
			};
		}
		/** 「接着做」按钮复制给学生的那句话：新会话开场直接发给模型，不用重讲题干。 */
		function resumePrompt(view) {
			return `接着上次那道题：${view.id}`;
		}
		/** 学生这次真正发出去的那句话；带状态，模型一眼看见这题到哪一步。 */
		function resumeSentence(id, status) {
			return status === void 0 || status.trim() === "" ? `接着上次那道题：${id}` : `接着上次那道题：${id}（${status}）`;
		}
		/** 卡片「接着做」塞进新会话的那句话。 */
		function resumeText(view) {
			return resumeSentence(view.id, view.status);
		}
		/** 交接包里的模式名 → 预设 id。认模型写的中文显示名；不认识的交回 Host 默认。 */
		function presetForMode(mode) {
			if (mode === void 0) return void 0;
			const key = mode.trim().toLowerCase();
			if (key === "guide" || key === "引导模式") return "guide";
			if (key === "work" || key === "独立做题") return "work";
			if (key === "hrl" || key === "答案优化") return "hrl";
			if (key === "setup" || key === "开学") return "setup";
		}
		/**
		* 解析 `handoff.pending` 的返回值；形状不对的行直接丢，不抛。
		* @param value - route 返回的 value（数组）。
		* @returns 能画出来的待接行。
		*/
		function readPendingHandoffs(value) {
			if (!Array.isArray(value)) return [];
			const rows = [];
			for (const item of value) {
				const root = record(item);
				if (root === void 0) continue;
				const id = asText(root.id);
				const statement = asText(root.statement);
				if (id === void 0 || statement === void 0) continue;
				const handoff = record(root.handoff);
				rows.push({
					id,
					statement,
					status: asText(root.status),
					to: handoff === void 0 ? void 0 : asText(handoff.to)
				});
			}
			return rows;
		}
		//#endregion
		//#region src/client/HandoffCard.tsx
		function textOf(block) {
			if (typeof block !== "object" || block === null) return void 0;
			const content = block.content;
			if (!Array.isArray(content)) return void 0;
			const parts = [];
			for (const item of content) {
				if (typeof item !== "object" || item === null) continue;
				const { type, text } = item;
				if (type === "text" && typeof text === "string") parts.push(text);
			}
			return parts.length === 0 ? void 0 : parts.join("\n");
		}
		/** 交接卡片：在聊天里替模型把「上次停在哪」摊开，学生一眼看见就能接着做。 */
		function HandoffCard({ phase, block, resume }) {
			if (phase !== "result") return null;
			const text = textOf(block);
			const view = text === void 0 ? void 0 : readHandoffView(text);
			if (view === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HandoffBody, {
				view,
				resume
			});
		}
		var HINT = {
			idle: "一个按钮：开个新会话，题干直接进输入框。",
			busy: "正在开…",
			opened: "新会话开好了，题干在输入框里，按回车发出去。",
			"opened-unconsumed": "新会话开好了；这题还会出现在「待接」里，等下再点一次也行。",
			failed: "开不了新会话，先复制这句话过去。",
			copied: "已复制，新会话里直接发。"
		};
		var LABEL = {
			idle: "接着做",
			busy: "正在开…",
			opened: "已开新会话",
			"opened-unconsumed": "已开新会话",
			failed: "复制这句",
			copied: "已复制"
		};
		function HandoffBody({ view, resume }) {
			const [state, setState] = (0, react.useState)("idle");
			const copy = () => {
				navigator.clipboard?.writeText(resumePrompt(view)).then(() => {
					setState("copied");
					window.setTimeout(() => {
						setState("idle");
					}, 2400);
				}).catch(() => {
					setState("idle");
				});
			};
			const act = async () => {
				if (state === "busy") return;
				if (resume === void 0 || state === "failed") {
					copy();
					return;
				}
				setState("busy");
				try {
					setState(await resume(view));
				} catch {
					setState("failed");
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "ile-handoff",
				"data-ile-handoff": view.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "ile-handoff__kicker",
						children: [
							"接着上次的题 · ",
							view.id,
							view.from === void 0 || view.to === void 0 ? null : ` · ${view.from} → ${view.to}`
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ile-handoff__statement",
						children: view.statement
					}),
					view.lastWords === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "ile-handoff__quote",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ile-handoff__label",
							children: "你上次停在"
						}), view.lastWords]
					}),
					view.nextStep === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "ile-handoff__next",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ile-handoff__label",
							children: "下一步"
						}), view.nextStep]
					}),
					view.nextStep === void 0 && view.blocker !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "ile-handoff__next",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ile-handoff__label",
							children: "卡在"
						}), view.blocker]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "ile-handoff__row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "ile-handoff__button",
							onClick: () => {
								act();
							},
							disabled: state === "busy",
							children: LABEL[state]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ile-handoff__hint",
							children: HINT[state]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/HeroResume.tsx
		/**
		* 空白会话首页那一行「接着上次的题」。
		*
		* 不点的时候什么都不动——输入框原样；点一下只把上次那道题（带状态）填进输入框，
		* 发不发、改不改都由学生自己决定，符合「零注入」：模型看到的是学生发的那句话。
		*/
		function HeroResume({ sessionId, inputActions, loadPending, consume }) {
			const [items, setItems] = (0, react.useState)([]);
			const [taken, setTaken] = (0, react.useState)(void 0);
			const loader = (0, react.useRef)(loadPending);
			loader.current = loadPending;
			(0, react.useEffect)(() => {
				let live = true;
				loader.current?.().then((pending) => {
					if (live) setItems(pending);
				}, () => {});
				return () => {
					live = false;
				};
			}, []);
			if (items.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ile-resume",
				children: items.slice(0, 3).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "ile-resume__chip",
					onClick: () => {
						inputActions?.setDraft(resumeSentence(item.id, item.status));
						setTaken(item.id);
						if (sessionId !== void 0 && consume !== void 0) consume(item.id, sessionId);
					},
					children: taken === item.id ? "已填进输入框" : `接着上次的题 · ${item.id}`
				}, item.id))
			});
		}
		//#endregion
		//#region src/client/handoff-api.ts
		/**
		* 浏览器半边的取数：只认 `/bank/api` 的两个动作。
		*
		* 失败一律退成「没有数据」——首页入口不画、卡片提示复制兜底，都不抛到会话里。
		* 路由缺席（headless profile）时同样走这里，于是整条链路自己消失。
		*/
		var API_ROOT = "/bank/api";
		/**
		* 发一个动作，取回它的 value。
		* @param method - 动作名（路由后缀）。
		* @param body - JSON 请求体。
		* @returns value，或 undefined（网络/状态/信封任一环不对）。
		*/
		async function post(method, body) {
			try {
				const response = await fetch(`${API_ROOT}/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body ?? {})
				});
				if (!response.ok) return void 0;
				const payload = await response.json();
				return payload.ok === true ? payload.value : void 0;
			} catch {
				return;
			}
		}
		/** 待接的交接；空数组表示没有、或这条通道不通。 */
		async function fetchPendingHandoffs() {
			return readPendingHandoffs(await post("handoff.pending", {}));
		}
		/**
		* 把一道交接标成「这个会话接走了」。
		* @param id - 题目 id。
		* @param sessionId - 接走它的会话 id。
		* @returns 是否真的写进去了；false 时这题还会出现在待接里。
		*/
		async function consumeHandoff(id, sessionId) {
			return await post("handoff.consume", {
				id,
				sessionId
			}) !== void 0;
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* 卡片的样式：演算纸。客户端构建面拿不到原生窗口的样式表，所以整段 CSS 由
		* `installHandoffStyles` 在注册时注入一次，类名前缀固定，退出时随 effect 清理。
		*/
		var CSS = `
.ile-handoff {
  margin: 14px 0;
  border-left: 2px solid #24436B;
  padding: 4px 0 4px 16px;
  font-size: 14px;
  line-height: 22px;
}
.ile-handoff__kicker { font-size: 12px; line-height: 18px; opacity: 0.62; }
.ile-handoff__statement {
  font-family: "ILE Song", SimSun, serif;
  font-size: 17px; line-height: 30px;
  margin: 4px 0 10px; white-space: pre-wrap;
}
.ile-handoff__quote {
  font-family: "ILE Kai", KaiTi, "楷体", serif;
  font-size: 16px; line-height: 28px; opacity: 0.86;
  margin: 0 0 6px;
}
.ile-handoff__label { font-size: 12px; line-height: 20px; opacity: 0.62; margin-right: 8px; }
.ile-handoff__next { margin: 0 0 12px; }
.ile-handoff__row { display: flex; align-items: center; gap: 12px; }
.ile-handoff__button {
  font: 500 13px/1 inherit; color: #FBFBF9; background: #24436B;
  border: 1px solid transparent; border-radius: 8px;
  padding: 0 12px; height: 28px; cursor: pointer;
}
.ile-handoff__button:focus-visible { outline: 2px solid #24436B; outline-offset: 2px; }
.ile-handoff__button:disabled { opacity: 0.6; cursor: progress; }
.ile-handoff__hint { font-size: 12px; line-height: 20px; opacity: 0.62; }
.ile-handoff__muted { font-size: 13px; line-height: 20px; opacity: 0.62; }
.ile-resume { display: flex; flex-wrap: wrap; gap: 8px; }
.ile-resume__chip {
  font: 500 12px/1 inherit; color: #24436B; background: #EAEFF5;
  border: 1px solid #D5D7D2; border-radius: 999px;
  padding: 0 10px; height: 26px; cursor: pointer;
}
.ile-resume__chip:hover { border-color: #24436B; }
.ile-resume__chip:focus-visible { outline: 2px solid #24436B; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .ile-handoff { border-left-color: #86ABD6; }
  .ile-handoff__button { color: #10161F; background: #86ABD6; }
  .ile-handoff__button:focus-visible { outline-color: #86ABD6; }
  .ile-resume__chip { color: #C6D8EE; background: #1E2836; border-color: #2A3441; }
  .ile-resume__chip:hover { border-color: #86ABD6; }
  .ile-resume__chip:focus-visible { outline-color: #86ABD6; }
}
`;
		/** 注入卡片与首页入口的样式，返回移除函数。 */
		function installHandoffStyles() {
			const element = document.createElement("style");
			element.textContent = CSS;
			element.dataset.ileHandoffStyles = "";
			document.head.appendChild(element);
			return () => {
				element.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Cordis 服务依赖：槽位表、会话、导航；输入面按可选服务取。 */
		var inject = [
			"slots",
			"sessions",
			"uiWorkspace"
		];
		/** 记住「这道交接上一次开的是哪个会话」，让重复点击变成跳转而不是再开一个。 */
		var RESUME_MEMO_PREFIX = "dsh-plugin-bankmanager:resume:";
		function memoRead(id) {
			try {
				return window.localStorage.getItem(RESUME_MEMO_PREFIX + id) ?? void 0;
			} catch {
				return;
			}
		}
		function memoWrite(id, sessionId) {
			try {
				window.localStorage.setItem(RESUME_MEMO_PREFIX + id, sessionId);
			} catch {}
		}
		/**
		* 等会话绑定落地。openSession 同步 retain，但生成物可能还在装配；
		* 这里只等一小会儿，等不到就放弃填草稿（学生自己打一句照样能接着做）。
		* @param sessions - 会话服务。
		* @param id - 刚打开/创建的会话。
		* @returns 绑定，或 undefined。
		*/
		async function bindingOf(sessions, id) {
			for (let attempt = 0; attempt < 5; attempt += 1) {
				const binding = sessions.binding(id);
				if (binding !== void 0) return binding;
				await new Promise((resolve) => {
					window.setTimeout(resolve, 20);
				});
			}
			return sessions.binding(id);
		}
		/**
		* 点「接着做」：开一个目标模式的新会话，把上次那道题（带状态）放进输入框，
		* 再把这题标成已被这个会话接走。已有会话就只跳转，不重开。
		* @param ctx - 浏览器根上下文。
		* @param view - 卡片上的交接。
		* @returns 三种结局，卡片按它选提示。
		*/
		async function openResume(ctx, view) {
			const sessions = ctx.get("sessions");
			const uiWorkspace = ctx.get("uiWorkspace");
			if (sessions === void 0) return "failed";
			const remembered = memoRead(view.id);
			if (remembered !== void 0 && sessions.list.getSnapshot().byId[remembered] !== void 0) {
				uiWorkspace?.openSession(remembered);
				return "opened";
			}
			const preset = presetForMode(view.to);
			let sessionId;
			try {
				sessionId = await sessions.create(preset === void 0 ? {} : { agentPreset: preset });
			} catch {
				return "failed";
			}
			memoWrite(view.id, sessionId);
			uiWorkspace?.openSession(sessionId);
			const conversation = ctx.get("conversation");
			if (conversation !== void 0) {
				const binding = await bindingOf(sessions, sessionId);
				if (binding !== void 0) try {
					conversation.input.requestDraftInitialization(binding, {
						prompt: resumeText(view),
						clearPreviousDraft: true
					});
				} catch {}
			}
			return await consumeHandoff(view.id, sessionId) ? "opened" : "opened-unconsumed";
		}
		/**
		* 注册题库的浏览器面：聊天里的交接卡片，和空白会话首页的「接着上次的题」。
		* @param ctx - 浏览器 Cordis 上下文。
		*/
		function apply(ctx) {
			ctx.effect(installHandoffStyles, "dsh-plugin-bankmanager: handoff card styles");
			ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "bank_resume",
				inject: () => ({ resume: (view) => openResume(ctx, view) })
			}, HandoffCard)), "dsh-plugin-bankmanager: bank_resume card");
			ctx.effect(() => ctx.slots.inject("conversation.hero.options", () => ctx.slots.register({
				name: "conversation.hero.options",
				id: "ile-resume",
				order: 20,
				inject: () => ({
					loadPending: fetchPendingHandoffs,
					consume: consumeHandoff
				})
			}, HeroResume)), "dsh-plugin-bankmanager: hero resume entry");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
