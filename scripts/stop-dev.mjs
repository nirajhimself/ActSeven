// Stops any dev server / local database started from this project that is
// still running (e.g. after a terminal was closed), so `npm run dev` can start.
// Usage: npm run dev:stop
// Only processes whose command line contains this project's folder are touched.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const isOurs = (cmd) =>
  cmd.toLowerCase().includes(projectDir.toLowerCase()) && /next|with-db|start-server/i.test(cmd) && !cmd.includes("stop-dev.mjs");

let pids = [];
if (process.platform === "win32") {
  const powershell = join(process.env.SystemRoot ?? "C:/Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const list = spawnSync(
    powershell,
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"],
    { encoding: "utf8" },
  );
  pids = list.stdout
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter(([pid, cmd]) => pid && cmd && Number(pid) !== process.pid && isOurs(cmd))
    .map(([pid]) => Number(pid));
  const taskkill = join(process.env.SystemRoot ?? "C:/Windows", "System32", "taskkill.exe");
  for (const pid of pids) spawnSync(taskkill, ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
} else {
  const list = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  pids = list.stdout
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m) => m && Number(m[1]) !== process.pid && isOurs(m[2]))
    .map((m) => Number(m[1]));
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

console.log(pids.length ? `✓ Stopped ${pids.length} leftover process${pids.length === 1 ? "" : "es"} (${pids.join(", ")}).` : "✓ Nothing to stop — no dev server from this project is running.");
