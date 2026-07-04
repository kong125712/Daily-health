import { networkInterfaces } from "node:os";
import { NextRequest } from "next/server";
import { handleRouteError, jsonOk, localeFromRequest } from "@/lib/server/http";
import type {
  RuntimeConnectionMode,
  RuntimeImageGenerationProvider,
  RuntimeStatusResponse
} from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

function requestProtocol(request: NextRequest): "http" | "https" {
  const forwarded = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwarded === "https") return "https";
  if (forwarded === "http") return "http";
  return request.nextUrl.protocol === "https:" ? "https" : "http";
}

function requestHost(request: NextRequest) {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    request.nextUrl.host
  );
}

function hostName(hostWithPort: string) {
  const host = hostWithPort.trim().toLowerCase();
  if (host.startsWith("[")) {
    const closeIndex = host.indexOf("]");
    return closeIndex > 0 ? host.slice(1, closeIndex) : host;
  }
  return host.replace(/:\d+$/, "");
}

function hostPort(hostWithPort: string) {
  const host = hostWithPort.trim();
  if (host.startsWith("[")) {
    const closeIndex = host.indexOf("]");
    const afterBracket = closeIndex >= 0 ? host.slice(closeIndex + 1) : "";
    const port = afterBracket.match(/^:(\d+)$/)?.[1];
    return port ?? "";
  }
  return host.match(/:(\d+)$/)?.[1] ?? "";
}

function isLoopbackHost(host: string) {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host.startsWith("127.")
  );
}

function isPrivateIpv4(host: string) {
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, aRaw, bRaw] = match;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function isPrivateHost(host: string) {
  return isPrivateIpv4(host) || host.endsWith(".local") || host.endsWith(".lan");
}

function connectionMode(host: string): RuntimeConnectionMode {
  if (isLoopbackHost(host)) return "loopback";
  if (isPrivateHost(host)) return "lan";
  return "public";
}

function recipeImageProvider(): RuntimeImageGenerationProvider {
  const provider = envValue("RECIPE_IMAGE_PROVIDER").toLowerCase();
  return provider === "disabled" || provider === "gemini" || provider === "local" || provider === "replicate" ? provider : "local";
}

function localImageApi(): "comfyui" | "sdwebui" {
  return envValue("LOCAL_IMAGE_API").toLowerCase() === "sdwebui" ? "sdwebui" : "comfyui";
}

function localImageEndpoint(api: "comfyui" | "sdwebui") {
  if (api === "sdwebui") {
    return (envValue("SD_WEBUI_URL") || "http://127.0.0.1:7860").replace(/\/+$/, "");
  }
  return (envValue("COMFYUI_URL") || "http://127.0.0.1:8188").replace(/\/+$/, "");
}

function lanOrigins(protocol: "http" | "https", port: string) {
  const portSuffix = port ? `:${port}` : "";
  const addresses = new Set<string>();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family === "IPv4" && !item.internal && isPrivateIpv4(item.address)) {
        addresses.add(`${protocol}://${item.address}${portSuffix}`);
      }
    }
  }
  return Array.from(addresses).slice(0, 5);
}

function imageGeneration() {
  const provider = recipeImageProvider();
  if (provider === "disabled") {
    return {
      provider,
      location: "disabled" as const,
      configured: true,
      requiresServerGpu: false,
      requiresInternet: false,
      localApi: null,
      endpoint: null,
      model: null
    };
  }
  if (provider === "gemini") {
    return {
      provider,
      location: "cloud" as const,
      configured: Boolean(envValue("GEMINI_API_KEY")),
      requiresServerGpu: false,
      requiresInternet: true,
      localApi: null,
      endpoint: null,
      model: envValue("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image"
    };
  }
  if (provider === "replicate") {
    return {
      provider,
      location: "cloud" as const,
      configured: Boolean(envValue("REPLICATE_API_TOKEN")),
      requiresServerGpu: false,
      requiresInternet: true,
      localApi: null,
      endpoint: null,
      model: envValue("REPLICATE_IMAGE_MODEL") || "black-forest-labs/flux-schnell"
    };
  }
  const api = localImageApi();
  return {
    provider,
    location: "server-local" as const,
    configured: true,
    requiresServerGpu: true,
    requiresInternet: false,
    localApi: api,
    endpoint: localImageEndpoint(api),
    model: envValue("COMFYUI_CHECKPOINT") || null
  };
}

function notes(mode: RuntimeConnectionMode, isHttps: boolean, provider: RuntimeImageGenerationProvider) {
  const notesEn: string[] = [];
  const notesZh: string[] = [];

  if (mode === "loopback") {
    notesEn.push("This server address works on this computer only. A real phone APK cannot reach 127.0.0.1 on your PC.");
    notesZh.push("这个服务器地址只适合这台电脑本机使用。真实手机 APK 不能连接电脑上的 127.0.0.1。");
    notesEn.push("For phone testing, run the server on 0.0.0.0 and use a LAN address such as http://192.168.x.x:3000.");
    notesZh.push("手机测试时，请让服务器监听 0.0.0.0，并在 APK 里使用类似 http://192.168.x.x:3000 的局域网地址。");
  } else if (mode === "lan") {
    notesEn.push("This looks like a LAN backend. Phone and PC must stay on the same Wi-Fi network.");
    notesZh.push("当前看起来是局域网后端。手机和电脑需要连接同一个 Wi-Fi。");
  } else {
    notesEn.push("This looks like a public backend address. It is the right shape for real users if the server is deployed and stable.");
    notesZh.push("当前看起来是公网后端地址。只要服务器稳定部署，就比较适合真实用户使用。");
  }

  if (!isHttps && mode === "public") {
    notesEn.push("Public production APKs should use HTTPS to avoid Android cleartext-network limits.");
    notesZh.push("公网正式 APK 建议使用 HTTPS，避免 Android 明文网络限制。");
  }

  if (provider === "local") {
    notesEn.push("Recipe image generation currently depends on the backend machine and its local GPU service.");
    notesZh.push("当前菜谱生图依赖后端那台电脑和它的本地 GPU 服务。");
  } else if (provider === "gemini" || provider === "replicate") {
    notesEn.push("Recipe image generation uses a cloud provider, so it can scale beyond this computer if the API quota is enough.");
    notesZh.push("当前菜谱生图使用云端服务，只要 API 额度足够，就不会绑定在这台电脑上。");
  }

  return { notesEn, notesZh };
}

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const protocol = requestProtocol(request);
    const hostWithPort = requestHost(request);
    const host = hostName(hostWithPort);
    const mode = connectionMode(host);
    const image = imageGeneration();
    const isHttps = protocol === "https";
    const state = mode === "loopback" || (mode === "public" && !isHttps) ? "warning" : "ok";
    const { notesEn, notesZh } = notes(mode, isHttps, image.provider);
    const response: RuntimeStatusResponse = {
      checkedAt: new Date().toISOString(),
      state,
      serverOrigin: `${protocol}://${hostWithPort}`,
      serverHost: host,
      protocol,
      connectionMode: mode,
      isHttps,
      isLoopback: mode === "loopback",
      isPrivateNetwork: mode === "lan",
      apkReachable: mode !== "loopback",
      lanOrigins: lanOrigins(protocol, hostPort(hostWithPort)),
      imageGeneration: image,
      notesEn,
      notesZh
    };
    return jsonOk(response);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}
