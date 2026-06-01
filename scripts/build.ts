import { mkdir } from "node:fs/promises";

function run(command: string[]): void {
  const result = Bun.spawnSync(command, {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!result.success) {
    process.exit(result.exitCode ?? 1);
  }
}

run(["bun", "run", "build"]);

await mkdir("dist", { recursive: true });

const outfile =
  process.platform === "win32"
    ? "dist/rbx-enforcement-ban-tool.exe"
    : "dist/rbx-enforcement-ban-tool";

run(["bun", "build", "--compile", ".output/server/index.mjs", "--outfile", outfile]);
