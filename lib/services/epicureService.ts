import type { EpicurePairingInput, RecognizedIngredientInput, RecipePreferenceInput } from "@/lib/types/domain";

type EpicureStatus = "connected" | "missing" | "failed";

type EpicureResult = {
  status: EpicureStatus;
  pairings: EpicurePairingInput[];
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dietaryConflict(name: string, preference: string) {
  const lower = `${name} ${preference}`.toLowerCase();
  if (preference === "No Beef") return lower.includes("beef");
  if (preference === "No Pork") return lower.includes("pork") || lower.includes("bacon");
  if (preference === "No Seafood") return lower.includes("shrimp") || lower.includes("fish") || lower.includes("seafood");
  if (preference === "Vegetarian") {
    return ["chicken", "beef", "pork", "fish", "shrimp", "seafood", "meat"].some((word) => lower.includes(word));
  }
  return false;
}

function collectPairingObjects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectPairingObjects);
  }
  if (!isObject(value)) {
    return [];
  }
  const likelyName =
    value.suggestedIngredient ??
    value.ingredient ??
    value.name ??
    value.target ??
    value.neighbor;
  if (asString(likelyName)) {
    return [value];
  }
  return Object.values(value).flatMap(collectPairingObjects);
}

function parseEventStreamPayload(raw: string): unknown {
  const dataLines = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (const line of dataLines.reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  throw new Error("Epicure MCP returned an unparseable event stream");
}

async function parseMcpResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const raw = await response.text();
    return parseEventStreamPayload(raw);
  }
  return response.json() as Promise<unknown>;
}

/**
 * MCP Streamable HTTP transport requires the client to negotiate both
 * application/json and text/event-stream, and to carry the session id
 * (returned by the server on `initialize`) on every subsequent request.
 * Sessions are cached per server process for the lifetime of the function,
 * and re-established transparently if the server rejects/expires one.
 */
let cachedSessionPromise: Promise<string> | null = null;

async function mcpRequest(
  baseUrl: string,
  body: Record<string, unknown>,
  sessionId?: string
): Promise<{ response: Response; sessionId: string | null }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream"
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000)
  });

  return { response, sessionId: response.headers.get("mcp-session-id") };
}

async function initializeSession(baseUrl: string): Promise<string> {
  const { response, sessionId } = await mcpRequest(baseUrl, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "daily-health", version: "1.0.0" }
    }
  });

  if (!response.ok) {
    throw new Error(`Epicure MCP initialize returned ${response.status}`);
  }
  if (!sessionId) {
    throw new Error("Epicure MCP initialize did not return a session id");
  }

  // Consume the initialize response body so the connection can be reused.
  await parseMcpResponse(response);

  // Per the MCP spec, the client should notify the server once initialized.
  // Some servers don't require this, but sending it is harmless and keeps
  // us compliant with stricter implementations.
  try {
    await mcpRequest(
      baseUrl,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sessionId
    );
  } catch {
    // Notifications are fire-and-forget; ignore failures here.
  }

  return sessionId;
}

async function getSessionId(baseUrl: string): Promise<string> {
  if (!cachedSessionPromise) {
    cachedSessionPromise = initializeSession(baseUrl).catch((error) => {
      cachedSessionPromise = null;
      throw error;
    });
  }
  return cachedSessionPromise;
}

async function callMcpTool(
  baseUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  retrying = false
): Promise<unknown> {
  const sessionId = await getSessionId(baseUrl);

  const { response } = await mcpRequest(
    baseUrl,
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    },
    sessionId
  );

  if (response.status === 400 || response.status === 404) {
    // Session likely expired or was rejected; re-initialize once and retry.
    if (!retrying) {
      cachedSessionPromise = null;
      return callMcpTool(baseUrl, toolName, args, true);
    }
  }

  if (!response.ok) {
    throw new Error(`Epicure MCP returned ${response.status}`);
  }

  return parseMcpResponse(response);
}

export async function getEpicurePairings(input: {
  ingredients: RecognizedIngredientInput[];
  preferences: RecipePreferenceInput;
}): Promise<EpicureResult> {
  const baseUrl = process.env.EPICURE_MCP_URL?.trim();
  if (!baseUrl) {
    return { status: "missing", pairings: [] };
  }

  try {
    const pairings: EpicurePairingInput[] = [];
    const seen = new Set<string>();
    const mainIngredients = input.ingredients.slice(0, 5);

    for (const ingredient of mainIngredients) {
      let raw: unknown = null;
      try {
        raw = await callMcpTool(baseUrl, "find_pairings", {
          ingredients: [ingredient.normalizedName]
        });
      } catch (error) {
        console.warn("Epicure tool find_pairings failed", error);
        try {
          raw = await callMcpTool(baseUrl, "neighbors", {
            ingredient: ingredient.normalizedName,
            top_k: 5
          });
        } catch (neighborError) {
          console.warn("Epicure tool neighbors failed", neighborError);
        }
      }

      for (const item of collectPairingObjects(raw).slice(0, 5)) {
        const suggested =
          asString(item.suggestedIngredient) ??
          asString(item.ingredient) ??
          asString(item.name) ??
          asString(item.target) ??
          asString(item.neighbor);
        if (!suggested || dietaryConflict(suggested, input.preferences.dietaryPreference)) {
          continue;
        }

        const key = `${ingredient.normalizedName}:${suggested.toLowerCase()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        pairings.push({
          sourceIngredient: ingredient.normalizedName,
          suggestedIngredient: suggested,
          score: asNumber(item.score),
          category: asString(item.category),
          reasonEn:
            asString(item.reasonEn) ??
            asString(item.reason) ??
            `${suggested} may pair well with ${ingredient.displayNameEn}.`,
          reasonZh:
            asString(item.reasonZh) ??
            `${suggested} 可以作为 ${ingredient.displayNameZh} 的风味搭配参考。`
        });
      }
    }

    return { status: "connected", pairings: pairings.slice(0, 20) };
  } catch (error) {
    console.error("Epicure MCP failed", error);
    return { status: "failed", pairings: [] };
  }
}
