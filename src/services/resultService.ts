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