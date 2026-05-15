const express = require("express");
const morgan = require("morgan");
const dotenv = require("dotenv");
const http = require("node:http");
const https = require("node:https");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_USER_AGENT =
  process.env.DEFAULT_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE = process.env.DEFAULT_ACCEPT_LANGUAGE || "en-US,en;q=0.9";

app.use(morgan("combined"));

function normalizeTargetUrl(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  let value = text.trim();
  if (!value) {
    return null;
  }

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
      message: "Missing target URL. Use ?url=https://example.com or /https://example.com"
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlText);
  } catch {
    return res.status(400).json({ message: "Invalid target URL" });
  }

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];
  headers.host = targetUrl.host;
  headers["user-agent"] = headers["user-agent"] || DEFAULT_USER_AGENT;
  headers["accept-language"] = headers["accept-language"] || DEFAULT_ACCEPT_LANGUAGE;
  headers["accept-encoding"] = headers["accept-encoding"] || "gzip, deflate, br";
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
        if (typeof value === "undefined") {
          return;
        }

        res.setHeader(key, value);
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
  console.log("Request format: /https://target-domain/path or /?url=https://target-domain/path");
});
