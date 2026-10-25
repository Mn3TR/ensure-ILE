/**
 * 卡片的样式：演算纸。客户端构建面拿不到原生窗口的样式表，所以整段 CSS 由
 * `installHandoffStyles` 在注册时注入一次，类名前缀固定，退出时随 effect 清理。
 */
const CSS = `
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
export function installHandoffStyles(): () => void {
  const element = document.createElement('style')
  element.textContent = CSS
  element.dataset.ileHandoffStyles = ''
  document.head.appendChild(element)
  return () => { element.remove() }
}
