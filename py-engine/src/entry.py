import json
import pathlib
from workers import Response

import lottery_generator as lg


BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
WEIGHTS_PATH = DATA_DIR / "weights.json"
HISTORY_PATH = DATA_DIR / "draw_history.jsonl"


def _json_response(obj, status=200):
    return Response(
        json.dumps(obj, ensure_ascii=False),
        status=status,
        headers={"Content-Type": "application/json"},
    )


def _load_history_for_generator(history_path: pathlib.Path):
    if not history_path.exists():
        return []
    return lg.load_history(str(history_path))


def _generate_tickets(
    count: int,
    max_common: int,
    seed: str | None,
    cluster_target: int | None,
):
    lg.load_dynamic_weights(str(WEIGHTS_PATH))

    rng = lg.random.Random(seed) if seed is not None else lg.random.Random()

    history_tickets = _load_history_for_generator(HISTORY_PATH)
    history_set = set(history_tickets)

    target_centroid = None
    if cluster_target is not None:
        if lg.CLUSTERING_DATA and "clusters" in lg.CLUSTERING_DATA:
            cluster_key = f"cluster_{cluster_target}"
            cluster_info = lg.CLUSTERING_DATA["clusters"].get(cluster_key)
            if cluster_info and "centroid" in cluster_info:
                target_centroid = tuple(float(x) for x in cluster_info["centroid"])

        if target_centroid is None:
            raise RuntimeError(
                f"cluster_target={cluster_target} requested, but centroid not found in weights.json"
            )

    results = []
    seen_final = set()
    final_nums_only = []
    max_attempts_per_ticket = 2000

    for i in range(count):
        best_candidate = None
        best_distance = float("inf")

        for _ in range(max_attempts_per_ticket):
            nums, ctrl, _batch = lg.build_final_ticket(rng, show_batch=False)

            if nums in seen_final:
                continue
            if nums in history_set:
                continue

            pool = final_nums_only + history_tickets
            if lg.max_intersection(nums, pool) > max_common:
                continue

            if target_centroid is not None:
                dist = lg.get_segment_distribution(list(nums))
                distance = lg.distribution_distance(dist, target_centroid)
                if distance < best_distance:
                    best_distance = distance
                    best_candidate = (nums, ctrl)
                if distance <= 1.0:
                    break
            else:
                best_candidate = (nums, ctrl)
                break

        if best_candidate is None:
            raise RuntimeError("Failed to generate unique ticket within attempt limit")

        nums, ctrl = best_candidate
        seen_final.add(nums)
        final_nums_only.append(nums)
        history_tickets.append(nums)
        history_set.add(nums)

        results.append(
            {
                "ticketIndex": i + 1,
                "numbers": list(nums),
                "strong": ctrl,
            }
        )

    return results


def fetch(request):
    try:
        if request.method != "POST":
            return _json_response({"ok": False, "error": "Method Not Allowed"}, status=405)

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
            return _json_response({"ok": False, "error": "count must be >= 1"}, status=400)

        tickets = _generate_tickets(
            count=count,
            max_common=max_common,
            seed=seed,
            cluster_target=cluster_target,
        )

        return _json_response(
            {
                "ok": True,
                "tickets": tickets,
                "count": len(tickets),
            }
        )

    except Exception as e:
        return _json_response(
            {
                "ok": False,
                "error": str(e),
            },
            status=500,
        )