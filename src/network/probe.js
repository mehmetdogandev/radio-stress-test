import net from "node:net";
import dgram from "node:dgram";

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      json,
      raw: text
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeHealth(baseUrl) {
  const result = await fetchJson(`${baseUrl}/health`);
  return {
    ...result,
    valid: result.ok && result.json?.ok === true
  };
}

export async function probeStatus(baseUrl) {
  const result = await fetchJson(`${baseUrl}/status`);
  return {
    ...result,
    valid: result.ok && result.json?.ok === true && typeof result.json?.network === "object"
  };
}

export async function probeTcp(host, port, timeoutMs = 4000) {
  const startedAt = Date.now();
  const socket = new net.Socket();
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => onError(new Error(`TCP timeout after ${timeoutMs}ms`)));
    socket.once("error", onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve();
    });
  });
  return { ok: true, elapsedMs: Date.now() - startedAt };
}

export async function probeUdp(host, port, timeoutMs = 4000) {
  const socket = dgram.createSocket("udp4");
  const payload = Buffer.from("aksiyonsoft-radio-udp-probe", "utf8");
  const startedAt = Date.now();
  const result = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };

    const timer = setTimeout(() => {
      finish({ ok: true, elapsedMs: Date.now() - startedAt, detail: "UDP packet sent (no ACK expected)" });
    }, Math.min(timeoutMs, 1500));

    socket.once("error", (error) => {
      finish({ ok: false, elapsedMs: Date.now() - startedAt, detail: `UDP error: ${error.message}` });
    });

    socket.send(payload, port, host, (error) => {
      if (error) {
        finish({ ok: false, elapsedMs: Date.now() - startedAt, detail: `UDP send failed: ${error.message}` });
      }
    });
  });
  return result;
}
