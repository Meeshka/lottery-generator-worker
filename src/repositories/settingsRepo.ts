export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export const DEFAULT_DAILY_BATCH_QUOTA = 50;
export const DEFAULT_WEIGHTS_WINDOW = 300;
export const DEFAULT_CLUSTER_WINDOW = 150;

export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(`
      SELECT value
      FROM app_settings
      WHERE key = ?
      LIMIT 1
    `)
    .bind(key)
    .first<{ value: string }>();

  return row?.value ?? null;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(key, value)
    .run();
}

export async function getDailyBatchQuota(
  db: D1Database,
): Promise<number> {
  const value = await getSetting(db, 'daily_batch_quota');
  return value ? parseInt(value, 10) : DEFAULT_DAILY_BATCH_QUOTA;
}

export async function setDailyBatchQuota(
  db: D1Database,
  quota: number,
): Promise<void> {
  await setSetting(db, 'daily_batch_quota', String(quota));
}

function parsePositiveIntOrDefault(
  value: string | null,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface GenerationWindowsSettings {
  weightsWindow: number;
  clusterWindow: number;
}

export async function getGenerationWindows(
  db: D1Database,
): Promise<GenerationWindowsSettings> {
  const weightsValue = await getSetting(db, 'weights_window');
  const clusterValue = await getSetting(db, 'cluster_window');

  return {
    weightsWindow: parsePositiveIntOrDefault(
      weightsValue,
      DEFAULT_WEIGHTS_WINDOW,
    ),
    clusterWindow: parsePositiveIntOrDefault(
      clusterValue,
      DEFAULT_CLUSTER_WINDOW,
    ),
  };
}

export async function setGenerationWindows(
  db: D1Database,
  input: GenerationWindowsSettings,
): Promise<void> {
  await setSetting(db, 'weights_window', String(input.weightsWindow));
  await setSetting(db, 'cluster_window', String(input.clusterWindow));
}
