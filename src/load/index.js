import { setTimeout as delay } from "node:timers/promises";

import { createCheck, printChecks, summarizeChecks, writeJsonReport } from "../report.js";
import { loadConfig } from "../config.js";
import { monitorStatus, summarizeStatus } from "./monitor.js";
import { runVoiceScenario } from "./voiceScenario.js";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function parseIntArg(args, key, fallback) {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(value)) {
    throw new Error(`--${key} must be an integer`);
  }
  return value;
}

function hasHelp(args) {
  return args.help || args.h;
}

async function runLoadTest() {
  const args = parseArgs(process.argv.slice(2));
  if (hasHelp(args)) {
    console.log(`AksiyonSoft voice load test

Kullanim:
  npm run test:voice-load -- [options]

Opsiyonlar:
  --listeners 20..30
  --duration-min 10
  --speaker-bitrate 640
  --status-interval-sec 5
`);
    return;
  }

  const base = loadConfig();
  const listeners = parseIntArg(args, "listeners", 20);
  const durationMin = parseIntArg(args, "duration-min", 10);
  const statusIntervalSec = parseIntArg(args, "status-interval-sec", 5);
  const speakerBitrate = parseIntArg(args, "speaker-bitrate", base.payloadBytes);

  if (listeners < 20 || listeners > 30) {
    throw new Error("--listeners must be between 20 and 30");
  }
  if (durationMin < 1) {
    throw new Error("--duration-min must be >= 1");
  }
  if (statusIntervalSec < 1) {
    throw new Error("--status-interval-sec must be >= 1");
  }

  const baseUrl = base.baseUrl.replace(/\/$/, "");
  const checks = [];

  const scenarioConfig = {
    baseUrl,
    listeners,
    voiceGroupId: base.voiceGroupId,
    voiceGroupName: base.voiceGroupName,
    rampUpMs: base.rampUpMs,
    botOptions: {
      baseUrl,
      namePrefix: base.userNamePrefix,
      emailPrefix: base.userEmailPrefix,
      password: base.password,
      enableSse: base.enableSse,
      udpBindHost: base.udpBindHost,
      rtpClientHost: base.rtpClientHost,
      frameMs: base.frameMs,
      payloadBytes: speakerBitrate
    }
  };

  let teardown = async () => {};
  let scenario = null;
  try {
    console.log("Voice scenario hazirlaniyor...");
    scenario = await runVoiceScenario(scenarioConfig);
    teardown = scenario.teardown;
    checks.push(
      createCheck(
        "Voice setup",
        true,
        `group=${scenario.voiceGroupId} udp=${scenario.serverUdpPort} speaker=${scenario.speakerId} listeners=${listeners}`
      )
    );

    const durationMs = durationMin * 60_000;
    console.log(`Monitor basladi (${durationMin} dakika, ${statusIntervalSec}s aralik)`);
    const monitorResult = await monitorStatus(baseUrl, statusIntervalSec, durationMs);
    const monitorSummary = summarizeStatus(monitorResult.samples, monitorResult.errors);

    checks.push(
      createCheck(
        "Status monitor",
        monitorSummary.errorCount === 0 && monitorSummary.sampleCount > 0,
        `sample=${monitorSummary.sampleCount} error=${monitorSummary.errorCount} maxTemp=${monitorSummary.maxCpuTempC ?? "n/a"}C avgResp=${monitorSummary.averageResponseMs ?? "n/a"}ms`,
        monitorSummary
      )
    );
    checks.push(
      createCheck(
        "UDP listening ratio",
        monitorSummary.udpListeningRatio.endsWith(`/${monitorSummary.sampleCount}`),
        `voiceRtpUdpListening=${monitorSummary.udpListeningRatio}`
      )
    );

    printChecks(checks);
    const summary = summarizeChecks(checks);
    console.log(`Sonuc: ${summary.pass}/${summary.total} PASS, ${summary.fail} FAIL`);

    const reportPayload = {
      kind: "voice-load",
      createdAt: new Date().toISOString(),
      options: { listeners, durationMin, speakerBitrate, statusIntervalSec, baseUrl },
      scenario: {
        voiceGroupId: scenario.voiceGroupId,
        serverUdpPort: scenario.serverUdpPort,
        speakerId: scenario.speakerId
      },
      checks,
      summary,
      monitorSummary,
      monitorSamples: monitorResult.samples,
      monitorErrors: monitorResult.errors
    };
    const reportPath = await writeJsonReport("voice-load-report", reportPayload);
    console.log(`JSON rapor: ${reportPath}`);

    if (summary.fail > 0) {
      process.exitCode = 1;
    }
  } finally {
    await delay(250);
    await teardown();
  }
}

runLoadTest().catch((error) => {
  console.error("Voice load test failed:", error);
  process.exit(1);
});
