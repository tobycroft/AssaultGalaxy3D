import { sys } from 'cc';

/** 登录态持久化的 localStorage key（与 SettingsStore 同风格，单 key 或多 key 均可） */
const TOKEN_KEY = 'ag_token';
const USER_KEY = 'ag_username';

/**
 * 登录会话管理：保存/读取 token 与用户名，供后续游戏内接口鉴权使用。
 * 存储沿用项目既有方案 sys.localStorage（SettingsStore 同理）。
 */
export class Session {
    /** 读取登录令牌 */
    public static getToken(): string {
        return sys.localStorage.getItem(TOKEN_KEY) || '';
    }

    /** 写入 / 清除登录令牌 */
    public static setToken(token: string): void {
        if (token) sys.localStorage.setItem(TOKEN_KEY, token);
        else sys.localStorage.removeItem(TOKEN_KEY);
    }

    /** 读取当前用户名 */
    public static getUsername(): string {
        return sys.localStorage.getItem(USER_KEY) || '';
    }

    /** 写入 / 清除用户名 */
    public static setUsername(username: string): void {
        if (username) sys.localStorage.setItem(USER_KEY, username);
        else sys.localStorage.removeItem(USER_KEY);
    }

    /** 是否已登录（存在有效 token） */
    public static isLoggedIn(): boolean {
        return this.getToken().length > 0;
    }

    /** 登录成功后一次性保存 token 与用户名 */
    public static save(session: { username: string; token: string }): void {
        this.setToken(session.token);
        this.setUsername(session.username);
    }

    /** 退出登录，清空本地会话 */
    public static clear(): void {
        this.setToken('');
        this.setUsername('');
    }
}
