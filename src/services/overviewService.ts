export interface OverviewData {
  draws_total: number;
  latest_draw_id: string | null;
  latest_draw_date: string | null;
  has_current_weights: boolean;
  current_weights_version: string | null;
  current_weights_draw_count: number | null;
  latest_batch_summary: LatestBatchSummary | null;
}

export interface LatestBatchSummary {
  batchId: number;
  batchKey: string;
  status: string;
  ticketCount: number;
  checkedResultsCount: number;
  ticketsWith3Plus: number;
  totalPrize: number;
  drawDbId: number | null;
}

export async function getOverview(db: D1Database): Promise<OverviewData> {
  const drawsCount = await db
    .prepare("SELECT COUNT(*) as count FROM draws")
    .first<{ count: number }>();

  const latestDraw = await db
    .prepare(`
      SELECT draw_id, draw_date
      FROM draws
      ORDER BY draw_date DESC, draw_id DESC
      LIMIT 1
    `)
    .first<{ draw_id: string; draw_date: string }>();

  const currentWeights = await db
    .prepare(`
      SELECT version_key, source_draw_count
      FROM weights
      WHERE is_current = 1
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first<{ version_key: string; source_draw_count: number }>();

  const latestBatchSummary = await db
    .prepare(`
      SELECT
        b.id as batchId,
        b.batch_key as batchKey,
        b.status,
        b.ticket_count as ticketCount,
        b.target_draw_id as drawDbId,
        COUNT(tr.id) as checkedResultsCount,
        SUM(CASE WHEN tr.qualifies_3plus = 1 THEN 1 ELSE 0 END) as ticketsWith3Plus,
        COALESCE(SUM(tr.prize), 0) as totalPrize
      FROM ticket_batches b
      LEFT JOIN tickets t ON t.batch_id = b.id
      LEFT JOIN ticket_results tr ON tr.ticket_id = t.id
      WHERE b.deleted_at IS NULL
      GROUP BY b.id
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 1
    `)
    .first<LatestBatchSummary>();

  return {
    draws_total: drawsCount?.count ?? 0,
    latest_draw_id: latestDraw?.draw_id ?? null,
    latest_draw_date: latestDraw?.draw_date ?? null,
    has_current_weights: !!currentWeights,
    current_weights_version: currentWeights?.version_key ?? null,
    current_weights_draw_count: currentWeights?.source_draw_count ?? null,
    latest_batch_summary: latestBatchSummary ?? null,
  };
}
