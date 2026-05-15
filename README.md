# URL Path Forward Proxy (Node.js)

这个项目按你的需求实现：

- 用户请求：`http://你的服务器:3000/https://www.yyy.com/api/chat`
- 代理实际请求：`https://www.yyy.com/api/chat`
- 然后把响应状态码、响应头、响应体原样返回给用户

支持 GET/POST/PUT/DELETE 等方法，适用于 API、JS、CSS、图片、文件下载等 HTTP 内容透传。

## 1. 安装

```bash
npm install
```

## 2. 配置

```bash
copy .env.example .env
```

`.env`:

- `PORT=3000`

## 3. 启动

```bash
npm run dev
```

## 4. 调用方式

示例：

```text
http://212.21.33.1:3000/https://www.yyy.com/api/chat
```

带 query：

```text
http://212.21.33.1:3000/https://www.yyy.com/api/chat?room=1
```

POST 示例（curl）：

```bash
curl -X POST "http://212.21.33.1:3000/https://www.yyy.com/api/chat" ^
  -H "content-type: application/json" ^
  -d "{\"msg\":\"hello\"}"
```
