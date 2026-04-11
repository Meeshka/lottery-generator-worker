export interface DrawRow {
  id: number;
  draw_id: string;
  draw_date: string;
  numbers_json: string;
  strong_number: number | null;
  raw_json: string | null;
  pais_id: number | null;
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
        pais_id,
        created_at
      FROM draws
      ORDER BY draw_date DESC, draw_id DESC
      LIMIT 1
    `)
    .first<DrawRow>();

  return row ?? null;
}

export async function getDrawByPaisId(
  db: D1Database,
  paisId: number,
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
        pais_id,
        created_at
      FROM draws
      WHERE pais_id = ?
      LIMIT 1
    `)
    .bind(paisId)
    .first<DrawRow>();

  return row ?? null;
}

export async function insertDraw(
  db: D1Database,
  input: {
    drawId: string;
    drawDate: string;
    numbersJson: string;
    strongNumber: number | null;
    rawJson: string | null;
    paisId: number | null;
  },
): Promise<DrawRow> {
  const result = await db
    .prepare(`
      INSERT INTO draws
        (draw_id, draw_date, numbers_json, strong_number, raw_json, pais_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.drawId,
      input.drawDate,
      input.numbersJson,
      input.strongNumber,
      input.rawJson,
      input.paisId,
    )
    .run();

  const drawId = result.meta.last_row_id;
  if (!drawId) {
    throw new Error("Failed to create draw");
  }

  const row = await db
    .prepare(`
      SELECT
        id,
        draw_id,
        draw_date,
        numbers_json,
        strong_number,
        raw_json,
        pais_id,
        created_at
      FROM draws
      WHERE id = ?
      LIMIT 1
    `)
    .bind(Number(drawId))
    .first<DrawRow>();

  if (!row) {
    throw new Error("Draw created but could not be reloaded");
  }

  return row;
}
