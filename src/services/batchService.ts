import type {BatchRow, BatchStatus, CreateBatchInput, TicketInput, TicketRow} from "../types";
import { createBatch, getBatchById, getLatestBatch, getLatestGeneratedBatch, archiveBatch, markBatchChecked, getBatches as getBatchesRepo, markBatchSubmitted, markBatchConfirmed, touchSyncAttempt, saveSyncError } from "../repositories/batchesRepo";
import { getTicketsByBatchId, insertTickets } from "../repositories/ticketsRepo";
import { fetchActiveTickets, ticketsMatch, type LottoTicketRecord } from "../utils/lottoApi";
import { getDrawByPaisId } from "../repositories/drawsRepo";

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

export interface SyncConfirmationResult {
  success: boolean;
  matched: boolean;
  batch: BatchRow | null;
  externalTicketId: string | null;
  error?: string;
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

export async function markBatchAsSubmitted(
  db: D1Database,
  batchId: number,
): Promise<BatchRow> {
  const batch = await getBatchById(db, batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const allowedStatuses: BatchStatus[] = ["checked", "submitted"];
  if (!allowedStatuses.includes(batch.status)) {
    throw new Error(`Batch ${batchId} has status '${batch.status}', cannot transition to submitted`);
  }

  if (batch.status === "submitted") {
    return batch;
  }

  const updated = await markBatchSubmitted(db, batchId);
  if (!updated) {
    throw new Error(`Failed to mark batch ${batchId} as submitted`);
  }

  return updated;
}

export async function syncBatchConfirmation(
  db: D1Database,
  batchId: number,
  otpToken: string,
): Promise<SyncConfirmationResult> {
  const batch = await getBatchById(db, batchId);
  if (!batch) {
    return {
      success: false,
      matched: false,
      batch: null,
      externalTicketId: null,
      error: `Batch ${batchId} not found`,
    };
  }

  const tickets = await getTicketsByBatchId(db, batchId);
  
  await touchSyncAttempt(db, batchId);

  try {
    const response = await fetchActiveTickets(otpToken);
    const externalTickets = response.tickets;

    const localTables = tickets.map(t => {
      const numbers = JSON.parse(t.numbers_json) as number[];
      return t.strong_number ? [...numbers, t.strong_number] : numbers;
    });

    let matchedRecord: LottoTicketRecord | null = null;

    if (batch.external_ticket_id) {
      matchedRecord = externalTickets.find(t => t.id === batch.external_ticket_id) || null;
    }

    if (!matchedRecord) {
      const candidates = externalTickets.filter(record => {
        if (record.status !== "BOUGHT") return false;
        if (record.paisId !== batch.target_pais_id) return false;
        if (!record.tables || record.tables.length !== localTables.length) return false;
        
        return ticketsMatch(localTables, record.tables);
      });

      if (candidates.length > 0) {
        if (candidates.length === 1) {
          matchedRecord = candidates[0];
        } else {
          if (batch.submitted_at) {
            const submittedTime = new Date(batch.submitted_at).getTime();
            candidates.sort((a, b) => {
              const timeA = a.purchasedAt ? Math.abs(new Date(a.purchasedAt).getTime() - submittedTime) : Infinity;
              const timeB = b.purchasedAt ? Math.abs(new Date(b.purchasedAt).getTime() - submittedTime) : Infinity;
              return timeA - timeB;
            });
            matchedRecord = candidates[0];
          } else {
            matchedRecord = candidates[0];
          }
        }
      }
    }

    if (matchedRecord) {
      const updated = await markBatchConfirmed(db, batchId, matchedRecord.id);
      return {
        success: true,
        matched: true,
        batch: updated,
        externalTicketId: matchedRecord.id,
      };
    } else {
      await saveSyncError(db, batchId, "No matching ticket found in external system");
      const updated = await getBatchById(db, batchId);
      return {
        success: true,
        matched: false,
        batch: updated,
        externalTicketId: null,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await saveSyncError(db, batchId, errorMessage);
    const updated = await getBatchById(db, batchId);
    return {
      success: false,
      matched: false,
      batch: updated,
      externalTicketId: null,
      error: errorMessage,
    };
  }
}

export async function submitAndSyncBatchConfirmation(
  db: D1Database,
  batchId: number,
  otpToken: string,
): Promise<SyncConfirmationResult> {
  try {
    await markBatchAsSubmitted(db, batchId);
    return await syncBatchConfirmation(db, batchId, otpToken);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const batch = await getBatchById(db, batchId);
    return {
      success: false,
      matched: false,
      batch,
      externalTicketId: null,
      error: errorMessage,
    };
  }
}
