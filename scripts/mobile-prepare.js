/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const outputDir = path.join(root, "mobile-web", "nodejs");
const schemaDir = path.join(root, "database");
const schemaPath = path.join(schemaDir, "schema.prisma");
const sizeLimitBytes = 200 * 1024 * 1024;
const requiredRuntimePackages = ["styled-jsx", "client-only", "@swc/helpers"];

function assertDirectory(dir, message) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(message);
  }
}

function findFiles(dir, fileName, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, fileName, result);
    } else if (entry.isFile() && entry.name === fileName) {
      result.push(fullPath);
    }
  }
  return result;
}

function copyEntry(source, target, stack = new Set()) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    copyDirectory(source, target, stack);
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function copyDirectory(source, target, stack = new Set()) {
  const realSource = fs.realpathSync(source);
  if (stack.has(realSource)) {
    return;
  }
  stack.add(realSource);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) {
      copyEntry(fs.realpathSync(from), to, stack);
    } else if (entry.isDirectory()) {
      copyDirectory(from, to, stack);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
  stack.delete(realSource);
}

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true, recursive: true });
  }
}

function readPackageName(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).name;
  } catch {
    return null;
  }
}

function findPackageRoot(packageName) {
  const candidates = [];

  try {
    candidates.push(path.dirname(require.resolve(`${packageName}/package.json`, { paths: [root] })));
  } catch {
    // Some packages intentionally hide package.json behind exports.
  }

  try {
    candidates.push(path.dirname(require.resolve(packageName, { paths: [root] })));
  } catch {
    // Keep the final error focused on the package root lookup.
  }

  for (const candidate of candidates) {
    let current = candidate;
    while (current !== path.dirname(current)) {
      const packageJsonPath = path.join(current, "package.json");
      if (fs.existsSync(packageJsonPath) && readPackageName(packageJsonPath) === packageName) {
        return current;
      }
      current = path.dirname(current);
    }
  }

  throw new Error(`Unable to locate package root for ${packageName}.`);
}

function directorySize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(fullPath);
    } else if (entry.isFile()) {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function sqliteUrlFromSchemaDir(databasePath) {
  const relative = toPosix(path.relative(schemaDir, databasePath));
  return `file:${relative.startsWith(".") ? relative : `./${relative}`}`;
}

function runPrismaDbPush(templatePath) {
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) return false;

  const result = spawnSync(
    process.execPath,
    [prismaCli, "db", "push", "--schema", schemaPath, "--skip-generate"],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: sqliteUrlFromSchemaDir(templatePath)
      },
      stdio: "inherit"
    }
  );

  return result.status === 0 && fs.existsSync(templatePath) && fs.statSync(templatePath).size > 0;
}

function sanitizeCopiedTemplate(templatePath) {
  const sanitizer = `
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function quoteIdentifier(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function main() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  const tables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'"
  );
  for (const table of tables) {
    await prisma.$executeRawUnsafe("DELETE FROM " + quoteIdentifier(table.name));
  }
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
`;

  const result = spawnSync(process.execPath, ["-e", sanitizer], {
    cwd: schemaDir,
    env: {
      ...process.env,
      DATABASE_URL: sqliteUrlFromSchemaDir(templatePath)
    },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Failed to sanitize copied mobile SQLite template.");
  }
}

function createDatabaseTemplate() {
  const templateDir = path.join(outputDir, "data");
  const templatePath = path.join(templateDir, "daily-health-template.db");
  const fallbackDbPath = path.join(schemaDir, "daily-health.db");

  assertDirectory(schemaDir, "Missing database schema directory.");
  if (!fs.existsSync(schemaPath)) {
    throw new Error("Missing database/schema.prisma.");
  }

  fs.mkdirSync(templateDir, { recursive: true });
  removeIfExists(templatePath);

  if (!runPrismaDbPush(templatePath)) {
    if (!fs.existsSync(fallbackDbPath)) {
      throw new Error("Failed to create a fresh mobile SQLite template, and database/daily-health.db is not available as a fallback.");
    }
    console.warn("Prisma db push failed; copying and sanitizing database/daily-health.db as the mobile template.");
    fs.copyFileSync(fallbackDbPath, templatePath);
    sanitizeCopiedTemplate(templatePath);
  }

  if (!fs.existsSync(templatePath) || fs.statSync(templatePath).size === 0) {
    throw new Error("Prisma did not create a usable mobile SQLite template.");
  }
}

function writeBootstrap() {
  const bootstrap = `const Module = require("module");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveNodeProtocol(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("node:")) {
    request = request.slice(5);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const fs = require("fs");
const path = require("path");

const port = process.env.PORT || "34189";
const host = "127.0.0.1";
const dataDir = process.env.DAILY_HEALTH_DATA_DIR || path.resolve(__dirname, "..", "daily-health-data");
const templateDb = path.join(__dirname, "data", "daily-health-template.db");
const databasePath = path.join(dataDir, "daily-health.db");

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
  if (!fs.existsSync(templateDb)) {
    throw new Error("Missing bundled SQLite template database.");
  }
  fs.copyFileSync(templateDb, databasePath);
}

process.env.NODE_ENV = "production";
process.env.PORT = port;
process.env.HOSTNAME = host;
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:" + databasePath;
process.env.NEXT_TELEMETRY_DISABLED = "1";

require("./server.js");
`;
  fs.writeFileSync(path.join(outputDir, "index.js"), bootstrap);
}

function writeNodePackage() {
  const packagePath = path.join(outputDir, "package.json");

  fs.writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        name: "daily-health-embedded-server",
        version: "1.0.0",
        private: true,
        license: "MIT",
        main: "index.js",
        scripts: {
          start: "node index.js"
        }
      },
      null,
      2
    )}\n`
  );
}

function copyRuntimePackage(packageName) {
  const packageRoot = findPackageRoot(packageName);
  const target = path.join(outputDir, "node_modules", ...packageName.split("/"));

  removeIfExists(target);
  copyDirectory(packageRoot, target);
}

function copyRequiredRuntimePackages() {
  for (const packageName of requiredRuntimePackages) {
    copyRuntimePackage(packageName);
  }
}

function assertPreparedServer() {
  const requiredFiles = [
    path.join(outputDir, "server.js"),
    path.join(outputDir, "index.js"),
    path.join(outputDir, "package.json"),
    path.join(outputDir, ".next", "BUILD_ID"),
    path.join(outputDir, ".next", "server", "app", "page.js"),
    path.join(outputDir, "node_modules", "next", "package.json"),
    path.join(outputDir, "node_modules", "styled-jsx", "package.json"),
    path.join(outputDir, "node_modules", "client-only", "package.json"),
    path.join(outputDir, "node_modules", "@swc", "helpers", "package.json"),
    path.join(outputDir, "data", "daily-health-template.db")
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Embedded server is incomplete. Missing ${path.relative(root, file)}.`);
    }
  }
}

function main() {
  assertDirectory(standaloneRoot, "Run `pnpm run build` before `pnpm run mobile:prepare`.");
  assertDirectory(nextStaticDir, "Missing .next/static. Run `pnpm run build` first.");

  const serverFiles = findFiles(standaloneRoot, "server.js");
  if (serverFiles.length === 0) {
    throw new Error("Could not find server.js inside .next/standalone.");
  }

  const serverFile = serverFiles
    .map((file) => ({ file, depth: path.relative(standaloneRoot, file).split(path.sep).length }))
    .sort((a, b) => a.depth - b.depth)[0].file;
  const serverDir = path.dirname(serverFile);

  removeIfExists(outputDir);
  copyDirectory(serverDir, outputDir);
  copyRequiredRuntimePackages();
  copyDirectory(nextStaticDir, path.join(outputDir, ".next", "static"));
  if (fs.existsSync(publicDir)) {
    copyDirectory(publicDir, path.join(outputDir, "public"));
  }
  createDatabaseTemplate();
  writeBootstrap();
  writeNodePackage();
  assertPreparedServer();

  const size = directorySize(outputDir);
  const sizeMb = (size / 1024 / 1024).toFixed(1);
  console.log(`Prepared embedded server at ${path.relative(root, outputDir)} (${sizeMb} MB).`);
  if (size > sizeLimitBytes) {
    throw new Error(`Embedded server is ${sizeMb} MB, over the 200 MB target.`);
  }
}

main();
