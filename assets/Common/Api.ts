import { postForm, getWithAuth, ApiEnvelope } from './Http';

/** 登录/注册成功后返回的用户信息（后端 data 字段） */
export interface AuthUser {
    /** 用户自增 ID */
    id: number;
    /** 用户名 */
    username: string;
    /** 登录令牌，后续请求需携带 */
    token: string;
}

/** user/info 返回的用户资料（fc_user_info 记录 + 后端合并的 fc_user 字段） */
export interface UserInfo {
    /** 用户名（后端从 fc_user 合并而来） */
    username?: string;
    /** 昵称/姓名 */
    name?: string;
    /** 其余字段（company/phone/email/balance/last_login_time 等）不做强约束 */
    [key: string]: unknown;
}

/**
 * 注册：用户名 + 密码。
 * 对应后端 POST /v1/user/register。
 */
export function register(
    username: string,
    password: string,
): Promise<ApiEnvelope<AuthUser>> {
    return postForm<AuthUser>('/v1/user/register', { username, password });
}

/**
 * 登录：用户名 + 密码。
 * 对应后端 POST /v1/user/login（device_type 缺省为 web，多端可同时在线）。
 */
export function login(
    username: string,
    password: string,
): Promise<ApiEnvelope<AuthUser>> {
    return postForm<AuthUser>('/v1/user/login', { username, password });
}

/**
 * 获取当前登录用户信息（校验登录态）。
 * 对应后端 GET /v1/user/info，需带 uid/token Header。
 * code=0 表示登录态有效；code=-1 表示未登录/登录态失效。
 */
export function userInfo(uid: string, token: string): Promise<ApiEnvelope<UserInfo>> {
    return getWithAuth<UserInfo>('/v1/user/info', { uid, token });
}
