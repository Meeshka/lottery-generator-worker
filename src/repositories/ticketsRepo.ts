import type { TicketInput, TicketRow } from "../types";

export async function insertTickets(
  db: D1Database,
  batchId: number,
  tickets: TicketInput[],
): Promise<void> {
  for (const ticket of tickets) {
    await db
      .prepare(`
        INSERT INTO tickets
          (batch_id, ticket_index, numbers_json, strong_number)
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        batchId,
        ticket.ticketIndex,
        JSON.stringify([...ticket.numbers].sort((a, b) => a - b)),
        ticket.strong ?? null,
      )
      .run();
  }
}

export async function getTicketsByBatchId(
  db: D1Database,
  batchId: number,
): Promise<TicketRow[]> {
  const rows = await db
    .prepare(`
      SELECT
        id,
        batch_id,
        ticket_index,
        numbers_json,
        strong_number,
        created_at
      FROM tickets
      WHERE batch_id = ?
      ORDER BY ticket_index ASC, id ASC
    `)
    .bind(batchId)
    .all<TicketRow>();

  return rows.results ?? [];
}

export async function getTicketByBatchIdAndIndex(
  db: D1Database,
  batchId: number,
  ticketIndex: number,
): Promise<TicketRow | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        batch_id,
        ticket_index,
        numbers_json,
        strong_number,
        created_at
      FROM tickets
      WHERE batch_id = ? AND ticket_index = ?
      LIMIT 1
    `)
    .bind(batchId, ticketIndex)
    .first<TicketRow>();

  return row ?? null;
}

export async function deleteTicketsByBatchId(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await db
    .prepare(`
      DELETE FROM tickets
      WHERE batch_id = ?
    `)
    .bind(batchId)
    .run();
}