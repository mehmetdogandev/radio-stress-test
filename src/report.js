import fs from "node:fs/promises";
import path from "node:path";

function nowIsoSafe() {
  return new Date().toISOString().replaceAll(":", "-");
}

export function createCheck(name, ok, detail, extra = undefined) {
  return { name, ok: Boolean(ok), detail, ...(extra ? { extra } : {}) };
}

export function printCheck(check) {
  const icon = check.ok ? "PASS" : "FAIL";
  console.log(`[${icon}] ${check.name} - ${check.detail}`);
}

export function printChecks(checks) {
  for (const check of checks) {
    printCheck(check);
  }
}

export function summarizeChecks(checks) {
  const pass = checks.filter((item) => item.ok).length;
  const fail = checks.length - pass;
  return { pass, fail, total: checks.length };
}

export async function writeJsonReport(kind, payload) {
  const reportsDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const filename = `${kind}-${nowIsoSafe()}.json`;
  const filePath = path.join(reportsDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}
