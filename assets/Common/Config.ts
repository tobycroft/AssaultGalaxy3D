/**
 * 全局配置：后端服务地址。
 * 后端（Go）通过反代在 :433 提供 HTTPS，游戏内所有接口都基于此地址拼接。
 * 后续接入 WebSocket 时同样复用该域名（wss://ag.tuuz.fun:433）。
 */
export const API_BASE = 'https://ag.tuuz.fun:433';
