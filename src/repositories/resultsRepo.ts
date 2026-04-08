import type { TicketResultRow } from "../types";

export interface InsertTicketResultInput {
  ticketId: number;
  drawDbId: number;
  matchCount: number;
  matchedNumbers: number[];
  strongMatch?: boolean | null;
  qualifies3Plus: boolean;
  prize?: number | null;
  prizeTable?: string | null;
}

export async function insertTicketResults(
  db: D1Database,
  results: InsertTicketResultInput[],
): Promise<void> {
  for (const item of results) {
    await db
      .prepare(`
        INSERT INTO ticket_results
          (
            ticket_id,
            draw_id,
            match_count,
            matched_numbers_json,
            strong_match,
            qualifies_3plus,
            prize,
            prize_table
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        item.ticketId,
        item.drawDbId,
        item.matchCount,
        JSON.stringify([...item.matchedNumbers].sort((a, b) => a - b)),
        item.strongMatch === undefined ? null : item.strongMatch ? 1 : 0,
        item.qualifies3Plus ? 1 : 0,
        item.prize ?? null,
        item.prizeTable ?? null,
      )
      .run();
  }
}

export async function getResultsByBatchId(
  db: D1Database,
  batchId: number,
): Promise<TicketResultRow[]> {
  const rows = await db
    .prepare(`
      SELECT
        tr.id,
        tr.ticket_id,
        tr.draw_id,
        tr.match_count,
        tr.matched_numbers_json,
        tr.strong_match,
        tr.qualifies_3plus,
        tr.prize,
        tr.prize_table,
        tr.checked_at
      FROM ticket_results tr
      INNER JOIN tickets t ON t.id = tr.ticket_id
      WHERE t.batch_id = ?
      ORDER BY t.ticket_index ASC, tr.id ASC
    `)
    .bind(batchId)
    .all<TicketResultRow>();

  return rows.results ?? [];
}

export async function deleteResultsByBatchId(
  db: D1Database,
  batchId: number,
): Promise<void> {
  await db
    .prepare(`
      DELETE FROM ticket_results
      WHERE ticket_id IN (
        SELECT id FROM tickets WHERE batch_id = ?
      )
    `)
    .bind(batchId)
    .run();
}