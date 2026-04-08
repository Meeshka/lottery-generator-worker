export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "lottery-generator-worker"
      });
    }

    return new Response("Lottery worker is running");
  }
};
