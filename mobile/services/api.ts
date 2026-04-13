const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  "https://lottery-generator-worker.ushakov-ma.workers.dev";

const LOTTO_API_BASE = "https://api.lottosheli.com/api/v1";

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildLottoUrl(path: string) {
  return `${LOTTO_API_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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

export async function getBatches(limit = 20) {
  const res = await fetch(buildUrl(`/batches?limit=${limit}`));

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

export async function getBatchDetails(id: number) {
  const res = await fetch(buildUrl(`/batches/${id}`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getBatchTickets(id: number) {
  const res = await fetch(buildUrl(`/batches/${id}/tickets`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getBatchSummary(id: number) {
  const res = await fetch(buildUrl(`/batches/${id}/summary`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getBatchResults(id: number) {
  const res = await fetch(buildUrl(`/batches/${id}/results`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function generateOtp(idNumber: string, phoneNumber: string) {
  const res = await fetch(buildLottoUrl("/client/otp/generate"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "lotto-script/1.0",
      "Origin": "https://lottosheli.com",
      "Referer": "https://lottosheli.com/",
    },
    body: JSON.stringify({ idNumber, phoneNumber }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to generate OTP - ${text}`);
  }

  const text = await res.text();
  if (!text) {
    return null; // Empty response is OK for generateOtp
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function validateOtp(idNumber: string, phoneNumber: string, otpCode: string) {
  const res = await fetch(buildLottoUrl("/client/otp/validate"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "lotto-script/1.0",
      "Origin": "https://lottosheli.com",
      "Referer": "https://lottosheli.com/",
    },
    body: JSON.stringify({ idNumber, phoneNumber, otpCode }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to validate OTP - ${text}`);
  }

  const data = await res.json();
  
  if (!data.accessToken) {
    throw new Error("Invalid response: accessToken missing");
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || "",
  };
}
