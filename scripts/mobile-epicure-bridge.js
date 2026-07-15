"use strict";

const http = require("http");
const { randomUUID } = require("crypto");

const defaultEpicureMcpUrl = process.env.EPICURE_MCP_URL?.trim() || "https://epicure-mcp.kaikaku.ai/mcp";
const requestTimeoutMs = 8000;
let cachedSessionPromise = null;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dietaryConflict(name, preference) {
  const lower = `${name} ${preference}`.toLowerCase();
  if (preference === "No Beef") return lower.includes("beef");
  if (preference === "No Pork") return lower.includes("pork") || lower.includes("bacon");
  if (preference === "No Seafood") return lower.includes("shrimp") || lower.includes("fish") || lower.includes("seafood");
  if (preference === "Vegetarian") {
    return ["chicken", "beef", "pork", "fish", "shrimp", "seafood", "meat"].some((word) => lower.includes(word));
  }
  return false;
}

function collectPairingObjects(value) {
  if (Array.isArray(value)) return value.flatMap(collectPairingObjects);
  if (!isObject(value)) return [];
  const likelyName = value.suggestedIngredient ?? value.ingredient ?? value.name ?? value.target ?? value.neighbor;
  return asString(likelyName) ? [value] : Object.values(value).flatMap(collectPairingObjects);
}

function parseEventStreamPayload(raw) {
  const dataLines = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (const line of dataLines.reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // Continue until a JSON-RPC event can be parsed.
    }
  }
  throw new Error("Epicure MCP returned an unparseable event stream.");
}

async function parseMcpResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return parseEventStreamPayload(await response.text());
  }
  return response.json();
}

async function mcpRequest(baseUrl, body, sessionId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream"
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return { response, sessionId: response.headers.get("mcp-session-id") };
  } finally {
    clearTimeout(timeout);
  }
}

async function initializeSession(baseUrl) {
  const { response, sessionId } = await mcpRequest(baseUrl, {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "daily-health-mobile", version: "1.0.0" }
    }
  });

  if (!response.ok) throw new Error(`Epicure MCP initialize returned ${response.status}.`);
  if (!sessionId) throw new Error("Epicure MCP initialize did not return a session id.");
  await parseMcpResponse(response);

  try {
    await mcpRequest(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  } catch {
    // This notification is optional for the current Epicure service.
  }

  return sessionId;
}

async function getSessionId(baseUrl) {
  if (!cachedSessionPromise) {
    cachedSessionPromise = initializeSession(baseUrl).catch((error) => {
      cachedSessionPromise = null;
      throw error;
    });
  }
  return cachedSessionPromise;
}

async function callMcpTool(baseUrl, toolName, args, retrying = false) {
  const sessionId = await getSessionId(baseUrl);
  const { response } = await mcpRequest(
    baseUrl,
    {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name: toolName, arguments: args }
    },
    sessionId
  );

  if ((response.status === 400 || response.status === 404) && !retrying) {
    cachedSessionPromise = null;
    return callMcpTool(baseUrl, toolName, args, true);
  }
  if (!response.ok) throw new Error(`Epicure MCP returned ${response.status}.`);
  return parseMcpResponse(response);
}

async function getPairings(input) {
  const ingredients = Array.isArray(input.ingredients) ? input.ingredients.slice(0, 5) : [];
  const preferences = isObject(input.preferences) ? input.preferences : {};
  const dietaryPreference = asString(preferences.dietaryPreference) || "No Preference";
  const pairings = [];
  const seen = new Set();

  for (const ingredient of ingredients) {
    if (!isObject(ingredient)) continue;
    const normalizedName = asString(ingredient.normalizedName);
    if (!normalizedName) continue;
    let raw = null;
    try {
      raw = await callMcpTool(defaultEpicureMcpUrl, "find_pairings", { ingredients: [normalizedName] });
    } catch (error) {
      console.warn("Epicure find_pairings failed; trying neighbors.", error instanceof Error ? error.message : error);
      try {
        raw = await callMcpTool(defaultEpicureMcpUrl, "neighbors", { ingredient: normalizedName, top_k: 5 });
      } catch (neighborError) {
        console.warn("Epicure neighbors failed.", neighborError instanceof Error ? neighborError.message : neighborError);
      }
    }

    for (const item of collectPairingObjects(raw).slice(0, 5)) {
      const suggestedIngredient = asString(item.suggestedIngredient) || asString(item.ingredient) || asString(item.name) || asString(item.target) || asString(item.neighbor);
      if (!suggestedIngredient || dietaryConflict(suggestedIngredient, dietaryPreference)) continue;
      const key = `${normalizedName}:${suggestedIngredient.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      pairings.push({
        sourceIngredient: normalizedName,
        suggestedIngredient,
        score: asNumber(item.score),
        category: asString(item.category),
        reasonEn: asString(item.reasonEn) || asString(item.reason) || `${suggestedIngredient} may pair well with ${asString(ingredient.displayNameEn) || normalizedName}.`,
        reasonZh: asString(item.reasonZh) || `${suggestedIngredient} can be used as a flavor pairing reference for ${asString(ingredient.displayNameZh) || normalizedName}.`
      });
    }
  }

  return { status: "connected", pairings: pairings.slice(0, 20) };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 128 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function startEpicureBridge({ host, port }) {
  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }
    if (request.method !== "POST" || request.url !== "/epicure-pairings") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    try {
      const input = await readBody(request);
      const result = await getPairings(input);
      sendJson(response, 200, result);
    } catch (error) {
      console.warn("Epicure mobile bridge failed.", error instanceof Error ? error.message : error);
      sendJson(response, 503, { status: "failed", pairings: [] });
    }
  });

  server.on("error", (error) => {
    console.warn("Epicure mobile bridge could not start.", error.message);
  });
  server.listen(port, host, () => {
    console.log(`Epicure mobile bridge listening on http://${host}:${port}.`);
  });
  return server;
}

module.exports = { startEpicureBridge };
