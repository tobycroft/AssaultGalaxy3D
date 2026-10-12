import { postForm, ApiEnvelope } from './Http';

/** 登录/注册成功后返回的用户信息（后端 data 字段） */
export interface AuthUser {
    /** 用户自增 ID */
    id: number;
    /** 用户名 */
    username: string;
    /** 登录令牌，后续请求需携带 */
    token: string;
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
