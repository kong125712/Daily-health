const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = 38000 + (process.pid % 1000);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-health-mobile-runtime-"));

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port, path: pathname, timeout: 1000 }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode, body }));
      })
      .on("error", reject)
      .on("timeout", function onTimeout() {
        this.destroy(new Error("Timed out waiting for mobile runtime gateway."));
      });
  });
}

async function waitForReady() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await request("/api/health");
      if (response.status === 200 && response.body.includes('"phase":"ready"')) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("Mobile runtime gateway did not become ready.");
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", resolve);
    child.kill();
  });
}

async function main() {
  const source = fs
    .readFileSync(path.join(root, "scripts", "mobile-runtime-bootstrap.js"), "utf8")
    .replaceAll("__DAILY_HEALTH_PORT__", String(port));
  write(path.join(tempDir, "index.js"), source);
  write(path.join(tempDir, "data", "daily-health-template.db"), "fixture");
  write(path.join(tempDir, "node_modules", "v8-compile-cache", "index.js"), "module.exports = {};\n");
  write(path.join(tempDir, "epicure-bridge.js"), "exports.startEpicureBridge = function startEpicureBridge() {};\n");
  write(
    path.join(tempDir, "server.js"),
    'const http = require("http"); http.createServer((request, response) => { if (request.url === "/api/health") { response.end("{\\"ok\\":true}"); return; } response.setHeader("Content-Type", "text/html"); response.end("<title>Daily Health</title>"); }).listen(Number(process.env.PORT), "127.0.0.1");\n'
  );

  const child = childProcess.spawn(process.execPath, ["index.js"], {
    cwd: tempDir,
    stdio: "pipe",
    env: { ...process.env, PORT: "", DAILY_HEALTH_DATA_DIR: path.join(tempDir, "persistent-data") }
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  try {
    await waitForReady();
    const page = await request("/");
    assert.equal(page.status, 200);
    assert.ok(page.body.includes("<title>Daily Health</title>"));
    console.log("mobile runtime gateway test passed");
  } finally {
    await stop(child);
    fs.rmSync(tempDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
