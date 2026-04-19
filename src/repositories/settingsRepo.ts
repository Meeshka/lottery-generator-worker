export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string;
}

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
  return value ? parseInt(value, 10) : 50; // Default: 50 batches per day
}

export async function setDailyBatchQuota(
  db: D1Database,
  quota: number,
): Promise<void> {
  await setSetting(db, 'daily_batch_quota', String(quota));
}
