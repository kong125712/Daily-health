/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const outputDir = path.join(root, "mobile-web", "nodejs");
const epicureBridgeSource = path.join(root, "scripts", "mobile-epicure-bridge.js");
const runtimeBootstrapSource = path.join(root, "scripts", "mobile-runtime-bootstrap.js");
const schemaDir = path.join(root, "database");
const schemaPath = path.join(schemaDir, "schema.prisma");
const sizeLimitBytes = 200 * 1024 * 1024;
const mobileServerPort = process.env.DAILY_HEALTH_MOBILE_PORT || "34189";
const webEntryPath = path.join(root, "mobile-web", "index.html");
const capacitorNativeBridgeFileName = "capacitor-native-bridge.js";
const requiredRuntimePackages = [
  "styled-jsx",
  "client-only",
  "@swc/helpers",
  "@next/env",
  "caniuse-lite",
  "v8-compile-cache",
  "react",
  "react-dom"
];
const requiredApiRoutes = ["health", "runtime-status", "profile", "ai-settings"];

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

function findPackageRoot(packageName, searchPaths = [root]) {
  const candidates = [];

  try {
    candidates.push(path.dirname(require.resolve(`${packageName}/package.json`, { paths: searchPaths })));
  } catch {
    // Some packages intentionally hide package.json behind exports.
  }

  try {
    candidates.push(path.dirname(require.resolve(packageName, { paths: searchPaths })));
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
  if (!fs.existsSync(runtimeBootstrapSource)) {
    throw new Error(`Missing ${path.relative(root, runtimeBootstrapSource)}.`);
  }

  const source = fs.readFileSync(runtimeBootstrapSource, "utf8");
  const placeholder = "__DAILY_HEALTH_PORT__";
  if (!source.includes(placeholder)) {
    throw new Error(`Missing ${placeholder} in ${path.relative(root, runtimeBootstrapSource)}.`);
  }

  fs.writeFileSync(path.join(outputDir, "index.js"), source.split(placeholder).join(mobileServerPort));
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

function copyRuntimePackage(packageName, searchPaths) {
  const packageRoot = findPackageRoot(packageName, searchPaths);
  const target = path.join(outputDir, "node_modules", ...packageName.split("/"));

  removeIfExists(target);
  copyDirectory(packageRoot, target);
}

function copyRequiredRuntimePackages() {
  for (const packageName of requiredRuntimePackages) {
    copyRuntimePackage(packageName);
  }

  // react-dom resolves scheduler from its own dependency tree. The standalone
  // output does not always trace that package, but Next's error renderer loads
  // react-dom/server.browser after an application route throws.
  const reactDomRoot = findPackageRoot("react-dom");
  copyRuntimePackage("scheduler", [reactDomRoot]);
}

function copyCapacitorNativeBridge() {
  const capacitorAndroidRoot = findPackageRoot("@capacitor/android");
  const source = path.join(capacitorAndroidRoot, "capacitor", "src", "main", "assets", "native-bridge.js");
  const target = path.join(outputDir, "public", capacitorNativeBridgeFileName);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing Capacitor Android bridge asset at ${source}.`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function patchZodUnicodeRegex() {
  // The embedded Node/V8 build used by capacitor-nodejs cannot parse regex
  // Unicode property escapes (\p{ID_Start}, \p{ID_Continue}, etc.) — it
  // throws "Invalid property name in character class" at parse time.
  // next/dist/compiled/zod-validation-error defines one of these as a
  // top-level regex literal, and it's required unconditionally by
  // next/dist/server/config.js on every server start, so it crashes before
  // the app can even boot. Neuter it with an ASCII-only equivalent, which is
  // only used for cosmetic dot-vs-bracket formatting of zod error paths.
  const target = path.join(outputDir, "node_modules", "next", "dist", "compiled", "zod-validation-error", "index.js");
  if (!fs.existsSync(target)) {
    throw new Error(`Cannot patch Unicode-incompatible regex: missing ${path.relative(root, target)}.`);
  }

  const original = fs.readFileSync(target, "utf8");
  const broken = "/[$_\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]*/u";
  const fixed = "/[$_A-Za-z][$\\u200c\\u200d\\w]*/";

  if (!original.includes(broken)) {
    throw new Error(
      `Expected Unicode-property regex not found in ${path.relative(root, target)}. ` +
        "The bundled next/zod-validation-error version likely changed; update this patch in scripts/mobile-prepare.js."
    );
  }

  fs.writeFileSync(target, original.split(broken).join(fixed));
}

function findFilesWithExtension(dir, extension, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFilesWithExtension(entryPath, extension, result);
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      result.push(entryPath);
    }
  }
  return result;
}

function patchUnicodePropertyEscapes(file) {
  const original = fs.readFileSync(file, "utf8");
  let patched = original;
  const replacements = [
    ["\\p{Extended_Pictographic}", "."],
    ["\\p{Emoji_Component}", "."],
    ["\\p{ID_Continue}", "A-Za-z0-9_$"],
    ["\\p{ID_Start}", "A-Za-z_$"],
    ["\\p{Alpha}", "A-Za-z"],
    ["\\p{Lu}", "A-Z"],
    ["\\p{Ll}", "a-z"],
    ["\\p{L}", "A-Za-z"],
    ["\\p{N}", "0-9"]
  ];

  for (const [unsupported, replacement] of replacements) {
    patched = patched.split(unsupported).join(replacement);
  }

  if (patched.includes("\\p{")) {
    throw new Error(
      `Unsupported Unicode-property regex remains in ${path.relative(root, file)}. ` +
        "Add an Android-safe equivalent in scripts/mobile-prepare.js before building an APK."
    );
  }

  if (patched !== original) {
    fs.writeFileSync(file, patched);
  }
}

function patchIncompatibleUnicodeRegex() {
  // capacitor-nodejs ships a Node/V8 build that cannot parse Unicode property
  // escapes. Patch every compiled server chunk before it is placed in the APK.
  const serverDir = path.join(outputDir, ".next", "server");
  const zodFile = path.join(outputDir, "node_modules", "next", "dist", "compiled", "zod-validation-error", "index.js");
  const files = findFilesWithExtension(serverDir, ".js");

  if (!fs.existsSync(zodFile)) {
    throw new Error(`Cannot patch Unicode-incompatible regex: missing ${path.relative(root, zodFile)}.`);
  }

  files.push(zodFile);
  for (const file of files) {
    patchUnicodePropertyEscapes(file);
  }
}

function removePrismaNativeEngines() {
  const pendingDirectories = [outputDir];
  const removed = [];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) continue;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !/query_engine.*\.(?:node|so|dylib)$/i.test(entry.name)) continue;

      fs.rmSync(entryPath, { force: true });
      removed.push(path.relative(outputDir, entryPath));
    }
  }

  if (removed.length > 0) {
    console.log(`Removed ${removed.length} host Prisma query engine file(s) from the embedded server.`);
  }
}

function findPrismaNativeEngines(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      findPrismaNativeEngines(entryPath, result);
    } else if (entry.isFile() && /query_engine.*\.(?:node|so|dylib)$/i.test(entry.name)) {
      result.push(entryPath);
    }
  }
  return result;
}

function assertPreparedServer() {
  const requiredFiles = [
    path.join(outputDir, "server.js"),
    path.join(outputDir, "index.js"),
    path.join(outputDir, "epicure-bridge.js"),
    path.join(outputDir, "package.json"),
    path.join(outputDir, ".next", "BUILD_ID"),
    path.join(outputDir, ".next", "server", "app", "page.js"),
    path.join(outputDir, ".next", "server", "app", "recipes", "page.js"),
    path.join(outputDir, ".next", "server", "app", "recipes.html"),
    ...requiredApiRoutes.map((route) => path.join(outputDir, ".next", "server", "app", "api", route, "route.js")),
    path.join(outputDir, "node_modules", "next", "package.json"),
    path.join(outputDir, "node_modules", "styled-jsx", "package.json"),
    path.join(outputDir, "node_modules", "client-only", "package.json"),
    path.join(outputDir, "node_modules", "@swc", "helpers", "package.json"),
    path.join(outputDir, "node_modules", "@next", "env", "package.json"),
    path.join(outputDir, "node_modules", "caniuse-lite", "package.json"),
    path.join(outputDir, "node_modules", "v8-compile-cache", "package.json"),
    path.join(outputDir, "node_modules", "react", "package.json"),
    path.join(outputDir, "node_modules", "react-dom", "package.json"),
    path.join(outputDir, "node_modules", "react-dom", "server.browser.js"),
    path.join(outputDir, "node_modules", "scheduler", "package.json"),
    path.join(outputDir, "public", capacitorNativeBridgeFileName),
    path.join(outputDir, "data", "daily-health-template.db")
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Embedded server is incomplete. Missing ${path.relative(root, file)}.`);
    }
  }

  const nativeEngines = findPrismaNativeEngines(outputDir);
  if (nativeEngines.length > 0) {
    throw new Error(
      `Embedded server still contains host Prisma query engines: ${nativeEngines
        .map((file) => path.relative(root, file))
        .join(", ")}.`
    );
  }
}

function patchWebEntryPort() {
  // mobile-web/index.html (the Capacitor webDir's boot screen) polls
  // 127.0.0.1:<port> waiting for the embedded server to come up. That port
  // and the Node bootstrap's port used to be two independent hardcoded
  // literals in two different files — change one without the other and the
  // WebView polls the wrong port forever, showing "Local server did not
  // start" even though the server is actually up. Both now derive from the
  // single `mobileServerPort` constant above.
  if (!fs.existsSync(webEntryPath)) {
    throw new Error(`Missing ${path.relative(root, webEntryPath)}.`);
  }

  const original = fs.readFileSync(webEntryPath, "utf8");
  const placeholder = 'const localOrigin = "http://127.0.0.1:__DAILY_HEALTH_PORT__";';
  const alreadyPatched = `const localOrigin = "http://127.0.0.1:${mobileServerPort}";`;

  if (original.includes(alreadyPatched)) {
    return; // Re-running mobile:prepare locally without a fresh git checkout — already up to date.
  }

  if (!original.includes(placeholder)) {
    throw new Error(
      `Could not find the port placeholder in ${path.relative(root, webEntryPath)}. ` +
        "If you edited that file, make sure the loading screen still sets " +
        '`const localOrigin = "http://127.0.0.1:__DAILY_HEALTH_PORT__";` so scripts/mobile-prepare.js can inject the port, ' +
        "or restore it from git and re-run."
    );
  }

  fs.writeFileSync(webEntryPath, original.split(placeholder).join(alreadyPatched));
}

function main() {
  assertDirectory(standaloneRoot, "Run `pnpm run build` before `pnpm run mobile:prepare`.");
  assertDirectory(nextStaticDir, "Missing .next/static. Run `pnpm run build` first.");
  if (!fs.existsSync(epicureBridgeSource)) {
    throw new Error("Missing scripts/mobile-epicure-bridge.js.");
  }
  if (!fs.existsSync(runtimeBootstrapSource)) {
    throw new Error("Missing scripts/mobile-runtime-bootstrap.js.");
  }

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
  fs.copyFileSync(epicureBridgeSource, path.join(outputDir, "epicure-bridge.js"));
  copyRequiredRuntimePackages();
  patchIncompatibleUnicodeRegex();
  copyDirectory(nextStaticDir, path.join(outputDir, ".next", "static"));
  if (fs.existsSync(publicDir)) {
    copyDirectory(publicDir, path.join(outputDir, "public"));
  }
  copyCapacitorNativeBridge();
  createDatabaseTemplate();
  writeBootstrap();
  writeNodePackage();
  // Android uses the Capacitor SQLite bridge for all application data. Native
  // Prisma engines are host-specific and cannot run inside the Node runtime
  // bundled with the APK, so keep them out of the packaged server entirely.
  removePrismaNativeEngines();
  assertPreparedServer();

  const size = directorySize(outputDir);
  const sizeMb = (size / 1024 / 1024).toFixed(1);
  console.log(`Prepared embedded server at ${path.relative(root, outputDir)} (${sizeMb} MB).`);
  if (size > sizeLimitBytes) {
    throw new Error(`Embedded server is ${sizeMb} MB, over the 200 MB target.`);
  }
}

main();
