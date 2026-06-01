import { setTimeout as delay } from "node:timers/promises";

import { fetchVoiceState } from "./api.js";
import { Bot } from "./bot.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const serverHost = new URL(baseUrl).hostname;

  console.log("Starting stress test with config:", {
    baseUrl,
    botCount: config.botCount,
    adminCount: config.adminCount,
    voiceGroupId: config.voiceGroupId ?? "create",
    speakerRotationMs: config.speakerRotationMs,
    rampUpMs: config.rampUpMs
  });

  const bots = [];
  const adminBots = [];
  let voiceGroupId = config.voiceGroupId;

  const firstBot = new Bot({
    baseUrl,
    index: 0,
    isAdmin: true,
    namePrefix: config.userNamePrefix,
    emailPrefix: config.userEmailPrefix,
    password: config.password,
    enableSse: config.enableSse,
    udpBindHost: config.udpBindHost,
    rtpClientHost: config.rtpClientHost,
    frameMs: config.frameMs,
    payloadBytes: config.payloadBytes
  });
  await firstBot.login();
  if (!voiceGroupId) {
    voiceGroupId = await firstBot.createVoiceGroup(config.voiceGroupName);
    console.log(`Created voice group ${voiceGroupId}`);
  }
  const voiceState = await fetchVoiceState(baseUrl, firstBot.authToken, voiceGroupId);
  const serverUdpPort = voiceState.rtp?.udpPort;
  if (!serverUdpPort) {
    throw new Error("Voice group RTP UDP port not available");
  }
  await firstBot.joinGroup(voiceGroupId);
  await firstBot.setupUdp(voiceGroupId, serverHost, serverUdpPort);
  bots.push(firstBot);
  adminBots.push(firstBot);

  for (let i = 1; i < config.botCount; i += 1) {
    const isAdmin = i < config.adminCount;
    const bot = new Bot({
      baseUrl,
      index: i,
      isAdmin,
      namePrefix: config.userNamePrefix,
      emailPrefix: config.userEmailPrefix,
      password: config.password,
      enableSse: config.enableSse,
      udpBindHost: config.udpBindHost,
      rtpClientHost: config.rtpClientHost,
      frameMs: config.frameMs,
      payloadBytes: config.payloadBytes
    });
    await bot.login();
    await bot.joinGroup(voiceGroupId);
    await bot.setupUdp(voiceGroupId, serverHost, serverUdpPort);
    bots.push(bot);
    if (isAdmin) adminBots.push(bot);
    if (config.rampUpMs > 0) await delay(config.rampUpMs);
  }

  if (adminBots.length === 0) {
    throw new Error("No admin bots available for speaker rotation");
  }

  console.log(`Bots ready: ${bots.length} (admins: ${adminBots.length})`);

  let currentSpeaker = -1;
  let rotating = false;

  const rotateSpeaker = async () => {
    if (rotating) return;
    rotating = true;
    try {
      const nextSpeaker = (currentSpeaker + 1) % adminBots.length;
      if (currentSpeaker >= 0) {
        await adminBots[currentSpeaker].stopSpeaking(voiceGroupId);
      }
      const started = await adminBots[nextSpeaker].startSpeaking(
        voiceGroupId,
        serverHost,
        serverUdpPort
      );
      if (started) {
        currentSpeaker = nextSpeaker;
        console.log(`Speaker active: bot ${adminBots[nextSpeaker].id}`);
      } else {
        console.warn(`Failed to start speaker bot ${adminBots[nextSpeaker].id}`);
      }
    } catch (error) {
      console.warn("Speaker rotation failed:", error);
    } finally {
      rotating = false;
    }
  };

  await rotateSpeaker();
  const rotationTimer = setInterval(rotateSpeaker, config.speakerRotationMs);

  const shutdown = async () => {
    clearInterval(rotationTimer);
    if (currentSpeaker >= 0) {
      await adminBots[currentSpeaker].stopSpeaking(voiceGroupId);
    }
    for (const bot of bots) {
      await bot.shutdown(voiceGroupId);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    shutdown().catch((error) => {
      console.warn("Shutdown failed:", error);
    });
  });
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    shutdown().catch((error) => {
      console.warn("Shutdown failed:", error);
    });
  });
}

main().catch((error) => {
  console.error("Stress test failed:", error);
  process.exit(1);
});
