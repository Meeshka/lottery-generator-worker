export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "lottery-generator-worker"
      });
    }

    if (url.pathname === "/stats/overview") {
      return Response.json({
        draws_total: 0,
        active_tickets_count: 0,
        matches_3_plus_total: 0
      });
    }

    return new Response("Lottery worker is running");
  },

  async scheduled(): Promise<void> {
    console.log("Weekly job placeholder");
  }
};
