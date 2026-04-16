export interface AppUserRoleRow {
  lotto_user_id: string;
  role: string;
  is_active: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveRoleByLottoUserId(
  db: D1Database,
  lottoUserId: string,
): Promise<AppUserRoleRow | null> {
  const row = await db
    .prepare(`
      SELECT
        lotto_user_id,
        role,
        is_active,
        note,
        created_at,
        updated_at
      FROM app_user_roles
      WHERE lotto_user_id = ?
        AND is_active = 1
      LIMIT 1
    `)
    .bind(lottoUserId)
    .first<AppUserRoleRow>();

  return row ?? null;
}

export async function isAdminLottoUser(
  db: D1Database,
  lottoUserId: string,
): Promise<boolean> {
  const row = await getActiveRoleByLottoUserId(db, lottoUserId);
  return row?.role === "admin";
}
