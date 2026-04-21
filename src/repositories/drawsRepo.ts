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

export async function getDrawByDrawId(
  db: D1Database,
  drawId: string,
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
      WHERE draw_id = ?
      LIMIT 1
    `)
    .bind(drawId)
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

export async function upsertDraw(
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
      INSERT OR REPLACE INTO draws
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
    throw new Error("Failed to upsert draw");
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
    throw new Error("Draw upserted but could not be reloaded");
  }


  return row;
}


export async function updateDrawById(
  db: D1Database,
  id: number,
  input: {
    drawDate: string;
    numbersJson: string;
    strongNumber: number | null;
    rawJson: string | null;
    paisId: number | null;
  },
): Promise<DrawRow> {
  await db
    .prepare(`
      UPDATE draws
      SET
        draw_date = ?,
        numbers_json = ?,
        strong_number = ?,
        raw_json = ?,
        pais_id = COALESCE(?, pais_id)
      WHERE id = ?
    `)
    .bind(
      input.drawDate,
      input.numbersJson,
      input.strongNumber,
      input.rawJson,
      input.paisId,
      id,
    )
    .run();

  const row = await getDrawById(db, id);
  if (!row) {
    throw new Error("Draw updated but could not be reloaded");
  }

  return row;
}

export async function upsertDrawByIdentity(
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
  let existing: DrawRow | null = null;

  // 1. Primary identity for CSV imports: paisId
  if (input.paisId !== null) {
    existing = await getDrawByPaisId(db, input.paisId);
  }

  // 2. Fallback identity: drawId
  if (!existing) {
    existing = await getDrawByDrawId(db, input.drawId);
  }

  // If found, keep existing draw_id unchanged and update the rest
  if (existing) {
    return updateDrawById(db, existing.id, {
      drawDate: input.drawDate,
      numbersJson: input.numbersJson,
      strongNumber: input.strongNumber,
      rawJson: input.rawJson,
      paisId: input.paisId,
    });
  }

  // New row
  return insertDraw(db, input);
}

export async function countDraws(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM draws
    `)
    .first<{ count: number }>();

  return result?.count ?? 0;
}


export async function getRecentDrawsForWeights(
  db: D1Database,
  limit: number,
): Promise<DrawRow[]> {
  const result = await db
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
      ORDER BY draw_date DESC, COALESCE(pais_id, 0) DESC, id DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<DrawRow>();

  // Return oldest -> newest inside the selected window
  return [...(result.results ?? [])].reverse();
}

export async function getDrawById(
  db: D1Database,
  id: number,
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
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first<DrawRow>();

  return row ?? null;
}