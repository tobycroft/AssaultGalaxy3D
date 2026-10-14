import { postForm, get, getWithAuth, ApiEnvelope } from './Http';

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

/** 新闻列表项（对应后端 ag_news，列表接口不含 content） */
export interface NewsItem {
    /** 新闻 ID，详情接口用它换取正文 */
    id: number;
    /** 标题 */
    title: string;
    /** 列表摘要 */
    summary: string;
    /** 发布时间（后端 time.Time 序列化，ISO8601 格式字符串） */
    publish_time: string;
}

/** 新闻详情（含富文本正文 content） */
export interface NewsDetail extends NewsItem {
    /** 富文本正文 */
    content: string;
}

/** /v1/news/list 的 data 结构 */
export interface NewsListData {
    /** 当前页数据 */
    list: NewsItem[];
    /** 已发布新闻总数 */
    total: number;
    /** 当前页码 */
    page: number;
    /** 每页数量 */
    page_size: number;
}

/**
 * 获取新闻列表（公开接口，无需登录）。
 * 对应后端 GET /v1/news/list，只返回已发布（status=1）的新闻，不含正文。
 */
export function newsList(page = 1, pageSize = 10): Promise<ApiEnvelope<NewsListData>> {
    return get<NewsListData>('/v1/news/list', { page, page_size: pageSize });
}

/**
 * 获取新闻详情（公开接口，无需登录）。
 * 对应后端 GET /v1/news/detail，code=0 成功；code=404 表示新闻不存在或未发布。
 */
export function newsDetail(id: number): Promise<ApiEnvelope<NewsDetail>> {
    return get<NewsDetail>('/v1/news/detail', { id });
}
