import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/cmc");
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}
