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
const PROXY_CONTEXT_COOKIE = "__proxy_target_url";

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(morgan("combined"));

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) {
      return;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) {
      return;
    }

    cookies[key] = value;
  });

  return cookies;
}

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

function getRefererTargetUrlText(req) {
  const referer = req.get("referer") || req.get("referrer");
  if (!referer) {
    return null;
  }

  try {
    const refererUrl = new URL(referer);
    const refererTargetUrl = normalizeTargetUrl(refererUrl.searchParams.get("url"));
    if (!refererTargetUrl) {
      return null;
    }

    return refererTargetUrl;
  } catch {
    return null;
  }
}

function getCookieTargetUrlText(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const cookieValue = cookies[PROXY_CONTEXT_COOKIE];
  if (!cookieValue) {
    return null;
  }

  try {
    return normalizeTargetUrl(decodeURIComponent(cookieValue));
  } catch {
    return null;
  }
}

function getTargetUrlText(req) {
  const queryUrl = normalizeTargetUrl(req.query?.url);
  if (queryUrl) {
    return queryUrl;
  }

  const baseTargetUrl = getRefererTargetUrlText(req) || getCookieTargetUrlText(req);
  if (!baseTargetUrl) {
    return null;
  }

  try {
    return new URL(req.originalUrl, baseTargetUrl).href;
  } catch {
    return null;
  }
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

function setProxyHeader(res, key, value) {
  if (key.toLowerCase() !== "set-cookie") {
    res.setHeader(key, value);
    return;
  }

  const current = res.getHeader(key);
  const nextValues = Array.isArray(value) ? value : [value];
  if (!current) {
    res.setHeader(key, nextValues);
    return;
  }

  const currentValues = Array.isArray(current) ? current : [current];
  res.setHeader(key, [...currentValues, ...nextValues]);
}

function buildProxyUrl(req, targetUrl) {
  const protocol = req.protocol || req.headers["x-forwarded-proto"] || "http";
  const host = req.get("host");

  return `${protocol}://${host}/url?url=${encodeURIComponent(targetUrl.href)}`;
}

function rewriteRedirectLocation(req, currentTargetUrl, location) {
  if (!location || typeof location !== "string") {
    return location;
  }

  try {
    const nextTargetUrl = new URL(location, currentTargetUrl);
    if (nextTargetUrl.protocol !== "http:" && nextTargetUrl.protocol !== "https:") {
      return location;
    }

    return buildProxyUrl(req, nextTargetUrl);
  } catch {
    return location;
  }
}

function proxyRequest(req, res) {
  const hasExplicitTargetUrl = Boolean(normalizeTargetUrl(req.query?.url));
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

  if (!hasExplicitTargetUrl && (req.method === "GET" || req.method === "HEAD")) {
    return res.redirect(302, buildProxyUrl(req, targetUrl));
  }

  res.cookie(PROXY_CONTEXT_COOKIE, encodeURIComponent(targetUrl.href), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/"
  });

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

        if (key.toLowerCase() === "location") {
          res.setHeader(key, rewriteRedirectLocation(req, targetUrl, value));
          return;
        }

        setProxyHeader(res, key, value);
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

app.all("*", proxyRequest);

app.listen(PORT, () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log("Request format: /url?url=https%3A%2F%2Ftarget-domain%2Fpath");
});
