import { setTimeout as delay } from "node:timers/promises";

function pickNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export async function monitorStatus(baseUrl, intervalSec, durationMs) {
  const samples = [];
  const errors = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    const sampleStartedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}/status`);
      const elapsedMs = Date.now() - sampleStartedAt;
      const json = await response.json();
      samples.push({
        at: new Date().toISOString(),
        responseMs: elapsedMs,
        statusCode: response.status,
        ok: Boolean(json?.ok),
        cpuTempC: pickNumber(json?.host?.cpuTempC),
        memory: json?.memory ?? null,
        voiceRtpUdpListening: Boolean(json?.network?.voiceRtpUdpListening)
      });
    } catch (error) {
      errors.push({
        at: new Date().toISOString(),
        message: error.message
      });
    }
    await delay(intervalSec * 1000);
  }

  return { samples, errors };
}

export function summarizeStatus(samples, errors) {
  const temps = samples.map((s) => s.cpuTempC).filter((v) => Number.isFinite(v));
  const responseTimes = samples.map((s) => s.responseMs).filter((v) => Number.isFinite(v));
  const uptimeChecks = samples.filter((s) => s.ok).length;
  const udpListeningChecks = samples.filter((s) => s.voiceRtpUdpListening).length;

  const averageResponseMs =
    responseTimes.length === 0
      ? null
      : Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10;

  return {
    sampleCount: samples.length,
    errorCount: errors.length,
    maxCpuTempC: temps.length ? Math.max(...temps) : null,
    averageResponseMs,
    okRatio: samples.length ? `${uptimeChecks}/${samples.length}` : "0/0",
    udpListeningRatio: samples.length ? `${udpListeningChecks}/${samples.length}` : "0/0"
  };
}
