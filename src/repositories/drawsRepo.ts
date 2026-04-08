export interface DrawRow {
  id: number;
  draw_id: string;
  draw_date: string;
  numbers_json: string;
  strong_number: number | null;
  raw_json: string | null;
  created_at: string;
}

export async function getLatestDraw(
  db: D1Database,
): Promise<DrawRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        draw_id,
        draw_date,
        numbers_json,
        strong_number,
        raw_json,
        created_at
      FROM draws
      ORDER BY draw_date DESC, draw_id DESC
      LIMIT 1
    `)
    .first<DrawRow>();

  return row ?? null;
}