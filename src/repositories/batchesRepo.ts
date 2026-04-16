import type { BatchRow, CreateBatchInput } from "../types";

export async function createBatch(
  db: D1Database,
  input: CreateBatchInput,
): Promise<BatchRow> {
  const result = await db
    .prepare(`
      INSERT INTO ticket_batches
        (
          batch_key,
          status,
          target_draw_id,
          target_pais_id,
          target_draw_at,
          target_draw_snapshot_json,
          generator_version,
          weights_version_key,
          ticket_count
        )
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

const BASE_BATCH_SELECT = `
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
    submitted_at,
    confirmed_at,
    external_sync_at,
    external_match_status,
    external_ticket_id,
    confirmed_pais_id,
    confirmed_total_price,
    last_sync_error,
    sync_attempts,
    archived_at,
    deleted_at
  FROM ticket_batches
`;

export async function getBatchById(
  db: D1Database,
  batchId: number,
): Promise<BatchRow | null> {
  const row = await db
    .prepare(`
      ${BASE_BATCH_SELECT}
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
      ${BASE_BATCH_SELECT}
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
      ${BASE_BATCH_SELECT}
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

export async function markBatchSubmitted(
  db: D1Database,
  batchId: number,
): Promise<BatchRow | null> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET status = 'submitted',
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(batchId)
    .run();

  return await getBatchById(db, batchId);
}

export interface MarkBatchConfirmedOptions {
  matchStatus?: string | null;
  confirmedPaisId?: number | null;
  confirmedTotalPrice?: number | null;
}

export async function markBatchConfirmed(
  db: D1Database,
  batchId: number,
  externalTicketId: string,
  options?: MarkBatchConfirmedOptions,
): Promise<BatchRow | null> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP,
          external_sync_at = CURRENT_TIMESTAMP,
          external_match_status = ?,
          external_ticket_id = ?,
          confirmed_pais_id = ?,
          confirmed_total_price = ?,
          last_sync_error = NULL
      WHERE id = ?
    `)
    .bind(
      options?.matchStatus ?? "full",
      externalTicketId,
      options?.confirmedPaisId ?? null,
      options?.confirmedTotalPrice ?? null,
      batchId,
    )
    .run();

  return await getBatchById(db, batchId);
}

export async function touchSyncAttempt(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET external_sync_at = CURRENT_TIMESTAMP,
          sync_attempts = COALESCE(sync_attempts, 0) + 1
      WHERE id = ?
    `)
    .bind(batchId)
    .run();
}

export async function saveSyncError(
  db: D1Database,
  batchId: number,
  error: string,
): Promise<void> {
  await db
    .prepare(`
      UPDATE ticket_batches
      SET external_sync_at = CURRENT_TIMESTAMP,
          last_sync_error = ?
      WHERE id = ?
    `)
    .bind(error, batchId)
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
  options?: { limit?: number; status?: string; deleted?: boolean },
): Promise<BatchRow[]> {
  let query = `
    ${BASE_BATCH_SELECT}
  `;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options?.deleted !== false) {
    conditions.push("deleted_at IS NULL");
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY created_at DESC, id DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  const result = await db
    .prepare(query)
    .bind(...params)
    .all<BatchRow>();

  return result.results ?? [];
}

export interface UpdateBatchTargetDrawInfoInput {
  targetDrawId?: string | null;
  targetPaisId?: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
}
export async function updateBatchTargetDrawInfo(
  db: D1Database,
  batchId: number,
  input: UpdateBatchTargetDrawInfoInput,
): Promise<BatchRow | null> {
  await db
  .prepare(`
    UPDATE ticket_batches
    SET
      target_draw_id = ?,
      target_pais_id = ?,
      target_draw_at = ?,
      target_draw_snapshot_json = ?
    WHERE id = ?
  `)
    .bind(
      input.targetDrawId ?? null,
      input.targetPaisId ?? null,
      input.targetDrawAt ?? null,
      input.targetDrawSnapshotJson ?? null,
      batchId,
    )
    .run();
  return await getBatchById(db, batchId);
}

export async function getBatchByExternalTicketId(
  db: D1Database,
  externalTicketId: string,
): Promise<BatchRow | null> {
  const row = await db
    .prepare(`
      ${BASE_BATCH_SELECT}
      WHERE external_ticket_id = ?
      LIMIT 1
    `)
    .bind(externalTicketId)
    .first<BatchRow>();

  return row ?? null;
}

export async function deleteBatch(
    db: D1Database,
    batchId: number
):Promise<void>{
  await db
    .prepare(`
      UPDATE ticket_batches
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(batchId)
    .run();

}