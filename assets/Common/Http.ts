import { API_BASE } from './Config';

/** 后端统一返回结构：{ code, data, echo } */
export interface ApiEnvelope<T = unknown> {
    /** 0 表示成功，非 0 表示失败 */
    code: number;
    /** 成功时的业务数据，失败时常为 [] */
    data: T;
    /** 提示文案（成功/失败信息） */
    echo: string;
}

/**
 * 发起 form-urlencoded 的 POST 请求。
 * 后端接口（gin）接收 application/x-www-form-urlencoded，与 Web 端保持一致。
 * @param path   接口路径，例如 /v1/user/register
 * @param params 表单键值对
 */
export function postForm<T = unknown>(
    path: string,
    params: Record<string, string>,
): Promise<ApiEnvelope<T>> {
    return new Promise<ApiEnvelope<T>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + path, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        const body = Object.keys(params)
            .map(
                (k) =>
                    `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`,
            )
            .join('&');

        xhr.onreadystatechange = (): void => {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText) as ApiEnvelope<T>);
                } catch (e) {
                    reject(new Error('返回数据解析失败: ' + xhr.responseText));
                }
            } else {
                reject(new Error(`网络错误 HTTP ${xhr.status}`));
            }
        };
        xhr.onerror = (): void => {
            reject(new Error('网络请求失败，请检查网络或服务器地址'));
        };

        xhr.send(body);
    });
}
