# Express URL 中转服务

一个基于 Express 的流式 URL 中转服务。客户端请求本服务的 `/url?url=...`，服务端请求目标地址，并把目标站的状态码、响应头和响应体返回给客户端。

支持 HTML、JS、CSS、图片、文件下载、视频流、SSE，以及 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS` 等 HTTP 方法。

如果目标站返回 `301/302/307/308` 跳转，服务会把 `Location` 改写成本代理的 `/url?url=...` 地址，避免浏览器直接跳到目标站。

如果页面里的表单或链接使用相对路径，例如 Google 搜索表单提交到 `/search?q=egg`，服务会根据浏览器发送的 `Referer` 自动推导原始目标站，把请求转发到 `https://www.google.com/search?q=egg`。

如果浏览器没有发送完整 `Referer`，服务会使用代理上下文 cookie 继续推导目标站；对 Google 搜索的 `/search?q=...` 也内置了兜底转发到 `https://www.google.com/search?q=...`。

## 安装

```bash
npm install
```

## 启动

```bash
npm run dev
```

默认监听：

```text
http://0.0.0.0:3000
```

## 调用方式

目标 URL 建议先 URL encode，尤其是目标 URL 自己带 query 参数时。

```text
http://localhost:3000/url?url=https%3A%2F%2Fwww.baidu.com%2F
```

未编码的简单 URL 通常也可以：

```text
http://localhost:3000/url?url=https://www.baidu.com/
```

如果目标地址带参数，请使用编码后的 URL：

```text
http://localhost:3000/url?url=https%3A%2F%2Fexample.com%2Fapi%3Fa%3D1%26b%3D2
```

## POST 示例

```bash
curl -X POST "http://localhost:3000/url?url=https%3A%2F%2Fhttpbin.org%2Fpost" \
  -H "content-type: application/json" \
  -d "{\"msg\":\"hello\"}"
```

Windows PowerShell:

```powershell
curl.exe -X POST "http://localhost:3000/url?url=https%3A%2F%2Fhttpbin.org%2Fpost" `
  -H "content-type: application/json" `
  -d "{\"msg\":\"hello\"}"
```

## 配置

可以通过环境变量配置：

```text
PORT=3000
PROXY_TIMEOUT_MS=60000
DEFAULT_USER_AGENT=Mozilla/5.0 ...
DEFAULT_ACCEPT_LANGUAGE=zh-CN,zh;q=0.9,en;q=0.8
```

说明：

- `PORT`：监听端口。
- `PROXY_TIMEOUT_MS`：上游请求超时时间，单位毫秒；设为 `0` 表示不主动设置超时。
- `DEFAULT_USER_AGENT`：客户端没有传 `user-agent` 时使用的默认值。
- `DEFAULT_ACCEPT_LANGUAGE`：客户端没有传 `accept-language` 时使用的默认值。

## 注意

本服务会改写 HTTP 跳转响应头，并支持基于 `Referer` 的相对路径转发，但不会改写 HTML、JS、CSS 内容里的资源地址或脚本跳转。如果目标网页内部通过 JavaScript 跳转，或者页面资源写死为原站绝对地址，浏览器仍可能直接请求原站。

## 部署

生产环境可以直接运行：

```bash
npm start
```

如果前面有 Nginx，可以把公网域名反代到本服务端口。该服务按你的需求默认完全开放，不做 token 或域名白名单限制；公网部署时建议在外层用防火墙、Nginx、CDN 或访问控制限制可访问范围。

## 错误返回

- `400`：缺少 `url`、URL 无效，或协议不是 `http`/`https`。
- `404`：访问了 `/url` 之外的路径。
- `502`：上游请求失败。
- `504`：上游请求超时。
