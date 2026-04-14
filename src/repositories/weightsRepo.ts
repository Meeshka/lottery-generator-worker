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

export async function insertWeights(
  db: D1Database,
  input: {
    versionKey: string;
    weightsJson: string;
    sourceDrawCount: number | null;
  },
): Promise<WeightRow> {
  // First, mark all existing weights as not current
  await db
    .prepare(`      UPDATE weights
      SET is_current = 0
      WHERE is_current = 1
    `)
    .run();

  // Insert new weights as current
  const result = await db
    .prepare(`      INSERT INTO weights
        (version_key, weights_json, source_draw_count, is_current)
      VALUES (?, ?, ?, 1)
    `)
    .bind(
      input.versionKey,
      input.weightsJson,
      input.sourceDrawCount,
    )
    .run();

  const weightsId = result.meta.last_row_id;
  if (!weightsId) {
    throw new Error('Failed to insert weights');
  }

  const row = await db
    .prepare(`      SELECT
        id,
        version_key,
        weights_json,
        source_draw_count,
        is_current,
        created_at
      FROM weights
      WHERE id = ?
      LIMIT 1
    `)
    .bind(Number(weightsId))
    .first<WeightRow>();

  if (!row) {
    throw new Error('Weights inserted but could not be reloaded');
  }

  return row;
}
