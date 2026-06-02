import { setTimeout as delay } from "node:timers/promises";

import { fetchVoiceState } from "../api.js";
import { Bot } from "../bot.js";

function createBotOptions(baseOptions, index, isAdmin) {
  return {
    ...baseOptions,
    index,
    isAdmin
  };
}

export async function runVoiceScenario(config) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const host = new URL(baseUrl).hostname;
  const bots = [];
  let speaker = null;
  let voiceGroupId = config.voiceGroupId;
  let serverUdpPort = null;

  const shutdown = async () => {
    for (const bot of [...bots].reverse()) {
      try {
        if (bot === speaker) {
          await bot.stopSpeaking(voiceGroupId);
        }
      } catch {}
      try {
        await bot.shutdown(voiceGroupId);
      } catch {}
    }
  };

  try {
    speaker = new Bot(createBotOptions(config.botOptions, 0, true));
    await speaker.login();
    if (!voiceGroupId) {
      voiceGroupId = await speaker.createVoiceGroup(config.voiceGroupName);
    }
    await speaker.joinGroup(voiceGroupId);
    const state = await fetchVoiceState(baseUrl, speaker.authToken, voiceGroupId);
    serverUdpPort = state?.rtp?.udpPort;
    if (!serverUdpPort) {
      throw new Error("Voice group RTP UDP port not available");
    }
    await speaker.setupUdp(voiceGroupId, host, serverUdpPort);
    const started = await speaker.startSpeaking(voiceGroupId, host, serverUdpPort);
    if (!started) {
      throw new Error("Speaker bot could not start speaking");
    }
    bots.push(speaker);

    for (let i = 1; i <= config.listeners; i += 1) {
      const listener = new Bot(createBotOptions(config.botOptions, i, false));
      await listener.login();
      await listener.joinGroup(voiceGroupId);
      await listener.setupUdp(voiceGroupId, host, serverUdpPort);
      bots.push(listener);
      if (config.rampUpMs > 0) {
        await delay(config.rampUpMs);
      }
    }

    return {
      voiceGroupId,
      serverUdpPort,
      speakerId: speaker.id,
      listenerCount: config.listeners,
      teardown: shutdown
    };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
