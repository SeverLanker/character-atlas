import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  outdir: "preview-build",
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
});
const asset =
  "data:image/png;base64," +
  (await readFile(join(root, "public/art/characters.png"))).toString("base64");
const js = result.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replaceAll("/art/characters.png", asset)
  .replaceAll("</script", "<\\/script");
const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text;
const html =
  '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>叙册 · 本地预览</title><style>' +
  css +
  '</style></head><body><div id="root"></div><script>' +
  js +
  "</script></body></html>";
await mkdir(join(root, "deliverables"), { recursive: true });
const path = join(root, "deliverables/叙册-本地预览.html");
await writeFile(path, html);
console.log(path);
