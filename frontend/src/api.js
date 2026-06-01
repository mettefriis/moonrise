const BASE = "";
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "";

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Request failed");
  }
  return r.json();
}

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error("Request failed");
  return r.json();
}

export const api = {
  createGame: (name) => post("/api/games", { name }),
  joinGame: (code, name) => post(`/api/games/${code}/join`, { name }),
  getState: (code, playerId) =>
    get(`/api/games/${code}/state${playerId ? `?player_id=${playerId}` : ""}`),
  startGame: (code, playerId) =>
    post(`/api/games/${code}/start?player_id=${playerId}`, {}),
  wolfVote: (code, playerId, targetId) =>
    post(`/api/games/${code}/wolf-vote`, { player_id: playerId, target_id: targetId }),
  doctorSave: (code, playerId, targetId) =>
    post(`/api/games/${code}/doctor-save`, { player_id: playerId, target_id: targetId }),
  seerDivine: (code, playerId, targetId) =>
    post(`/api/games/${code}/seer-divine`, { player_id: playerId, target_id: targetId }),
  dayVote: (code, playerId, targetId) =>
    post(`/api/games/${code}/day-vote`, { player_id: playerId, target_id: targetId }),
  advanceNight: (code, playerId) =>
    post(`/api/games/${code}/advance-night?player_id=${playerId}`, {}),
  advanceToDay: (code, playerId) =>
    post(`/api/games/${code}/advance-to-day?player_id=${playerId}`, {}),
  resolveVote: (code, playerId) =>
    post(`/api/games/${code}/resolve-vote?player_id=${playerId}`, {}),
  hunterShot: (code, playerId, targetId) =>
    post(`/api/games/${code}/hunter-shot`, { player_id: playerId, target_id: targetId }),
  oracle: async (code, playerId, subjectName, videoBlob) => {
    const form = new FormData();
    form.append("video", videoBlob, "recording.webm");
    const r = await fetch(
      `${BACKEND}/api/games/${code}/oracle?player_id=${playerId}&subject_name=${encodeURIComponent(subjectName)}`,
      { method: "POST", body: form }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: "Oracle unreachable" }));
      throw new Error(err.detail);
    }
    return r.json();
  },
};
