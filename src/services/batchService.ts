import type { BatchRow, CreateBatchInput, TicketInput, TicketRow } from "../types";
import { createBatch, getBatchById, getLatestBatch, getLatestGeneratedBatch, archiveBatch, markBatchChecked, getBatches as getBatchesRepo } from "../repositories/batchesRepo";
import { getTicketsByBatchId, insertTickets } from "../repositories/ticketsRepo";

export interface CreateBatchWithTicketsInput {
  batchKey: string;
  targetDrawId?: string | null;
  targetPaisId?: number | null;
  targetDrawAt?: string | null;
  targetDrawSnapshotJson?: string | null;
  generatorVersion?: string | null;
  weightsVersionKey?: string | null;
  tickets: TicketInput[];
}

export interface BatchWithTickets {
  batch: BatchRow;
  tickets: TicketRow[];
}

function validateTicketInput(ticket: TicketInput): void {
  if (!Number.isInteger(ticket.ticketIndex) || ticket.ticketIndex < 1) {
    throw new Error(`Invalid ticketIndex: ${ticket.ticketIndex}`);
  }

  if (!Array.isArray(ticket.numbers) || ticket.numbers.length !== 6) {
    throw new Error(`Ticket ${ticket.ticketIndex}: numbers must contain exactly 6 values`);
  }

  if (!ticket.numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 37)) {
    throw new Error(`Ticket ${ticket.ticketIndex}: numbers must be integers in range 1..37`);
  }

  if (new Set(ticket.numbers).size !== 6) {
    throw new Error(`Ticket ${ticket.ticketIndex}: numbers contain duplicates`);
  }

  if (
    ticket.strong !== undefined &&
    ticket.strong !== null &&
    (!Number.isInteger(ticket.strong) || ticket.strong < 1 || ticket.strong > 7)
  ) {
    throw new Error(`Ticket ${ticket.ticketIndex}: strong must be in range 1..7`);
  }
}

export async function createBatchWithTickets(
  db: D1Database,
  input: CreateBatchWithTicketsInput,
): Promise<BatchWithTickets> {
  if (!input.batchKey || !input.batchKey.trim()) {
    throw new Error("batchKey is required");
  }

  if (!Array.isArray(input.tickets) || input.tickets.length === 0) {
    throw new Error("tickets array must not be empty");
  }

  for (const ticket of input.tickets) {
    validateTicketInput(ticket);
  }

  const createInput: CreateBatchInput = {
    batchKey: input.batchKey.trim(),
    targetDrawId: input.targetDrawId ?? null,
    targetPaisId: input.targetPaisId ?? null,
    targetDrawAt: input.targetDrawAt ?? null,
    targetDrawSnapshotJson: input.targetDrawSnapshotJson ?? null,
    generatorVersion: input.generatorVersion ?? null,
    weightsVersionKey: input.weightsVersionKey ?? null,
    ticketCount: input.tickets.length,
  };

  const batch = await createBatch(db, createInput);
  await insertTickets(db, batch.id, input.tickets);

  const tickets = await getTicketsByBatchId(db, batch.id);

  return { batch, tickets };
}

export async function getLatestBatchWithTickets(
  db: D1Database,
): Promise<BatchWithTickets | null> {
  const batch = await getLatestBatch(db);
  if (!batch) return null;

  const tickets = await getTicketsByBatchId(db, batch.id);
  return { batch, tickets };
}

export async function getLatestGeneratedBatchWithTickets(
  db: D1Database,
): Promise<BatchWithTickets | null> {
  const batch = await getLatestGeneratedBatch(db);
  if (!batch) return null;

  const tickets = await getTicketsByBatchId(db, batch.id);
  return { batch, tickets };
}

export async function getBatchWithTicketsById(
  db: D1Database,
  batchId: number,
): Promise<BatchWithTickets | null> {
  const batch = await getBatchById(db, batchId);
  if (!batch) return null;

  const tickets = await getTicketsByBatchId(db, batchId);
  return { batch, tickets };
}

export async function archiveBatchById(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await archiveBatch(db, batchId);
}

export async function markBatchAsChecked(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await markBatchChecked(db, batchId);
}
export async function getBatches(
  db: D1Database,
  options?: { limit?: number; status?: string },
): Promise<BatchRow[]> {
  return await getBatchesRepo(db, options);
}
