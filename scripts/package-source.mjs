import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = {};
async function collect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (
      ["node_modules", "dist", "dist-0.1.0", "target", ".git", "deliverables"].includes(
        item.name,
      ) ||
      item.name.endsWith(".zip") ||
      item.name.endsWith(".tsbuildinfo")
    )
      continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) await collect(path);
    else
      files["character-atlas/" + relative(root, path).replaceAll("\\", "/")] =
        new Uint8Array(await readFile(path));
  }
}
await collect(root);
await mkdir(join(root, "deliverables"), { recursive: true });
const path = join(root, "deliverables/character-atlas-source.zip");
await writeFile(path, zipSync(files, { level: 6 }));
console.log(path);
