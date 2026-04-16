const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  "https://lottery-generator-worker.ushakov-ma.workers.dev";

const PYTHON_ENGINE_BASE =
  process.env.EXPO_PUBLIC_PYTHON_ENGINE_BASE ??
  "https://lottery-generator-python-engine.ushakov-ma.workers.dev";

const ADMIN_KEY = process.env.EXPO_PUBLIC_ADMIN_KEY;

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildPythonUrl(path: string) {
  return `${PYTHON_ENGINE_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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

export async function getOpenDraw() {
  const res = await fetch(buildUrl("/draws/open"));

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
  const res = await fetch(buildUrl("/lotto/otp/generate"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
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
  const res = await fetch(buildUrl("/lotto/otp/validate"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
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

export async function getMe(accessToken: string) {
  const res = await fetch(buildUrl("/auth/me"), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to get auth context - ${text}`);
  }

  return res.json();


export async function generateTickets(options: {
  count?: number;
  maxCommon?: number;
  seed?: string;
  clusterTarget?: number;
}) {
  const res = await fetch(buildUrl("/tickets/generate"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      count: options.count ?? 10,
      maxCommon: options.maxCommon ?? 3,
      seed: options.seed ?? null,
      clusterTarget: options.clusterTarget ?? null,
    }),
  });

  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to generate tickets - ${JSON.stringify(data)}`);
  }

  if (!data?.ok) {
    throw new Error(data?.error || "Failed to generate tickets");
  }

  return data;
}

export async function createBatch(options: {
  targetDrawId?: string | null;
  targetPaisId: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
  generatorVersion?: string;
  weightsVersionKey?: string;
  tickets: Array<{
    ticketIndex: number;
    numbers: number[];
    strong: number;
  }>;
}) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl("/admin/batches/create"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      targetDrawId: options.targetDrawId,
      targetPaisId: options.targetPaisId,
      targetDrawAt: options.targetDrawAt,
      targetDrawSnapshotJson: options.targetDrawSnapshotJson,
      generatorVersion: options.generatorVersion || "mobile-v1",
      weightsVersionKey: options.weightsVersionKey || null,
      tickets: options.tickets,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to create batch - ${text}`);
  }

  return res.json();
}

export async function updateDraws(accessToken: string) {
  const res = await fetch(buildUrl("/admin/update-draws"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to update draws - ${text}`);
  }

  return res.json();
}

export function validateToken(accessToken: string): boolean {
  try {
    // Split the JWT into parts
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decoded = atob(payload);
    const parsed = JSON.parse(decoded);

    // Check if token has expiration
    if (!parsed.exp) {
      return true; // Token without expiration is considered valid
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    return parsed.exp > now;
  } catch (error) {
    return false;
  }
}

export async function getCurrentWeights() {
  const res = await fetch(buildUrl("/weights/current"));

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

export async function recalculateWeights(accessToken: string) {
  const res = await fetch(buildUrl("/admin/recalculate-weights"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to recalculate weights - ${text}`);
  }

  return res.json();
}

export async function importWeights(weightsJson: string, sourceDrawCount: number) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl("/admin/import/weights"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      versionKey: new Date().toISOString(),
      weightsJson: weightsJson,
      sourceDrawCount: sourceDrawCount,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to import weights - ${text}`);
  }

  return res.json();
}

export async function applyBatchToLotto(batchId: number, accessToken: string) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl("/admin/batches/apply-to-lotto"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      batchId,
      accessToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to apply batch to Lotto - ${text}`);
  }

  return res.json();
}

export async function refreshBatchStatuses(accessToken: string) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl("/admin/batches/refresh-statuses"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      accessToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to refresh batch statuses - ${text}`);
  }

  return res.json();
}

export async function archiveBatch(batchId: number) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl(`/admin/batches/${batchId}/archive-checked`), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to archive batch - ${text}`);
  }

  return res.json();
}

export async function deleteBatch(batchId: number) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl(`/admin/batches/${batchId}`), {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to delete batch - ${text}`);
  }

  return res.json();
}

export async function checkBatchResults(batchId: number, accessToken: string) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl(`/admin/batches/${batchId}/results/import`), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      auto: true,
      prizeTable: "regular",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to check batch results - ${text}`);
  }

  return res.json();
}

export async function checkMissingBatchResults(accessToken: string) {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_KEY not configured");
  }

  const res = await fetch(buildUrl("/admin/batches/check-missing-results"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: Failed to check missing batch results - ${text}`);
  }

  return res.json();
}


