/**
 * 浏览器半边的数据通道：`/bank/api`。
 *
 * 客户端只认两个动作——列出待接的交接、把一道交接标成已被某个会话接走。
 * 走的是 host 插件注册 HTTP 前缀路由、浏览器侧 `fetch`，与 `dsh-plugin-memory`
 * 的面板同一条路（独立包生成不了 Typert 的 remote 产物）。信任围栏同 `/api`
 * 网关：只认 loopback / `trustedHosts`，拒绝 cross-site。
 *
 * 路由缺席时插件照常工作（工具才是主体）：headless profile 没有 `webServer`，
 * 那时只有卡片画不出来，模型侧一个字节都不少。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Mount the browser data channel.
 * @param ctx - profile-root context.
 * @param directory - bank directory the client reads and writes through this route.
 */
export declare function mountBankApi(ctx: Context, directory: string): void;
