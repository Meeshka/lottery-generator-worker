const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  "https://lottery-generator-worker.ushakov-ma.workers.dev";

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function healthCheck() {
  const res = await fetch(buildUrl("/health"));

  const text = await res.text();

  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function getLatestDraw() {
  const res = await fetch(buildUrl("/draws/latest"));

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}