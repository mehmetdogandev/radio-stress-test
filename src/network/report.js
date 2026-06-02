import fs from "node:fs/promises";
import path from "node:path";

export async function loadPreviousMdnsSnapshot() {
  const filePath = path.resolve(process.cwd(), "reports", "last-mdns-snapshot.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { filePath, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export async function saveMdnsSnapshot(snapshot) {
  const reportsDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, "last-mdns-snapshot.json");
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return filePath;
}

export function compareMdnsSnapshots(previous, current) {
  const previousHosts = new Set((previous?.services ?? []).map((item) => item.host));
  const currentHosts = new Set((current?.services ?? []).map((item) => item.host));
  const appeared = Array.from(currentHosts).filter((host) => !previousHosts.has(host));
  const disappeared = Array.from(previousHosts).filter((host) => !currentHosts.has(host));
  return {
    appeared,
    disappeared,
    previousCount: previousHosts.size,
    currentCount: currentHosts.size
  };
}
