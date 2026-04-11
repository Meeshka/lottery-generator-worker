import type { BatchRow, CreateBatchInput } from "../types";

export async function createBatch(
  db: D1Database,
  input: CreateBatchInput,
): Promise<BatchRow> {
  const result = await db
    .prepare(`
      INSERT INTO ticket_batches
        (batch_key, status, target_draw_id, target_pais_id, target_draw_at, target_draw_snapshot_json, generator_version, weights_version_key, ticket_count)
      VALUES (?, 'generated', ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.batchKey,
      input.targetDrawId ?? null,
      input.targetPaisId ?? null,
      input.targetDrawAt ?? null,
      input.targetDrawSnapshotJson ?? null,
      input.generatorVersion ?? null,
      input.weightsVersionKey ?? null,
      input.ticketCount,
    )
    .run();

  const batchId = result.meta.last_row_id;
  if (!batchId) {
    throw new Error("Failed to create batch");
  }

  const row = await getBatchById(db, Number(batchId));
  if (!row) {
    throw new Error("Batch created but could not be reloaded");
  }

  return row;
}

export async function getBatchById(
  db: D1Database,
  batchId: number,
): Promise<BatchRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        batch_key,
        status,
        target_draw_id,
        target_pais_id,
        target_draw_at,
        target_draw_snapshot_json,
        generator_version,
        weights_version_key,
        ticket_count,
        created_at,
        checked_at,
        archived_at,
        deleted_at
      FROM ticket_batches
      WHERE id = ?
      LIMIT 1
    `)
    .bind(batchId)
    .first<BatchRow>();

  return row ?? null;
}

export async function getLatestBatch(
  db: D1Database,
): Promise<BatchRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        batch_key,
        status,
        target_draw_id,
        target_pais_id,
        target_draw_at,
        target_draw_snapshot_json,
        generator_version,
        weights_version_key,
        ticket_count,
        created_at,
        checked_at,
        archived_at,
        deleted_at
      FROM ticket_batches
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .first<BatchRow>();

  return row ?? null;
}

export async function getLatestGeneratedBatch(
  db: D1Database,
): Promise<BatchRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        batch_key,
        status,
        target_draw_id,
        target_pais_id,
        target_draw_at,
        target_draw_snapshot_json,
        generator_version,
        weights_version_key,
        ticket_count,
        created_at,
        checked_at,
        archived_at,
        deleted_at
      FROM ticket_batches
      WHERE status = 'generated'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .first<BatchRow>();

  return row ?? null;
}

export async function markBatchChecked(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET status = 'checked',
          checked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(batchId)
    .run();
}

export async function archiveBatch(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET status = 'archived',
          archived_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(batchId)
    .run();
}
export async function getBatches(
  db: D1Database,
  options?: { limit?: number; status?: string },
): Promise<BatchRow[]> {
  let query = `
    SELECT
      id,
      batch_key,
      status,
      target_draw_id,
      target_pais_id,
      target_draw_at,
      target_draw_snapshot_json,
      generator_version,
      weights_version_key,
      ticket_count,
      created_at,
      checked_at,
      archived_at,
      deleted_at
    FROM ticket_batches
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY created_at DESC, id DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  for (let i = 0; i < params.length; i++) {
    stmt.bind(params[i]);
  }

  const result = await stmt.all<BatchRow>();
  return result.results ?? [];
}
