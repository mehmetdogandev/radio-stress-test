import os from "node:os";
import mdns from "multicast-dns";

function collectLocalCidrs() {
  const cidrs = new Set();
  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    for (const item of values ?? []) {
      if (item.internal || item.family !== "IPv4") continue;
      if (item.cidr) cidrs.add(item.cidr);
    }
  }
  return Array.from(cidrs).sort();
}

function sanitizeName(value) {
  return value.replace(/\.$/, "");
}

export async function discoverMdnsServices({
  serviceType = "_radio._tcp.local",
  nameFilter = "aksiyonsoft",
  timeoutMs = 12_000
} = {}) {
  const client = mdns();
  const ptrName = sanitizeName(serviceType);
  const lowerFilter = nameFilter.toLowerCase();
  const byHost = new Map();
  const questionsSentAt = Date.now();

  const register = (host, patch) => {
    const key = sanitizeName(host);
    const current = byHost.get(key) ?? { host: key, addresses: [], port: null, serviceName: null };
    const next = { ...current, ...patch };
    if (patch.addresses) {
      const merged = new Set([...(current.addresses ?? []), ...patch.addresses]);
      next.addresses = Array.from(merged);
    }
    byHost.set(key, next);
  };

  client.on("response", (response) => {
    const records = [...(response.answers ?? []), ...(response.additionals ?? [])];
    for (const record of records) {
      if (record.type === "PTR" && typeof record.data === "string") {
        const serviceName = sanitizeName(record.data);
        if (serviceName.toLowerCase().includes(lowerFilter)) {
          register(serviceName, { serviceName });
        }
      }
      if (record.type === "SRV" && typeof record.data === "object" && record.data?.target) {
        const serviceName = sanitizeName(record.name);
        const target = sanitizeName(record.data.target);
        if (serviceName.toLowerCase().includes(lowerFilter) || target.toLowerCase().includes(lowerFilter)) {
          register(target, { serviceName, port: Number(record.data.port) || null });
        }
      }
      if ((record.type === "A" || record.type === "AAAA") && typeof record.data === "string") {
        register(record.name, { addresses: [record.data] });
      }
    }
  });

  client.query([{ name: ptrName, type: "PTR" }]);
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  client.destroy();

  const services = Array.from(byHost.values()).filter(
    (item) =>
      item.host.toLowerCase().includes(lowerFilter) ||
      item.serviceName?.toLowerCase().includes(lowerFilter)
  );

  return {
    services,
    meta: {
      serviceType: ptrName,
      nameFilter,
      timeoutMs,
      discoveredAt: new Date().toISOString(),
      localCidrs: collectLocalCidrs(),
      elapsedMs: Date.now() - questionsSentAt
    }
  };
}
