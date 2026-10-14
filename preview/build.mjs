// Builds dist/nium-api-observability.html: the whole prototype in one file,
// for sharing without a server. Usage: npm run build:preview
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist");
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [resolve(root, "preview/entry.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  alias: {
    "next/navigation": resolve(root, "preview/shims/next-navigation.ts"),
    "next/link": resolve(root, "preview/shims/next-link.tsx"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});

const cssFile = resolve(out, "preview.css");
execFileSync(resolve(root, "node_modules/.bin/tailwindcss"), ["-i", resolve(root, "src/app/globals.css"), "-o", cssFile, "-c", resolve(root, "tailwind.config.ts"), "--minify"], { stdio: "inherit" });
const css = readFileSync(cssFile, "utf8");
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = `<title>Nium API Observability</title>
<meta name="description" content="Portfolio concept: connected observability investigation for a payment API ecosystem. Simulated telemetry.">
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Single dark look by design: an engineering operations console. */
:root { color-scheme: dark; --bg: #070d1a; --fg: #e6ecf8; }
html, body { background: var(--bg); color: var(--fg); }
#root { padding-left: max(0px, env(safe-area-inset-left, 0px)); padding-right: max(0px, env(safe-area-inset-right, 0px)); }
${css}
</style>
<div id="root"></div>
<script>${script}</script>
`;
writeFileSync(resolve(out, "nium-api-observability.html"), html);
console.log(`Wrote dist/nium-api-observability.html (${(html.length / 1024).toFixed(0)} KB)`);
