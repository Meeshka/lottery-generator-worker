import json

from workers import WorkerEntrypoint, Response

try:
    from .generator_engine import generate_tickets
except ImportError:
    from generator_engine import generate_tickets


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        try:
            if request.method != "POST":
                return Response(
                    json.dumps({"ok": False, "error": "Method Not Allowed"}),
                    status=405,
                    headers={"Content-Type": "application/json"},
                )

            body = await request.json()

            count = int(body.get("count", 10))
            max_common = int(body.get("maxCommon", 3))
            seed = body.get("seed")
            cluster_target = body.get("clusterTarget")

            if cluster_target is not None:
                cluster_target = int(cluster_target)

            tickets = generate_tickets(
                count=count,
                max_common=max_common,
                seed=seed,
                cluster_target=cluster_target,
            )

            return Response(
                json.dumps(
                    {
                        "ok": True,
                        "tickets": tickets,
                        "count": len(tickets),
                    }
                ),
                headers={"Content-Type": "application/json"},
            )

        except Exception as e:
            return Response(
                json.dumps({"ok": False, "error": str(e)}),
                status=500,
                headers={"Content-Type": "application/json"},
            )