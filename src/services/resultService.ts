import type { TicketResultInput, TicketResultRow } from "../types";
import { getLatestDraw, getDrawById } from "../repositories/drawsRepo";
import {
  getBatchById,
  getLatestBatch,
  getLatestGeneratedBatch,
  markBatchChecked,
} from "../repositories/batchesRepo";
import { getTicketByBatchIdAndIndex, getTicketsByBatchId } from "../repositories/ticketsRepo";
import {
  deleteResultsByBatchId,
  getResultsByBatchId,
  insertTicketResults,
} from "../repositories/resultsRepo";

export interface ImportBatchResultsInput {
  batchId: number;
  drawId?: string | null;
  prizeTable?: string | null;
  results: TicketResultInput[];
}

export interface CalculateBatchResultsInput {
  batchId: number;
  drawDbId?: number | null;
  prizeTable?: string | null;
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

function parseTicketNumbersJson(value: string, batchId: number, ticketIndex: number): number[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid numbers_json for batch ${batchId}, ticketIndex ${ticketIndex}`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new Error(
      `Ticket ${ticketIndex} in batch ${batchId} must contain exactly 6 numbers`,
    );
  }

  const numbers = parsed.map((n) => Number(n)).sort((a, b) => a - b);

  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 37)) {
    throw new Error(
      `Ticket ${ticketIndex} in batch ${batchId} contains invalid numbers`,
    );
  }

  if (new Set(numbers).size !== 6) {
    throw new Error(
      `Ticket ${ticketIndex} in batch ${batchId} contains duplicate numbers`,
    );
  }

  return numbers;
}

function parseWinningTables(rawJson: string | null): Record<string, unknown> | null {
  if (!rawJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const winningTables = parsed?.winningTables;

    if (!winningTables || typeof winningTables !== "object") {
      return null;
    }

    return winningTables as Record<string, unknown>;
  } catch {
    return null;
  }
}

function calculatePrize(
  winningTables: Record<string, unknown> | null,
  prizeTable: string,
  matchCount: number,
  strongMatch: boolean | null,
): number | null {
  if (matchCount < 3) {
    return 0;
  }

  if (!winningTables) {
    return null;
  }

  const prizeTableValues = winningTables[prizeTable];
  if (!prizeTableValues || typeof prizeTableValues !== "object") {
    return null;
  }

  const key = strongMatch === true ? `Strong${matchCount}` : `G${matchCount}`;
  const rawPrize = (prizeTableValues as Record<string, unknown>)[key];

  if (rawPrize === null || rawPrize === undefined) {
    return null;
  }

  const numericPrize = Number(rawPrize);
  return Number.isFinite(numericPrize) ? numericPrize : null;
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

  await deleteResultsByBatchId(db, input.batchId);
  await insertTicketResults(db, rowsToInsert);
  await markBatchChecked(db, input.batchId);

  return {
    batchId: input.batchId,
    drawDbId: latestDraw.id,
    inserted: rowsToInsert.length,
  };
}

export async function calculateAndImportBatchResults(
  db: D1Database,
  input: CalculateBatchResultsInput,
): Promise<{ batchId: number; drawDbId: number; inserted: number }> {
  if (!Number.isInteger(input.batchId) || input.batchId < 1) {
    throw new Error("batchId must be a positive integer");
  }

  const batch = await getBatchById(db, input.batchId);
  if (!batch) {
    throw new Error(`Batch not found: ${input.batchId}`);
  }

  const draw = input.drawDbId
    ? await getDrawById(db, input.drawDbId)
    : await getLatestDraw(db);

  if (!draw) {
    throw new Error("No suitable draw found in database");
  }

  const tickets = await getTicketsByBatchId(db, input.batchId);
  if (!tickets.length) {
    throw new Error(`Batch ${input.batchId} has no tickets`);
  }

  const drawNumbers = parseTicketNumbersJson(draw.numbers_json, input.batchId, 0);
  const drawNumberSet = new Set(drawNumbers);
  const winningTables = parseWinningTables(draw.raw_json);
  const prizeTable = input.prizeTable ?? "regular";

  const rowsToInsert = tickets.map((ticket) => {
    const ticketNumbers = parseTicketNumbersJson(
      ticket.numbers_json,
      input.batchId,
      ticket.ticket_index,
    );

    const matchedNumbers = ticketNumbers.filter((n) => drawNumberSet.has(n));
    const matchCount = matchedNumbers.length;

    const strongMatch =
      ticket.strong_number === null || draw.strong_number === null
        ? null
        : ticket.strong_number === draw.strong_number;

    const qualifies3Plus = matchCount >= 3;

    return {
      ticketId: ticket.id,
      drawDbId: draw.id,
      matchCount,
      matchedNumbers,
      strongMatch,
      qualifies3Plus,
      prize: calculatePrize(winningTables, prizeTable, matchCount, strongMatch),
      prizeTable,
    };
  });

  await deleteResultsByBatchId(db, input.batchId);
  await insertTicketResults(db, rowsToInsert);

  if (batch.status === "archived") {
    await markBatchChecked(db, input.batchId, { changeStatus: false });
  } else {
    await markBatchChecked(db, input.batchId);
  }

  return {
    batchId: input.batchId,
    drawDbId: draw.id,
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
