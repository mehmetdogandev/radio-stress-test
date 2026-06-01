import EventSource from "eventsource";

import {
  HttpError,
  createVoiceGroup,
  joinVoiceGroup,
  leaveVoiceGroup,
  registerVoiceRtp,
  syncUser,
  togglePtt
} from "./api.js";
import { bindUdpSocket, buildRtpPacket, sendUdpPacket } from "./udp.js";

const MAX_UINT32 = 2 ** 32;

export class Bot {
  constructor(options) {
    this.options = options;
    this.token = undefined;
    this.userId = undefined;
    this.udpSocket = undefined;
    this.udpPort = undefined;
    this.sse = undefined;
    this.speaking = false;
    this.txTimer = undefined;
    this.seq = 1;
    this.payload = Buffer.alloc(this.options.payloadBytes, 0);
    this.sendErrorLogged = false;
  }

  get authToken() {
    if (!this.token) throw new Error("Bot is not authenticated");
    return this.token;
  }

  get id() {
    if (!this.userId) throw new Error("Bot is not authenticated");
    return this.userId;
  }

  get isAdmin() {
    return this.options.isAdmin;
  }

  async login() {
    const index = this.options.index.toString().padStart(4, "0");
    const name = `${this.options.namePrefix}-${index}`;
    const email = `${this.options.emailPrefix}-${index}@stress.local`;
    const role = this.options.isAdmin ? "admin" : "user";
    const result = await syncUser(this.options.baseUrl, {
      name,
      email,
      password: this.options.password,
      role
    });
    this.token = result.token;
    this.userId = result.userId;
  }

  async createVoiceGroup(name) {
    if (!this.options.isAdmin) {
      throw new Error("Only admin bots can create voice groups");
    }
    return createVoiceGroup(this.options.baseUrl, this.authToken, name);
  }

  async joinGroup(groupId) {
    await joinVoiceGroup(this.options.baseUrl, this.authToken, groupId);
    if (this.options.enableSse) {
      this.startSse();
    }
  }

  async setupUdp(groupId, serverHost, serverPort) {
    const { socket, port } = await bindUdpSocket(this.options.udpBindHost);
    this.udpSocket = socket;
    this.udpPort = port;
    socket.on("message", () => {});
    await registerVoiceRtp(
      this.options.baseUrl,
      this.authToken,
      groupId,
      port,
      this.options.rtpClientHost
    );
    await this.sendProbe(serverHost, serverPort, groupId);
  }

  async startSpeaking(groupId, serverHost, serverPort) {
    if (this.speaking) return true;
    if (!this.options.isAdmin) return false;
    let result;
    try {
      result = await togglePtt(this.options.baseUrl, this.authToken, groupId);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        return false;
      }
      throw error;
    }
    if (!result.speaking) return false;
    this.speaking = true;
    this.startTxLoop(serverHost, serverPort, groupId);
    return true;
  }

  async stopSpeaking(groupId) {
    if (!this.speaking) return;
    this.stopTxLoop();
    await togglePtt(this.options.baseUrl, this.authToken, groupId);
    this.speaking = false;
  }

  async shutdown(groupId) {
    this.stopTxLoop();
    if (this.speaking) {
      try {
        await togglePtt(this.options.baseUrl, this.authToken, groupId);
      } catch (error) {
        console.warn(`Bot ${this.id} failed to release PTT on shutdown:`, error);
      }
      this.speaking = false;
    }
    if (this.sse) this.sse.close();
    if (this.udpSocket) this.udpSocket.close();
    try {
      await leaveVoiceGroup(this.options.baseUrl, this.authToken, groupId);
    } catch (error) {
      console.warn(`Bot ${this.id} failed to leave voice group:`, error);
    }
  }

  startSse() {
    if (this.sse) return;
    const baseUrl = this.options.baseUrl.endsWith("/")
      ? this.options.baseUrl.slice(0, -1)
      : this.options.baseUrl;
    const url = `${baseUrl}/api/voice/events?token=${encodeURIComponent(this.authToken)}`;
    this.sse = new EventSource(url);
    this.sse.onerror = () => {};
  }

  async sendProbe(serverHost, serverPort, groupId) {
    if (!this.udpSocket) throw new Error("UDP socket not initialized");
    const packet = buildRtpPacket({
      voiceGroupId: groupId,
      senderAdminId: this.id,
      seq: 0,
      timestampMs: BigInt(Date.now()),
      payload: Buffer.alloc(0)
    });
    await sendUdpPacket(this.udpSocket, packet, serverHost, serverPort);
  }

  startTxLoop(serverHost, serverPort, groupId) {
    if (!this.udpSocket) throw new Error("UDP socket not initialized");
    if (this.txTimer) return;
    const frameMs = Math.max(this.options.frameMs, 5);
    this.txTimer = setInterval(() => {
      const packet = buildRtpPacket({
        voiceGroupId: groupId,
        senderAdminId: this.id,
        seq: this.seq,
        timestampMs: BigInt(Date.now()),
        payload: this.payload
      });
      this.seq = (this.seq + 1) % MAX_UINT32;
      void sendUdpPacket(this.udpSocket, packet, serverHost, serverPort).catch((error) => {
        if (this.sendErrorLogged) return;
        this.sendErrorLogged = true;
        console.warn(`Bot ${this.id} UDP send failed:`, error);
      });
    }, frameMs);
  }

  stopTxLoop() {
    if (this.txTimer) {
      clearInterval(this.txTimer);
      this.txTimer = undefined;
    }
  }
}
