export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "lottery-generator-worker",
        db: "connected"
      });
    }

    if (url.pathname === "/stats/overview") {
      const drawsCount = await env.DB
        .prepare("SELECT COUNT(*) as count FROM draws")
        .first<{ count: number }>();

      const activeTicketsCount = await env.DB
        .prepare("SELECT COUNT(*) as count FROM tickets WHERE is_active = 1")
        .first<{ count: number }>();

      const matches3PlusCount = await env.DB
        .prepare("SELECT COUNT(*) as count FROM matches WHERE match_count >= 3")
        .first<{ count: number }>();

      return Response.json({
        draws_total: drawsCount?.count ?? 0,
        active_tickets_count: activeTicketsCount?.count ?? 0,
        matches_3_plus_total: matches3PlusCount?.count ?? 0
      });
    }

    if (url.pathname === "/tickets/active") {
      const rows = await env.DB
        .prepare(`
          SELECT id, ticket_index, numbers_json, strong_number, batch_id
          FROM tickets
          WHERE is_active = 1
          ORDER BY created_at DESC, ticket_index ASC
        `)
        .all();

      return Response.json(rows.results ?? []);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(): Promise<void> {
    console.log("Weekly job placeholder");
  }
};
