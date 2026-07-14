# Embedding Next.js in a Capacitor Android App via `capacitor-nodejs`: Pitfalls & Fixes

This documents the failure modes we hit shipping **Daily Health** (Next.js 15 +
Prisma + SQLite, bundled as a standalone server and run inside an Android APK
via the `capacitor-nodejs` plugin) and how each one was fixed. If you're doing
something similar — Next.js (or any modern Node app) running on
`nodejs-mobile`/`capacitor-nodejs` — read this before you start, not after
your third crash.

## The core problem: the embedded Node engine is not your dev machine's Node

`capacitor-nodejs` (and the underlying `nodejs-mobile` toolkit it wraps) ships
a **cross-compiled, stripped-down Node/V8 build for Android**. It is not the
same Node you built your app with in CI or on your laptop. Two consequences
follow from this, and they explain almost every bug below:

1. **It may be an old Node version.** The npm package `capacitor-nodejs@0.0.1`
   (the only version ever published to the npm registry) bundles **Node
   12.19.0**. Modern framework output (Next.js 15, in our case) uses ES2020+
   syntax like optional chaining (`?.`) and nullish coalescing (`??`) that
   Node 12 cannot even parse. This isn't a runtime error — it's a
   `SyntaxError` that kills the process before your app logic runs.
2. **Its V8 build may lack full Unicode regex support**, even on a modern
   Node major version. Regex Unicode property escapes (`\p{ID_Start}`,
   `\p{ID_Continue}`, etc.) require Unicode-aware regex support in V8. Mobile
   cross-compiles of V8 sometimes disable this to cut binary size / avoid
   cross-compiling ICU for Android, and package metadata (`config.gypi`)
   isn't reliable evidence either way — verify empirically. If some file
   deep in a dependency uses `\p{...}` inside a character class, it throws
   `SyntaxError: Invalid regular expression: ...: Invalid property name in
   character class` at **parse time**, before any of your code runs.

**Takeaway:** never assume the mobile Node engine can do everything your CI's
Node can. Test the actual embedded binary, not just "it builds."

## Pitfall 1: Using the npm-published `capacitor-nodejs@0.0.1`

**Symptom:**
```
SyntaxError: Unexpected token '?'
```
pointing at a `?.` or `??` in a compiled dependency (for us, Next's
`picocolors.js`).

**Cause:** `capacitor-nodejs@0.0.1` on the npm registry is an early snapshot
(bundling Node 12.19.0) that the author never updated. The project moved to
distributing releases directly via **GitHub Releases**, currently up to
`v1.0.0-beta.9` (Node 18.20.4), and npm was never republished.

**Fix:** point your dependency at the GitHub release tarball instead of the
npm registry version:

```json
"capacitor-nodejs": "https://github.com/hampoelz/capacitor-nodejs/releases/download/v1.0.0-beta.9/capacitor-nodejs.tgz"
```

Also note the plugin config key renamed from `NodeJS` to `CapacitorNodeJS`
starting at beta.3 — update `capacitor.config.ts` accordingly:

```ts
plugins: {
  CapacitorNodeJS: { nodeDir: "nodejs" }
}
```

If you were using a patch (e.g. `pnpm patch`) to work around a bug in the old
version, check whether it's still needed — ours (a `bridge.h`/`Bridge.h`
casing mismatch) was already fixed upstream by beta.9, and a stale
`patchedDependencies` entry pointing at a version you no longer install will
break `pnpm install` outright.

**Before you commit to a fix:** check the actual bundled Node version instead
of trusting docs/READMEs, which can be stale. It's baked into the release
tarball:

```bash
curl -sL <release-tarball-url> | tar xz package/android/libnode/include/node/node_version.h -O \
  | grep NODE_MAJOR_VERSION
```

## Pitfall 2: Next.js standalone output missing modules under pnpm

**Symptom:** the server starts, then immediately crashes with
```
Error: Cannot find module '@swc/helpers/_/_interop_require_default'
```
or `Cannot find module '@next/env'`, or (later, once you fix those) `Cannot
find module 'caniuse-lite'`.

**Cause:** Next's `output: "standalone"` build uses file-tracing
(`@vercel/nft`) to figure out which `node_modules` files your server actually
needs at runtime, and copies only those into `.next/standalone`. Under pnpm's
strict, symlink-based `node_modules` layout, this tracing reliably misses
packages that are **direct dependencies of `next` itself** but not of your
project — because they only exist deep inside pnpm's content-addressable
store (`node_modules/.pnpm/...`), not hoisted to your project root.

We hit this three times in a row, once per package, before realizing the
pattern: **check all five of `next`'s own direct dependencies up front**
instead of fixing them one crash at a time.

```bash
node -e "console.log(require('next/package.json').dependencies)"
# { '@next/env': ..., '@swc/helpers': ..., 'caniuse-lite': ..., 'postcss': ..., 'styled-jsx': ... }
```

For each one, check if it resolves from your project root — if it doesn't,
it's a landmine waiting to go off the first time that code path executes:

```bash
node -e "try { require.resolve('@swc/helpers/package.json', {paths:[process.cwd()]}); console.log('OK') } catch { console.log('MISSING') }"
```

**Fix (two parts):**

1. Add the missing ones as **direct dependencies** in your `package.json`,
   pinned to the exact version `next` itself requires (so pnpm hoists them to
   your project root and they become resolvable via `require.resolve` from
   there):
   ```json
   "@next/env": "15.5.19",
   "@swc/helpers": "0.5.15",
   "caniuse-lite": "^1.0.30001579"
   ```
2. In your standalone-output prep script, explicitly copy them into the
   embedded server's `node_modules` (the same workaround you may already
   have for `styled-jsx`/`client-only`, since those are the two packages
   this bites most commonly and may already have a workaround in your repo):
   ```js
   const requiredRuntimePackages = [
     "styled-jsx", "client-only", "@swc/helpers", "@next/env", "caniuse-lite"
   ];
   ```

Then add a completeness check (fail the build, don't ship a broken APK) that
asserts each of these exists in the prepared output before packaging.

## Pitfall 3: `\p{ID_Start}` / `\p{ID_Continue}` crash Unicode-limited V8 builds

**Symptom:**
```
SyntaxError: Invalid regular expression: /[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/: Invalid property name in character class
```
crashing the process on every single startup, before your server logs
anything.

**Cause:** this specific regex — used to test whether a string is a valid JS
identifier — shows up all over the JS tooling ecosystem (acorn, babel, terser,
json5, and in our case Next's vendored `zod-validation-error`, used to
validate `next.config`). It's harmless on a normal Node install. On a V8 build
without full Unicode regex property support, it's a hard crash.

The reason this one is worse than a missing-module error: it's often a
**top-level regex literal**, evaluated the instant the file is
`require()`'d — not lazily when some feature is used. If the offending file
is on your server's unconditional startup path (as `zod-validation-error` is,
via `next/dist/server/config.js`), your server **cannot start at all**, no
matter what your app code does.

**Fix:** you can't patch the engine (short of building your own nodejs-mobile
fork with full ICU/i18n support, which is a much bigger undertaking). Instead,
patch the compiled file that trips over it, as a post-build step:

```js
function patchIncompatibleUnicodeRegex() {
  const target = "path/to/copied/next/dist/compiled/zod-validation-error/index.js";
  const original = fs.readFileSync(target, "utf8");
  const broken = "/[$_\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]*/u";
  const fixed  = "/[$_A-Za-z][$\\u200c\\u200d\\w]*/"; // ASCII-only equivalent, no `u` flag needed
  if (!original.includes(broken)) {
    throw new Error("Expected regex not found — next's bundled zod-validation-error probably changed; update this patch.");
  }
  fs.writeFileSync(target, original.split(broken).join(fixed));
}
```

Two important details:

- **Fail loud if the string you're patching isn't found.** Framework updates
  will eventually change this minified code and silently no-op instead of
  crashing (which is what a soft "if found, replace" does) means you ship a
  build that still crashes, with no signal telling you why.
- **This is a narrow, targeted patch of one require-time hot path, not a
  general fix.** The same regex pattern exists elsewhere in Next's vendored
  tools (acorn, babel, terser, json5) but those are only exercised
  lazily during build-time bundling, which happens on your CI machine's full
  Node, not on-device. If you later add a feature that causes one of those
  to run **on-device** (e.g. some runtime code-transform path), expect the
  same class of crash and the same fix pattern.

## Pitfall 4: the embedded server's port hardcoded in two places

**Symptom:** intermittent "Local server did not start" on the loading screen,
even though logcat shows the Node server came up fine — the WebView is
polling a different port than the server actually bound.

**Cause:** the port number was a literal duplicated in two independent
files — the Node bootstrap script (`const port = process.env.PORT ||
"34189"`) and the WebView's boot-screen polling script (`const localOrigin =
"http://127.0.0.1:34189"`). Nothing enforces they stay in sync; change one
(e.g. to work around a port conflict) and forget the other, and you get a
silent, confusing failure that *looks* like the server didn't start.

**Fix:** make the port a single source of truth, and template it into every
consumer at build time instead of hand-syncing literals:

```js
// scripts/mobile-prepare.js
const mobileServerPort = process.env.DAILY_HEALTH_MOBILE_PORT || "34189";
```

- The Node bootstrap already interpolates this directly (`${mobileServerPort}`)
  since it's generated by the same script.
- The static `mobile-web/index.html` can't read a JS constant at build time,
  so give it a placeholder token instead of a literal port:
  ```js
  const localOrigin = "http://127.0.0.1:__DAILY_HEALTH_PORT__";
  ```
  and have the prep script substitute it in-place before `cap sync android`
  runs. Make the substitution **idempotent** (no-op if already patched to the
  current value, error if the placeholder is missing entirely) so re-running
  the prep script locally without a fresh git checkout doesn't break:
  ```js
  function patchWebEntryPort() {
    const original = fs.readFileSync(webEntryPath, "utf8");
    const placeholder = 'const localOrigin = "http://127.0.0.1:__DAILY_HEALTH_PORT__";';
    const done = `const localOrigin = "http://127.0.0.1:${mobileServerPort}";`;
    if (original.includes(done)) return;
    if (!original.includes(placeholder)) throw new Error("port placeholder missing");
    fs.writeFileSync(webEntryPath, original.split(placeholder).join(done));
  }
  ```

This also means the port becomes genuinely configurable from one place
(an env var) instead of a grep-and-replace across the repo.

## General lessons

- **Don't trust the embedded engine to be capable of what your CI's Node is
  capable of.** Different major version, different V8 build flags, different
  ICU/Unicode support. When something crashes only on-device and never in
  `next dev`/`next build`, suspect the engine before your code.
- **When you find one instance of "package hoisting" bug under pnpm +
  standalone output, check for siblings immediately.** If package X is a
  direct dependency of a framework and isn't hoisted to your root
  `node_modules`, its sibling direct dependencies of that same framework are
  very likely in the same boat. Fix the whole set once instead of
  whack-a-mole, one crash-and-redeploy cycle at a time.
- **Any post-build patch of vendored/minified code should fail loudly if its
  target string isn't found**, not silently no-op. A silent no-op means a
  future framework upgrade quietly re-introduces the exact bug you already
  fixed, and you find out from a crash report instead of a build failure.
- **Any value duplicated across two or more files is a bug waiting to
  happen.** Prefer one source of truth with generated/templated consumers,
  even for something as small as a port number.
- **Verify empirically, not from metadata.** Config files (`config.gypi`,
  READMEs, changelogs) can be stale or aspirational. When in doubt, run the
  actual binary and see what it does.
