import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function isolatedSkillConfig(): Promise<string> {
  const roots = [
    join(homedir(), ".agents/skills"),
    join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"),
  ];
  const paths = new Set<string>();
  for (const root of roots) {
    const entries = await readdir(root).catch(() => []);
    for (const entry of entries) {
      const directory = join(root, entry);
      for (const candidate of [
        directory,
        await realpath(directory).catch(() => directory),
      ]) {
        paths.add(candidate);
        paths.add(join(candidate, "SKILL.md"));
      }
      if (entry === ".system") {
        for (const nested of await readdir(directory)) {
          paths.add(join(directory, nested));
          paths.add(join(directory, nested, "SKILL.md"));
        }
      }
    }
  }
  return `skills.config=[${[...paths].map((path) => `{path=${JSON.stringify(path)},enabled=false}`).join(",")}]`;
}
