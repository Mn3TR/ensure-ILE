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
		function HandoffCard({ phase, block }) {
			if (phase !== "result") return null;
			const text = textOf(block);
			const view = text === void 0 ? void 0 : readHandoffView(text);
			if (view === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HandoffBody, { view });
		}
		function HandoffBody({ view }) {
			const [copied, setCopied] = (0, react.useState)(false);
			const copy = () => {
				const text = resumePrompt(view);
				navigator.clipboard?.writeText(text).then(() => {
					setCopied(true);
					window.setTimeout(() => {
						setCopied(false);
					}, 2400);
				}).catch(() => {
					setCopied(false);
				});
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
							onClick: copy,
							children: copied ? "已复制" : "接着做"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "ile-handoff__hint",
							children: copied ? "开个新会话，选「引导模式」，把这句话发出去。" : "复制这句话，新会话里直接发。"
						})]
					})
				]
			});
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
.ile-handoff__hint { font-size: 12px; line-height: 20px; opacity: 0.62; }
.ile-handoff__muted { font-size: 13px; line-height: 20px; opacity: 0.62; }
@media (prefers-color-scheme: dark) {
  .ile-handoff { border-left-color: #86ABD6; }
  .ile-handoff__button { color: #10161F; background: #86ABD6; }
  .ile-handoff__button:focus-visible { outline-color: #86ABD6; }
}
`;
		/** 注入卡片样式，返回移除函数。 */
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
		/** Cordis 服务依赖：只等槽位表本身。 */
		var inject = ["slots"];
		/** 注册题库的浏览器面：目前只有 `bank_resume` 的交接卡片。 @param ctx - 浏览器 Cordis 上下文。 */
		function apply(ctx) {
			ctx.effect(installHandoffStyles, "dsh-plugin-bankmanager: handoff card styles");
			ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "bank_resume"
			}, HandoffCard)), "dsh-plugin-bankmanager: bank_resume card");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
