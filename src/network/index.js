import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { createCheck, printChecks, summarizeChecks, writeJsonReport } from "../report.js";
import { discoverMdnsServices } from "./mdns.js";
import { compareMdnsSnapshots, loadPreviousMdnsSnapshot, saveMdnsSnapshot } from "./report.js";
import { probeHealth, probeStatus, probeTcp, probeUdp } from "./probe.js";

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function getArgValue(name) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function parsePort(raw, fallback) {
  if (!raw?.trim()) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return value;
}

function isIpv6Address(value) {
  return value.includes(":");
}

function wrapHostForUrl(host) {
  if (!isIpv6Address(host)) return host;
  if (host.startsWith("[") && host.endsWith("]")) return host;
  return `[${host}]`;
}

function pickBestMdnsAddress(addresses) {
  const list = Array.isArray(addresses) ? addresses.filter(Boolean) : [];
  if (list.length === 0) return null;
  const ipv4 = list.find((item) => !isIpv6Address(item));
  return ipv4 ?? list[0];
}

async function askQuestions() {
  const argIp = getArgValue("ip");
  const argHttpPort = getArgValue("http-port");
  const argUdpPort = getArgValue("udp-port");
  const argMdns = getArgValue("mdns");
  const argMdnsTimeoutSec = getArgValue("mdns-timeout-sec");
  const argCompareNetworks = getArgValue("compare-networks");

  if (
    argIp !== undefined ||
    argHttpPort !== undefined ||
    argUdpPort !== undefined ||
    argMdns !== undefined ||
    argMdnsTimeoutSec !== undefined ||
    argCompareNetworks !== undefined
  ) {
    return {
      ip: argIp?.trim() || null,
      httpPort: parsePort(argHttpPort, 8080),
      udpPort: parsePort(argUdpPort, 5004),
      mdnsEnabled: (argMdns ?? "true").toLowerCase() !== "false",
      mdnsTimeoutMs: parsePort(argMdnsTimeoutSec, 12) * 1000,
      compareNetworks: (argCompareNetworks ?? "false").toLowerCase() === "true"
    };
  }

  const rl = readline.createInterface({ input, output });
  try {
    const ip = (await rl.question("Cihaz IP (opsiyonel, bos birak = mDNS): ")).trim();
    const httpPort = parsePort(await rl.question("HTTP port (default 8080): "), 8080);
    const udpPort = parsePort(await rl.question("UDP port (default 5004): "), 5004);
    const mdnsEnabled =
      ((await rl.question("mDNS otomatik tarama yapilsin mi? (E/H, default E): ")).trim() || "E")
        .toLowerCase()
        .startsWith("e");
    const mdnsTimeoutSec = parsePort(
      await rl.question("mDNS tarama suresi saniye (default 12): "),
      12
    );
    const compareNetworks =
      ((await rl.question("Ag degisimi karsilastirma modu acilsin mi? (E/H, default H): ")).trim() || "H")
        .toLowerCase()
        .startsWith("e");

    return {
      ip: ip || null,
      httpPort,
      udpPort,
      mdnsEnabled,
      mdnsTimeoutMs: mdnsTimeoutSec * 1000,
      compareNetworks
    };
  } finally {
    rl.close();
  }
}

function chooseTarget({ ip, httpPort, mdnsResult }) {
  if (ip) return { host: ip, source: "manual-ip" };
  const first = mdnsResult?.services?.find((item) => pickBestMdnsAddress(item.addresses));
  if (!first) {
    throw new Error("IP girilmedi ve mDNS hedefi bulunamadi.");
  }
  const selectedAddress = pickBestMdnsAddress(first.addresses);
  return { host: selectedAddress, source: "mdns", mdnsHost: first.host };
}

function printMdnsServices(mdnsResult) {
  const services = mdnsResult?.services ?? [];
  if (services.length === 0) {
    console.log("mDNS sonucu: uygun servis bulunamadi.");
    return;
  }
  console.log("mDNS sonucu:");
  services.forEach((item, index) => {
    console.log(
      `  ${index + 1}. host=${item.host} port=${item.port ?? "?"} ips=${(item.addresses ?? []).join(", ")}`
    );
  });
}

async function runNetworkTest() {
  const answers = await askQuestions();
  const checks = [];

  let mdnsResult = { services: [], meta: null };
  if (answers.mdnsEnabled) {
    mdnsResult = await discoverMdnsServices({ timeoutMs: answers.mdnsTimeoutMs });
    printMdnsServices(mdnsResult);
    checks.push(
      createCheck(
        "mDNS _radio._tcp kesfi",
        mdnsResult.services.length > 0,
        `${mdnsResult.services.length} servis bulundu`
      )
    );
  } else {
    checks.push(createCheck("mDNS _radio._tcp kesfi", true, "Kullanici tarafindan atlandi"));
  }

  const target = chooseTarget({ ip: answers.ip, httpPort: answers.httpPort, mdnsResult });
  const baseUrl = `http://${wrapHostForUrl(target.host)}:${answers.httpPort}`;
  console.log(`Hedef secildi: ${baseUrl} (${target.source})`);

  try {
    const tcp = await probeTcp(target.host, answers.httpPort);
    checks.push(createCheck("TCP baglanti", tcp.ok, `${answers.httpPort} portuna baglanildi`, tcp));
  } catch (error) {
    checks.push(
      createCheck("TCP baglanti", false, `${answers.httpPort} portuna baglanilamadi: ${error.message}`)
    );
  }

  const udp = await probeUdp(target.host, answers.udpPort);
  checks.push(createCheck("UDP probe", udp.ok, udp.detail ?? `UDP ${answers.udpPort} probe gonderildi`, udp));

  try {
    const health = await probeHealth(baseUrl);
    checks.push(
      createCheck("GET /health", health.valid, health.valid ? "ok=true" : `Beklenmeyen cevap: ${health.raw}`)
    );
  } catch (error) {
    checks.push(createCheck("GET /health", false, `Istek basarisiz: ${error.message}`));
  }

  try {
    const status = await probeStatus(baseUrl);
    checks.push(
      createCheck(
        "GET /status",
        status.valid,
        status.valid ? "status JSON dogrulandi" : `Beklenmeyen cevap: ${status.raw?.slice(0, 160)}`
      )
    );
  } catch (error) {
    checks.push(createCheck("GET /status", false, `Istek basarisiz: ${error.message}`));
  }

  let networkChange = null;
  if (answers.compareNetworks && answers.mdnsEnabled) {
    const previous = await loadPreviousMdnsSnapshot();
    if (previous?.data) {
      networkChange = compareMdnsSnapshots(previous.data, mdnsResult);
      checks.push(
        createCheck(
          "Ag degisimi karsilastirmasi",
          true,
          `onceki=${networkChange.previousCount}, simdiki=${networkChange.currentCount}, yeni=${networkChange.appeared.length}, kayip=${networkChange.disappeared.length}`,
          networkChange
        )
      );
    } else {
      checks.push(
        createCheck(
          "Ag degisimi karsilastirmasi",
          true,
          "Ilk calistirma: onceki snapshot yok, simdiki sonuclar kaydedildi."
        )
      );
    }
    await saveMdnsSnapshot(mdnsResult);
  }

  printChecks(checks);
  const summary = summarizeChecks(checks);
  console.log(`Sonuc: ${summary.pass}/${summary.total} PASS, ${summary.fail} FAIL`);

  const reportPayload = {
    kind: "network",
    createdAt: new Date().toISOString(),
    input: answers,
    target: { ...target, baseUrl },
    mdns: mdnsResult,
    checks,
    summary,
    networkChange
  };
  const reportPath = await writeJsonReport("network-report", reportPayload);
  console.log(`JSON rapor: ${reportPath}`);

  if (summary.fail > 0) {
    process.exitCode = 1;
  }
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`AksiyonSoft network/discovery test

Kullanim:
  npm run test:network

Opsiyonel bayraklar (prompt olmadan):
  --ip 192.168.1.50
  --http-port 8080
  --udp-port 5004
  --mdns true|false
  --mdns-timeout-sec 12
  --compare-networks true|false

Bu komut:
  - mDNS (_radio._tcp + aksiyonsoft) kesfi yapar
  - /health ve /status endpointlerini dogrular
  - TCP/UDP port probe calistirir
  - JSON rapor uretir (reports/)
`);
} else {
  runNetworkTest().catch((error) => {
    console.error("Network test failed:", error);
    process.exit(1);
  });
}
