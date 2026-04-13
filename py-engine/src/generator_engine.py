import pathlib

try:
    from . import lottery_generator as lg
except ImportError:
    import lottery_generator as lg


BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
WEIGHTS_PATH = DATA_DIR / "weights.json"
HISTORY_PATH = DATA_DIR / "draw_history.jsonl"


def _load_history_for_generator(history_path: pathlib.Path):
    if not history_path.exists():
        return []
    return lg.load_history(str(history_path))


def generate_tickets(
    count: int = 10,
    max_common: int = 3,
    seed: str | None = None,
    cluster_target: int | None = None,
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