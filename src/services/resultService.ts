import type { TicketResultInput, TicketResultRow } from "../types";
import { getLatestDraw } from "../repositories/drawsRepo";
import { getBatchById, getLatestGeneratedBatch, markBatchChecked } from "../repositories/batchesRepo";
import { getTicketByBatchIdAndIndex } from "../repositories/ticketsRepo";
import { getResultsByBatchId, insertTicketResults } from "../repositories/resultsRepo";

export interface ImportBatchResultsInput {
  batchId: number;
  drawId?: string | null;
  prizeTable?: string | null;
  results: TicketResultInput[];
}

export interface BatchSummary {
  batchId: number;
  batchKey: string;
  status: string;
  ticketCount: number;
  checkedResultsCount: number;
  ticketsWith3Plus: number;
  totalPrize: number;
  drawDbId: number | null;
  checkedAt: string | null;
  createdAt: string;
}

function validateResultInput(item: TicketResultInput): void {
  if (!Number.isInteger(item.ticketIndex) || item.ticketIndex < 1) {
    throw new Error(`Invalid ticketIndex: ${item.ticketIndex}`);
  }

  if (!Number.isInteger(item.matchCount) || item.matchCount < 0 || item.matchCount > 6) {
    throw new Error(`Ticket ${item.ticketIndex}: matchCount must be in range 0..6`);
  }

  if (!Array.isArray(item.matchedNumbers)) {
    throw new Error(`Ticket ${item.ticketIndex}: matchedNumbers must be an array`);
  }

  if (!item.matchedNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 37)) {
    throw new Error(`Ticket ${item.ticketIndex}: matchedNumbers must be integers in range 1..37`);
  }

  if (new Set(item.matchedNumbers).size !== item.matchedNumbers.length) {
    throw new Error(`Ticket ${item.ticketIndex}: matchedNumbers contain duplicates`);
  }

  if (item.qualifies3Plus !== (item.matchCount >= 3)) {
    throw new Error(`Ticket ${item.ticketIndex}: qualifies3Plus does not match matchCount`);
  }
}

export async function importBatchResults(
  db: D1Database,
  input: ImportBatchResultsInput,
): Promise<{ batchId: number; drawDbId: number; inserted: number }> {
  if (!Number.isInteger(input.batchId) || input.batchId < 1) {
    throw new Error("batchId must be a positive integer");
  }

  if (!Array.isArray(input.results) || input.results.length === 0) {
    throw new Error("results array must not be empty");
  }

  const batch = await getBatchById(db, input.batchId);
  if (!batch) {
    throw new Error(`Batch not found: ${input.batchId}`);
  }

  const latestDraw = await getLatestDraw(db);
  if (!latestDraw) {
    throw new Error("No draws found in database");
  }

  const drawMatchesRequested =
    input.drawId === undefined ||
    input.drawId === null ||
    String(input.drawId) === String(latestDraw.draw_id);

  if (!drawMatchesRequested) {
    throw new Error(
      `Provided drawId ${input.drawId} does not match latest draw ${latestDraw.draw_id}`,
    );
  }

  const rowsToInsert: Array<{
    ticketId: number;
    drawDbId: number;
    matchCount: number;
    matchedNumbers: number[];
    strongMatch?: boolean | null;
    qualifies3Plus: boolean;
    prize?: number | null;
    prizeTable?: string | null;
  }> = [];

  for (const result of input.results) {
    validateResultInput(result);

    const ticket = await getTicketByBatchIdAndIndex(db, input.batchId, result.ticketIndex);
    if (!ticket) {
      throw new Error(
        `Ticket not found for batch ${input.batchId}, ticketIndex ${result.ticketIndex}`,
      );
    }

    rowsToInsert.push({
      ticketId: ticket.id,
      drawDbId: latestDraw.id,
      matchCount: result.matchCount,
      matchedNumbers: result.matchedNumbers,
      strongMatch: result.strongMatch ?? null,
      qualifies3Plus: result.qualifies3Plus,
      prize: result.prize ?? null,
      prizeTable: result.prizeTable ?? input.prizeTable ?? null,
    });
  }

  await insertTicketResults(db, rowsToInsert);
  await markBatchChecked(db, input.batchId);

  return {
    batchId: input.batchId,
    drawDbId: latestDraw.id,
    inserted: rowsToInsert.length,
  };
}

export async function getBatchResults(
  db: D1Database,
  batchId: number,
): Promise<TicketResultRow[]> {
  return getResultsByBatchId(db, batchId);
}

export async function getLatestGeneratedBatchId(
  db: D1Database,
): Promise<number | null> {
  const batch = await getLatestGeneratedBatch(db);
  return batch?.id ?? null;
}

export async function getBatchSummary(
  db: D1Database,
  batchId: number,
): Promise<BatchSummary | null> {
  const batch = await getBatchById(db, batchId);
  if (!batch) return null;

  const aggregate = await db
    .prepare(`
      SELECT
        COUNT(tr.id) AS checked_results_count,
        COALESCE(SUM(CASE WHEN tr.qualifies_3plus = 1 THEN 1 ELSE 0 END), 0) AS tickets_with_3plus,
        COALESCE(SUM(COALESCE(tr.prize, 0)), 0) AS total_prize,
        MAX(tr.draw_id) AS draw_db_id
      FROM tickets t
      LEFT JOIN ticket_results tr ON tr.ticket_id = t.id
      WHERE t.batch_id = ?
    `)
    .bind(batchId)
    .first<{
      checked_results_count: number | string | null;
      tickets_with_3plus: number | string | null;
      total_prize: number | string | null;
      draw_db_id: number | string | null;
    }>();

  return {
    batchId: batch.id,
    batchKey: batch.batch_key,
    status: batch.status,
    ticketCount: batch.ticket_count,
    checkedResultsCount: Number(aggregate?.checked_results_count ?? 0),
    ticketsWith3Plus: Number(aggregate?.tickets_with_3plus ?? 0),
    totalPrize: Number(aggregate?.total_prize ?? 0),
    drawDbId:
      aggregate?.draw_db_id === null || aggregate?.draw_db_id === undefined
        ? null
        : Number(aggregate.draw_db_id),
    checkedAt: batch.checked_at,
    createdAt: batch.created_at,
  };
}

export async function getLatestBatchSummary(
  db: D1Database,
): Promise<BatchSummary | null> {
  const batch = await getLatestBatch(db);
  if (!batch) return null;

  return getBatchSummary(db, batch.id);
}