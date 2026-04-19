export async function getBatchesByUserAndTime(
  db: D1Database,
  userId: string,
  timeWindow: string,
): Promise<number> {
  const row = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM ticket_batches
      WHERE created_by_user_id = ?
        AND created_at >= datetime('now', '-' || ?)
        AND deleted_at IS NULL
    `)
    .bind(userId, timeWindow)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

export async function getBatchesByUserInLastHour(
  db: D1Database,
  userId: string,
): Promise<number> {
  return getBatchesByUserAndTime(db, userId, '1 hour');
}

export async function getBatchesByUserInLastDay(
  db: D1Database,
  userId: string,
): Promise<number> {
  return getBatchesByUserAndTime(db, userId, '1 day');
}
