"use strict";

// Node.js for Mobile does not resolve the node: protocol used by newer Next.js
// builds. Translate it before loading any bundled server dependency.
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveNodeProtocol(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("node:")) {
    request = request.slice(5);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const fs = require("fs");
const http = require("http");
const path = require("path");

const gatewayPort = Number(process.env.PORT || "__DAILY_HEALTH_PORT__");
const host = "127.0.0.1";
const epicureBridgePort = Number(process.env.DAILY_HEALTH_EPICURE_PORT || gatewayPort + 1);
const nextPort = Number(process.env.DAILY_HEALTH_NEXT_PORT || gatewayPort + 2);
const dataDir = process.env.DAILY_HEALTH_DATA_DIR || process.env.DATADIR || path.resolve(__dirname, "..", "daily-health-data");
const templateDb = path.join(__dirname, "data", "daily-health-template.db");
const databasePath = path.join(dataDir, "daily-health.db");

const startup = {
  phase: "starting",
  message: "Preparing the local Daily Health service."
};

function safeMessage(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n]+/g, " ").slice(0, 700);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function failStartup(error) {
  if (startup.phase === "failed") return;
  startup.phase = "failed";
  startup.message = safeMessage(error);
  console.error("[DailyHealth] Embedded Next server failed:", error);
}

function json(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(body);
}

function startupPage() {
  const failed = startup.phase === "failed";
  const title = failed ? "Daily Health could not start" : "Starting Daily Health";
  const message = escapeHtml(startup.message);
  const retry = failed
    ? ""
    : "<script>window.setTimeout(function () { window.location.reload(); }, 700);</script>";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6faf7;color:#17211c;font-family:system-ui,-apple-system,sans-serif}main{width:min(88vw,360px);text-align:center}.mark{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 18px;border-radius:8px;background:#34785f;color:#fff;font-size:30px;font-weight:800}h1{font-size:24px;margin:0 0 12px}p{line-height:1.6;color:#52645b}.bar{height:4px;background:#dcece5;overflow:hidden;border-radius:999px}.bar:before{content:\"\";display:block;width:45%;height:100%;background:#34785f;animation:load 1.2s ease-in-out infinite}@keyframes load{from{transform:translateX(-100%)}to{transform:translateX(230%)}}.error{color:#8f314d;font-weight:600}</style></head><body><main><div class="mark">D</div><h1>${title}</h1><p class="${failed ? "error" : ""}">${message}</p>${failed ? "" : "<div class=\"bar\"></div>"}</main>${retry}</body></html>`;
}

function copyDatabaseTemplate() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(databasePath) && fs.statSync(databasePath).size > 0) return;
  if (!fs.existsSync(templateDb)) {
    throw new Error("Missing bundled SQLite template database.");
  }
  fs.copyFileSync(templateDb, databasePath);
}

function proxyToNext(request, response) {
  const headers = { ...request.headers, host: `${host}:${nextPort}` };
  delete headers.connection;

  const upstream = http.request(
    {
      hostname: host,
      port: nextPort,
      path: request.url,
      method: request.method,
      headers
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders.connection;
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(response);
    }
  );

  upstream.on("error", (error) => {
    if (startup.phase === "ready") {
      failStartup(error);
    }
    if (!response.headersSent) {
      response.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    }
    response.end(startupPage());
  });

  request.pipe(upstream);
}

function checkNextReady() {
  if (startup.phase !== "starting") return;

  const request = http.get(
    { hostname: host, port: nextPort, path: "/api/health", timeout: 800 },
    (response) => {
      response.resume();
      if (response.statusCode === 200) {
        startup.phase = "ready";
        startup.message = "Local Daily Health service is ready.";
        console.log("[DailyHealth] Embedded Next server is ready.");
        return;
      }
      scheduleNextCheck();
    }
  );

  request.on("timeout", () => request.destroy());
  request.on("error", scheduleNextCheck);
}

function scheduleNextCheck() {
  if (startup.phase === "starting") {
    setTimeout(checkNextReady, 250);
  }
}

function startNext() {
  try {
    copyDatabaseTemplate();
    process.env.V8_COMPILE_CACHE_CACHE_DIR = path.join(dataDir, ".v8-compile-cache");
    require("v8-compile-cache");

    process.env.NODE_ENV = "production";
    process.env.PORT = String(nextPort);
    process.env.HOSTNAME = host;
    process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${databasePath}`;
    process.env.NEXT_TELEMETRY_DISABLED = "1";

    require("./epicure-bridge.js").startEpicureBridge({ host, port: epicureBridgePort });
    require("./server.js");
    checkNextReady();
  } catch (error) {
    failStartup(error);
  }
}

process.on("uncaughtException", failStartup);
process.on("unhandledRejection", failStartup);

const gateway = http.createServer((request, response) => {
  if (request.url === "/api/health") {
    json(response, 200, { ok: true, phase: startup.phase, message: startup.message });
    return;
  }

  if (startup.phase === "ready") {
    proxyToNext(request, response);
    return;
  }

  if (request.url && request.url.startsWith("/api/")) {
    json(response, 503, { ok: false, code: "LOCAL_SERVER_STARTING", message: startup.message });
    return;
  }

  response.writeHead(startup.phase === "failed" ? 500 : 200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(startupPage());
});

gateway.on("error", failStartup);
gateway.listen(gatewayPort, host, () => {
  console.log(`[DailyHealth] Local startup gateway listening on ${host}:${gatewayPort}.`);
  startNext();
});
