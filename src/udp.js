import dgram from "node:dgram";

const MAX_UINT32 = 2 ** 32;

function normalizeSeq(value) {
  const mod = value % MAX_UINT32;
  return mod < 0 ? mod + MAX_UINT32 : mod;
}

export function buildRtpPacket({ voiceGroupId, senderAdminId, seq, timestampMs, payload }) {
  const headerSize = 20;
  const buffer = Buffer.alloc(headerSize + payload.length);
  buffer.writeUInt32BE(voiceGroupId, 0);
  buffer.writeUInt32BE(senderAdminId, 4);
  buffer.writeUInt32BE(normalizeSeq(seq), 8);
  buffer.writeBigUInt64BE(timestampMs, 12);
  payload.copy(buffer, headerSize);
  return buffer;
}

export async function bindUdpSocket(bindHost) {
  const socket = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, bindHost, () => {
      socket.off("error", reject);
      resolve();
    });
  });
  const address = socket.address();
  if (typeof address === "string") {
    throw new Error("Unexpected UDP address type");
  }
  return { socket, port: address.port };
}

export async function sendUdpPacket(socket, packet, host, port) {
  await new Promise((resolve, reject) => {
    socket.send(packet, port, host, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
