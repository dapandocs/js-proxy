const express = require("express");
const morgan = require("morgan");
const dotenv = require("dotenv");
const http = require("node:http");
const https = require("node:https");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 60000);
const DEFAULT_USER_AGENT =
  process.env.DEFAULT_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE = process.env.DEFAULT_ACCEPT_LANGUAGE || "en-US,en;q=0.9";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

app.disable("x-powered-by");
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
  return normalizeTargetUrl(req.query?.url);
}

function stripHopByHopHeaders(headers) {
  const cleaned = {};
  const connectionTokens = String(headers.connection || "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const blockedHeaders = new Set([...HOP_BY_HOP_HEADERS, ...connectionTokens]);

  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "undefined" || blockedHeaders.has(key.toLowerCase())) {
      return;
    }
    cleaned[key] = value;
  });

  return cleaned;
}

function sendJsonError(res, statusCode, message, details) {
  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json({
    message,
    ...(details ? { details } : {})
  });
}

function proxyRequest(req, res) {
  const targetUrlText = getTargetUrlText(req);
  if (!targetUrlText) {
    return sendJsonError(res, 400, "Missing target URL. Use /url?url=https%3A%2F%2Fexample.com%2F");
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlText);
  } catch {
    return sendJsonError(res, 400, "Invalid target URL");
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return sendJsonError(res, 400, "Only http and https URLs are supported");
  }

  const headers = stripHopByHopHeaders(req.headers);
  delete headers.host;
  headers.host = targetUrl.host;
  headers["user-agent"] = headers["user-agent"] || DEFAULT_USER_AGENT;
  headers["accept-language"] = headers["accept-language"] || DEFAULT_ACCEPT_LANGUAGE;
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

      Object.entries(stripHopByHopHeaders(proxyRes.headers)).forEach(([key, value]) => {
        if (typeof value === "undefined") {
          return;
        }

        res.setHeader(key, value);
      });

      proxyRes.pipe(res);
    }
  );

  if (PROXY_TIMEOUT_MS > 0) {
    proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
      proxyReq.destroy(new Error(`Upstream request timed out after ${PROXY_TIMEOUT_MS}ms`));
    });
  }

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (err.message.includes("timed out")) {
      return sendJsonError(res, 504, "Gateway Timeout: upstream request timed out", err.message);
    }
    return sendJsonError(res, 502, "Bad Gateway: proxy forward failed", err.message);
  });

  req.on("aborted", () => {
    proxyReq.destroy(new Error("Client aborted the request"));
  });

  req.pipe(proxyReq);
}

app.all("/url", proxyRequest);

app.use((req, res) => {
  res.status(404).json({
    message: "Not found. Use /url?url=https%3A%2F%2Fexample.com%2F"
  });
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log("Request format: /url?url=https%3A%2F%2Ftarget-domain%2Fpath");
});
