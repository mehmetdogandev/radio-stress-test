const DEFAULTS = {
  baseUrl: "http://127.0.0.1:8080",
  botCount: 50,
  adminCount: 1,
  voiceGroupName: "Stress Test",
  rampUpMs: 100,
  speakerRotationMs: 30_000,
  frameMs: 20,
  payloadBytes: 640,
  enableSse: false,
  password: "bot-pass-123",
  userNamePrefix: "stress-bot",
  userEmailPrefix: "stress-bot",
  udpBindHost: "0.0.0.0"
};

function readInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function readOptionalNumber(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

export function loadConfig() {
  const baseUrl = process.env.SERVER_BASE_URL ?? DEFAULTS.baseUrl;
  const botCount = readInt("BOT_COUNT", DEFAULTS.botCount);
  if (botCount < 1) {
    throw new Error("BOT_COUNT must be >= 1");
  }

  let adminCount = readInt("ADMIN_COUNT", DEFAULTS.adminCount);
  if (adminCount < 1) adminCount = 1;
  if (adminCount > botCount) adminCount = botCount;

  const voiceGroupId = readOptionalNumber("VOICE_GROUP_ID");
  const voiceGroupName = process.env.VOICE_GROUP_NAME ?? DEFAULTS.voiceGroupName;
  const rampUpMs = readInt("BOT_RAMP_MS", DEFAULTS.rampUpMs);
  const speakerRotationMs = readInt("SPEAKER_ROTATION_MS", DEFAULTS.speakerRotationMs);
  const frameMs = readInt("FRAME_MS", DEFAULTS.frameMs);
  const payloadBytes = readInt("PAYLOAD_BYTES", DEFAULTS.payloadBytes);
  const enableSse = readBool("ENABLE_SSE", DEFAULTS.enableSse);
  const password = process.env.BOT_PASSWORD ?? DEFAULTS.password;
  const userNamePrefix = process.env.BOT_NAME_PREFIX ?? DEFAULTS.userNamePrefix;
  const userEmailPrefix = process.env.BOT_EMAIL_PREFIX ?? DEFAULTS.userEmailPrefix;
  const udpBindHost = process.env.UDP_BIND_HOST ?? DEFAULTS.udpBindHost;
  const rtpClientHost = process.env.RTP_CLIENT_HOST;

  return {
    baseUrl,
    botCount,
    adminCount,
    voiceGroupId,
    voiceGroupName,
    rampUpMs,
    speakerRotationMs,
    frameMs,
    payloadBytes,
    enableSse,
    password,
    userNamePrefix,
    userEmailPrefix,
    udpBindHost,
    rtpClientHost
  };
}
