export interface WeightRow {
  id: number;
  version_key: string;
  weights_json: string;
  source_draw_count: number | null;
  is_current: number;
  created_at: string;
}

export async function getCurrentWeights(
  db: D1Database,
): Promise<WeightRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        version_key,
        weights_json,
        source_draw_count,
        is_current,
        created_at
      FROM weights
      WHERE is_current = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .first<WeightRow>();

  return row ?? null;
}