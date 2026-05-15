const express = require("express");
const morgan = require("morgan");
const dotenv = require("dotenv");
const http = require("node:http");
const https = require("node:https");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(morgan("combined"));

function normalizeTargetUrl(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  let value = text.trim();
  if (!value) {
    return null;
  }

  // 兼容 /https:/example.com 这种被平台规范化后的形式
  value = value.replace(/^https:\/(?!\/)/i, "https://");
  value = value.replace(/^http:\/(?!\/)/i, "http://");

  if (!/^https?:\/\//i.test(value)) {
    return null;
  }

  return value;
}

function getTargetUrlText(req) {
  const queryUrl = normalizeTargetUrl(req.query?.url);
  if (queryUrl) {
    return queryUrl;
  }

  const withoutLeadingSlash = (req.path || "").replace(/^\/+/, "");
  return normalizeTargetUrl(withoutLeadingSlash);
}

app.all("*", (req, res) => {
  const targetUrlText = getTargetUrlText(req);
  if (!targetUrlText) {
    return res.status(400).json({
      message:
        "Missing target URL. Use ?url=https://example.com or /https://example.com"
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlText);
  } catch {
    return res.status(400).json({
      message: "Invalid target URL in request path"
    });
  }

  const headers = { ...req.headers };
  delete headers.host;
  headers.host = targetUrl.host;
  headers["x-forwarded-proxy"] = "transparent-forward-proxy";
  headers["x-forwarded-host"] = req.headers.host || "";

  const requester = targetUrl.protocol === "https:" ? https : http;
  const proxyReq = requester.request(
    targetUrl,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (typeof value !== "undefined") {
          res.setHeader(key, value);
        }
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({
        message: "Bad Gateway: proxy forward failed",
        error: err.message
      });
    }
  });

  req.pipe(proxyReq);
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log("Request format: /https://target-domain/path");
});
