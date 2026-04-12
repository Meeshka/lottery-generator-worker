import json

try:
    from .generator_engine import generate_tickets
except ImportError:
    from generator_engine import generate_tickets


def _json_text(obj):
    return json.dumps(obj, ensure_ascii=False)


def fetch(request):
    from workers import Response

    try:
        if request.method != "POST":
            return Response(
                _json_text({"ok": False, "error": "Method Not Allowed"}),
                status=405,
                headers={"Content-Type": "application/json"},
            )

        raw_body = request.body
        if isinstance(raw_body, bytes):
            raw_body = raw_body.decode("utf-8")

        body = json.loads(raw_body) if raw_body else {}

        count = int(body.get("count", 10))
        max_common = int(body.get("maxCommon", 3))
        seed = body.get("seed")
        cluster_target = body.get("clusterTarget")

        if cluster_target is not None:
            cluster_target = int(cluster_target)

        if count < 1:
            return Response(
                _json_text({"ok": False, "error": "count must be >= 1"}),
                status=400,
                headers={"Content-Type": "application/json"},
            )

        tickets = generate_tickets(
            count=count,
            max_common=max_common,
            seed=seed,
            cluster_target=cluster_target,
        )

        return Response(
            _json_text(
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
            _json_text({"ok": False, "error": str(e)}),
            status=500,
            headers={"Content-Type": "application/json"},
        )