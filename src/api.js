export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return { raw: text };
}

async function requestJson(baseUrl, path, init, token) {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const payload = await parseResponse(response);
    const message = payload?.error || payload?.message || response.statusText;
    throw new HttpError(response.status, `${response.statusText}: ${message}`);
  }
  return parseResponse(response);
}

export async function syncUser(baseUrl, payload) {
  const data = await requestJson(baseUrl, "/api/users/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { token: data.token, userId: data.user.id, role: data.user.role };
}

export async function createVoiceGroup(baseUrl, token, name) {
  const data = await requestJson(
    baseUrl,
    "/api/voice-groups",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    },
    token
  );
  return data.id;
}

export async function joinVoiceGroup(baseUrl, token, voiceGroupId) {
  await requestJson(baseUrl, `/api/voice-groups/${voiceGroupId}/join`, {
    method: "POST"
  }, token);
}

export async function leaveVoiceGroup(baseUrl, token, voiceGroupId) {
  await requestJson(baseUrl, `/api/voice-groups/${voiceGroupId}/leave`, {
    method: "POST"
  }, token);
}

export async function fetchVoiceState(baseUrl, token, voiceGroupId) {
  return requestJson(
    baseUrl,
    `/api/voice-groups/${voiceGroupId}/state`,
    { method: "GET" },
    token
  );
}

export async function registerVoiceRtp(baseUrl, token, voiceGroupId, listenPort, clientHost) {
  await requestJson(
    baseUrl,
    `/api/voice-groups/${voiceGroupId}/rtp/register`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listenPort, clientHost })
    },
    token
  );
}

export async function togglePtt(baseUrl, token, voiceGroupId) {
  return requestJson(
    baseUrl,
    `/api/voice-groups/${voiceGroupId}/ptt/toggle`,
    { method: "POST" },
    token
  );
}
