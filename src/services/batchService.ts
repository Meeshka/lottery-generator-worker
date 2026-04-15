import type {
  BatchRow,
  BatchStatus,
  CreateBatchInput,
  TicketInput,
  TicketRow,
} from "../types";
import {
  createBatch,
  getBatchById,
  getLatestBatch,
  getLatestGeneratedBatch,
  archiveBatch,
  markBatchChecked,
  getBatches as getBatchesRepo,
  markBatchSubmitted,
  markBatchConfirmed,
  touchSyncAttempt,
  saveSyncError,
  updateBatchTargetDrawInfo,
} from "../repositories/batchesRepo";
import { getTicketsByBatchId, insertTickets } from "../repositories/ticketsRepo";
import {
  fetchAllActiveTickets,
  fetchActiveTickets,
  ticketsMatch,
  type LottoTicketRecord,
} from "../utils/lottoApi";
import { fetchOpenPaisDraw } from "../utils/pais";

export interface CreateBatchWithTicketsInput {
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

function normalizeLocalTables(tickets: TicketRow[]): number[][] {
  return tickets.map((ticket) => {
    const numbers = JSON.parse(ticket.numbers_json) as number[];
    const sortedNumbers = [...numbers].map(Number).sort((a, b) => a - b);

    return ticket.strong_number !== null && ticket.strong_number !== undefined
      ? [...sortedNumbers, Number(ticket.strong_number)]
      : sortedNumbers;
  });
}

function chooseBestCandidate(
  candidates: LottoTicketRecord[],
  submittedAt: string | null,
): LottoTicketRecord {
  if (candidates.length === 1) {
    return candidates[0];
  }

  if (submittedAt) {
    const submittedTime = new Date(submittedAt).getTime();

    candidates.sort((a, b) => {
      const timeA = a.purchasedAt
        ? Math.abs(new Date(a.purchasedAt).getTime() - submittedTime)
        : Number.POSITIVE_INFINITY;
      const timeB = b.purchasedAt
        ? Math.abs(new Date(b.purchasedAt).getTime() - submittedTime)
        : Number.POSITIVE_INFINITY;

      return timeA - timeB;
    });

    return candidates[0];
  }

  return candidates[0];
}

export async function createBatchWithTickets(
  db: D1Database,
  input: CreateBatchWithTicketsInput,
): Promise<BatchWithTickets> {

  if (!Array.isArray(input.tickets) || input.tickets.length === 0) {
    throw new Error("tickets array must not be empty");
  }

  for (const ticket of input.tickets) {
    validateTicketInput(ticket);
  }

  const createInput: CreateBatchInput = {
    batchKey: crypto.randomUUID(),
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

  const allowedStatuses: BatchStatus[] = ["generated", "submitted"];
  if (!allowedStatuses.includes(batch.status)) {
    throw new Error(
      `Batch ${batchId} has status '${batch.status}', cannot transition to submitted`,
    );
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
  const normalizedToken = otpToken?.trim();
  if (!normalizedToken) {
    return {
      success: false,
      matched: false,
      batch: null,
      externalTicketId: null,
      error: "OTP token is required",
    };
  }

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

  const allowedStatuses: BatchStatus[] = ["submitted", "confirmed"];
  if (!allowedStatuses.includes(batch.status)) {
    return {
      success: false,
      matched: false,
      batch,
      externalTicketId: null,
      error: `Batch ${batchId} has status '${batch.status}', sync-confirmation requires submitted or confirmed`,
    };
  }

  const tickets = await getTicketsByBatchId(db, batchId);
  if (!tickets.length) {
    return {
      success: false,
      matched: false,
      batch,
      externalTicketId: null,
      error: `Batch ${batchId} has no tickets`,
    };
  }

  await touchSyncAttempt(db, batchId);

  try {
    const response = await fetchActiveTickets(normalizedToken, 0, 100);
    const externalTickets = response.tickets;
    const localTables = normalizeLocalTables(tickets);

    let matchedRecord: LottoTicketRecord | null = null;

    if (batch.external_ticket_id) {
      matchedRecord =
        externalTickets.find((record) => record.id === batch.external_ticket_id) ?? null;
    }

    if (!matchedRecord) {
      const candidates = externalTickets.filter((record) => {
        if (record.status !== "BOUGHT") return false;

        if (
          batch.target_pais_id !== null &&
          batch.target_pais_id !== undefined &&
          record.paisId !== batch.target_pais_id
        ) {
          return false;
        }

        if (!Array.isArray(record.tables) || record.tables.length !== localTables.length) {
          return false;
        }

        return ticketsMatch(localTables, record.tables);
      });

      if (candidates.length > 0) {
        matchedRecord = chooseBestCandidate(candidates, batch.submitted_at);
      }
    }

    if (matchedRecord) {
      const updated = await markBatchConfirmed(db, batchId, matchedRecord.id, {
        matchStatus: "full",
        confirmedPaisId: matchedRecord.paisId,
        confirmedTotalPrice: matchedRecord.totalPrice,
      });
      return {
        success: true,
        matched: true,
        batch: updated,
        externalTicketId: matchedRecord.id,
      };
    }

    await saveSyncError(db, batchId, "No matching ticket found in external system");
    const updated = await getBatchById(db, batchId);

    return {
      success: true,
      matched: false,
      batch: updated,
      externalTicketId: null,
    };
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

export interface RefreshBatchStatusesSummary {
  remoteTickets: number;
  matchedExisting: number;
  confirmedExisting: number;
  createdMissing: number;
}

export interface RefreshBatchStatusesResult {
  success: boolean;
  summary: RefreshBatchStatusesSummary;
}

function remoteTablesToTicketInputs(tables: number[][]): TicketInput[] {
  return tables.map((table, index) => {
    const sorted = [...table].map(Number).sort((a, b) => a - b);

    let numbers = sorted;
    let strong: number | null = null;

    if (sorted.length === 7) {
      strong = sorted[sorted.length - 1];
      numbers = sorted.slice(0, 6);
    }

    return {
      ticketIndex: index + 1,
      numbers,
      strong,
    };
  });
}

export async function refreshBatchStatusesFromLotto(
  db: D1Database,
  otpToken: string,
): Promise<RefreshBatchStatusesResult> {
  const normalizedToken = otpToken?.trim();
  if (!normalizedToken) {
    throw new Error("accessToken is required");
  }

  const openDraw = await fetchOpenPaisDraw();
  const targetDrawSnapshotJson = JSON.stringify(openDraw.raw);

  const remoteTickets = (await fetchAllActiveTickets(normalizedToken)).filter(
    (ticket) => Array.isArray(ticket.tables) && ticket.tables.length > 0,
  );

  const allBatches = await getBatchesRepo(db);
  const submittedBatches = await getBatchesRepo(db, { status: "submitted" });
  const localBatches = await Promise.all(
    submittedBatches.map(async (batch) => {
      const tickets = await getTicketsByBatchId(db, batch.id);
      return {
        batch,
        tickets,
        tables: normalizeLocalTables(tickets),
      };
    }),
  );
  const matchedRemoteIds = new Set<string>();
  let matchedExisting = 0;
  let confirmedExisting = 0;
  let createdMissing = 0;

  for (const remote of remoteTickets) {
    const matchedLocal = localBatches.find((local) =>
      local.tickets.length > 0 && ticketsMatch(local.tables, remote.tables),
    );

    if (!matchedLocal) {
      continue;
    }

    matchedRemoteIds.add(remote.id);
    matchedExisting++;

    if (matchedLocal.batch.status === "submitted") {
      await updateBatchTargetDrawInfo(db, matchedLocal.batch.id, {
        targetDrawId:
          remote.drawId !== undefined && remote.drawId !== null
            ? String(remote.drawId)
            : null,
        targetPaisId: openDraw.paisId,
        targetDrawAt: openDraw.drawAt,
        targetDrawSnapshotJson,
      });

      await markBatchConfirmed(db, matchedLocal.batch.id, remote.id, {
        matchStatus: "full",
        confirmedPaisId: openDraw.paisId,
        confirmedTotalPrice: remote.totalPrice ?? null,
      });

      confirmedExisting++;
    }
  }

  for (const remote of remoteTickets) {
    if (matchedRemoteIds.has(remote.id)) {
      continue;
    }

    const ticketInputs = remoteTablesToTicketInputs(remote.tables);
    if (!ticketInputs.length) {
      continue;
    }

    const created = await createBatchWithTickets(db, {
      targetDrawId:
        remote.drawId !== undefined && remote.drawId !== null
          ? String(remote.drawId)
          : null,
      targetPaisId: openDraw.paisId,
      targetDrawAt: openDraw.drawAt,
      targetDrawSnapshotJson,
      generatorVersion: "lotto-refresh-import",
      weightsVersionKey: null,
      tickets: ticketInputs,
    });

    await markBatchAsSubmitted(db, created.batch.id);

    await markBatchConfirmed(db, created.batch.id, remote.id, {
      matchStatus: "imported_from_external",
      confirmedPaisId: openDraw.paisId,
      confirmedTotalPrice: remote.totalPrice ?? null,
    });

    createdMissing++;
  }

  return {
    success: true,
    summary: {
      remoteTickets: remoteTickets.length,
      matchedExisting,
      confirmedExisting,
      createdMissing,
    },
  };
}
