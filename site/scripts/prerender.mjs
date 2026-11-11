// Writes the prerendered header and hero into the built index.html, with the settings files the
// page reads first marked to load alongside the script instead of after it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(site, "../dist/index.html");
const { render } = await import(path.join(site, ".ssr/shell.js"));

const deployment = JSON.parse(fs.readFileSync(path.join(site, "public/imd-deployment.json"), "utf8"));
const paths = deployment.contracts.filter((c) => ["Judge", "JudgeEthDoor"].includes(c.name)).map((c) => c.abiPath);
const abis = Object.fromEntries(paths.map((p) => [p, JSON.parse(fs.readFileSync(path.join(site, "public", p), "utf8"))]));

let html = fs.readFileSync(out, "utf8");
const markup = render(deployment, abis);
if (!html.includes('<div id="root"></div>')) throw new Error("index.html has no empty root to fill");
html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
// Not the font: on a slow phone it takes the stylesheet's bandwidth and the first paint comes later.
const preloads = ["imd-deployment.json", ...paths].map((p) => `<link rel="preload" href="./${p}" as="fetch" crossorigin />`).join("\n    ");
html = html.replace("</head>", `  ${preloads}\n  </head>`);
fs.writeFileSync(out, html);
console.log(`prerendered ${markup.length} characters into dist/index.html`);
