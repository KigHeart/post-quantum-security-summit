import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const pages = ["index.html", "programme.html", "sponsors.html", "registration.html", "privacy.html", "admin.html"];
const requiredAssets = ["styles.css", "refinements.css", "inner-pages.css", "script.js"];
const errors = [];

for (const file of [...pages, ...requiredAssets]) {
  if (!existsSync(resolve(root, file))) errors.push(`Missing required file: ${file}`);
}
for (const page of pages) {
  if (!existsSync(resolve(root, page))) continue;
  const html = readFileSync(resolve(root, page), "utf8");
  if (!/^<!doctype html>/i.test(html.trim())) errors.push(`${page}: missing HTML5 doctype`);
  if (!/<html lang="en">/i.test(html)) errors.push(`${page}: missing language declaration`);
  if (!/<meta name="viewport"/i.test(html)) errors.push(`${page}: missing viewport metadata`);
  for (const href of [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1])) {
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(href)) continue;
    // The organiser routes are application endpoints, not files in the static source tree.
    if (href.startsWith("/admin/")) continue;
    const local = (href.startsWith("/") ? href.slice(1) : href).split("#")[0].split("?")[0];
    if (local && !existsSync(resolve(root, local))) errors.push(`${page}: broken local reference ${href}`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${pages.length} pages and ${requiredAssets.length} shared assets are present; local references resolve.`);
}
