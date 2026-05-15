# 接口中转服务

<p align="center">
  <img src="./assets/interface-proxy-hero.png" alt="接口中转服务功能介绍图" width="100%" />
</p>

<p align="center">
  <b>一个基于 Express 的 URL / API / 静态资源流式中转服务</b>
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-18a058?style=for-the-badge&logo=node.js&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4.x-111827?style=for-the-badge&logo=express&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-Ready-000000?style=for-the-badge&logo=vercel&logoColor=white" />
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/dapandocs/js-proxy">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

## 简介

接口中转服务会接收客户端请求，向目标 URL 发起服务端请求，并把目标站的状态码、响应头和响应体流式返回给客户端。

主入口：

```text
https://你的域名/url?url=https%3A%2F%2Fexample.com%2Fapi
```

适合中转 API、HTML、JS、CSS、图片、文件下载、视频流、SSE 等 HTTP 内容。请求体和响应体都通过流处理，避免大文件或长连接内容被一次性读入内存。

## 功能特性

- `URL 中转`：通过 `/url?url=...` 转发任意 `http` / `https` 目标地址。
- `多方法支持`：支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS` 等方法。
- `流式响应`：适配图片、文件、视频流、SSE、长连接等响应类型。
- `响应头透传`：保留目标站状态码和主要响应头，自动清理 hop-by-hop headers。
- `跳转改写`：自动把上游 `Location` 改写回代理地址，减少浏览器直接跳到目标站。
- `相对路径兜底`：对页面内相对路径请求，尝试通过 `Referer`、上下文 cookie 或已知路径继续中转。
- `Vercel 友好`：保留 `npm start`，可直接部署到 Vercel Node.js 环境。

## 快速开始

```bash
npm install
npm run dev
```

默认监听：

```text
http://localhost:3000
```

访问示例：

```text
http://localhost:3000/url?url=https%3A%2F%2Fwww.baidu.com%2F
```

目标 URL 自身带 query 参数时，必须先 URL encode：

```text
http://localhost:3000/url?url=https%3A%2F%2Fexample.com%2Fapi%3Fa%3D1%26b%3D2
```

## POST 示例

```bash
curl -X POST "http://localhost:3000/url?url=https%3A%2F%2Fhttpbin.org%2Fpost" \
  -H "content-type: application/json" \
  -d "{\"msg\":\"hello\"}"
```

PowerShell：

```powershell
curl.exe -X POST "http://localhost:3000/url?url=https%3A%2F%2Fhttpbin.org%2Fpost" `
  -H "content-type: application/json" `
  -d "{\"msg\":\"hello\"}"
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `PROXY_TIMEOUT_MS` | `60000` | 上游请求超时时间，单位毫秒；设为 `0` 表示不主动超时 |
| `DEFAULT_USER_AGENT` | Chrome UA | 客户端未传 `user-agent` 时使用 |
| `DEFAULT_ACCEPT_LANGUAGE` | `en-US,en;q=0.9` | 客户端未传 `accept-language` 时使用 |

## 如何 Fork

1. 打开本项目的 GitHub 仓库页面。
2. 点击右上角 `Fork`。
3. 选择你的 GitHub 账号或组织。
4. Fork 完成后，进入你自己的仓库。
5. 克隆到本地：

```bash
git clone https://github.com/你的用户名/你的仓库名.git
cd 你的仓库名
npm install
npm run dev
```

## 一键部署到 Vercel

如果你的仓库已经推送到 GitHub，可以直接使用 Vercel 导入部署。

### 方式一：Deploy Button

直接点击本文档顶部的 `Deploy with Vercel` 按钮，或打开：

```text
https://vercel.com/new/clone?repository-url=https://github.com/dapandocs/js-proxy
```

如果你 Fork 后想部署自己的仓库，把下面链接中的 `你的用户名/你的仓库名` 替换成你的 GitHub 仓库路径：

```text
https://vercel.com/new/clone?repository-url=https://github.com/你的用户名/你的仓库名
```

也可以在 README 里放置按钮：

```markdown
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/你的用户名/你的仓库名)
```

### 方式二：Vercel 控制台

1. 登录 [Vercel](https://vercel.com)。
2. 点击 `Add New...`，选择 `Project`。
3. 选择你 Fork 后的 GitHub 仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空或使用默认值。
6. Install Command 使用 `npm install`。
7. Start Command 使用 `npm start`。
8. 点击 `Deploy`。

部署完成后，请使用 Vercel 给出的域名访问：

```text
https://你的项目.vercel.app/url?url=https%3A%2F%2Fwww.baidu.com%2F
```

## 错误返回

- `400`：缺少 `url`、URL 无效，或协议不是 `http` / `https`。
- `502`：上游请求失败。
- `504`：上游请求超时。

## 注意事项

本服务默认完全开放，不做 token 或域名白名单限制。公网部署时建议在外层使用防火墙、Nginx、CDN、Vercel Protection 或其他访问控制策略。

服务会改写 HTTP 跳转响应头，并支持基于 `Referer` 和上下文 cookie 的相对路径转发；但它不是完整浏览器代理，不会深度改写 HTML、JS、CSS 里的所有资源地址和脚本跳转。

## License

MIT
