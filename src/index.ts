export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "lottery_generator_worker"
      });
    }

    return new Response("Lottery worker is running");
  }
};
