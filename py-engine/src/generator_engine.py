#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generator engine module for Python Worker.
Wraps lottery_generator functionality for ticket generation.
"""

import random
from typing import List, Dict, Any, Optional
from collections import Counter

try:
    from . import lottery_generator as lg
    from . import draw_history
except ImportError:
    import lottery_generator as lg
    import draw_history


def _apply_weights_to_generator(weights: Optional[Dict[str, Any]]) -> None:
    """
    Apply dynamic weights passed from main Worker/DB directly to lottery_generator.
    Falls back to built-in values if weights is missing/invalid.
    """
    if not isinstance(weights, dict):
        try:
            lg.load_dynamic_weights("weights.json")
        except Exception:
            pass
        return

    seg_weights = weights.get("SEG_WEIGHTS")
    if isinstance(seg_weights, list) and len(seg_weights) == 4:
        lg.SEG_WEIGHTS = [float(x) for x in seg_weights]

    alpha = weights.get("ALPHA_OVERFLOW")
    if isinstance(alpha, (int, float)) and float(alpha) > 0:
        lg.ALPHA_OVERFLOW = float(alpha)

    beta_zero = weights.get("BETA_ZERO_BY_SEGMENT")
    if isinstance(beta_zero, list) and len(beta_zero) == 4:
        lg.BETA_ZERO_BY_SEGMENT = [float(x) for x in beta_zero]
    else:
        lg.BETA_ZERO_BY_SEGMENT = None

    clustering = weights.get("clustering")
    if isinstance(clustering, dict):
        lg.CLUSTERING_DATA = clustering
    else:
        lg.CLUSTERING_DATA = None

    lg.invalidate_allowed_cache()


def _normalize_history_tickets(
    history_tickets_input: Optional[List[List[int]]],
) -> List[tuple]:
    """
    Normalize history tickets received from main Worker.
    """
    result = []

    if not isinstance(history_tickets_input, list):
        return result

    for item in history_tickets_input:
        if not isinstance(item, list) or len(item) != 6:
            continue

        try:
            nums = tuple(sorted(int(x) for x in item))
        except Exception:
            continue

        if any(n < 1 or n > 37 for n in nums):
            continue
        if len(set(nums)) != 6:
            continue

        result.append(nums)

    return result


def _segment_index(n: int) -> int:
    if 1 <= n <= 9:
        return 0
    if 10 <= n <= 19:
        return 1
    if 20 <= n <= 29:
        return 2
    return 3  # 30..37


def score_candidate(
    nums: tuple,
    num_usage: Counter,
    seg_usage: list,
    target_centroid=None,
    reuse_weight: float = 4.0,
    segment_weight: float = 0.35,
    cluster_weight: float = 2.0,
) -> float:
    """
    Чем меньше score, тем лучше кандидат.

    num_usage:
        сколько раз каждое число уже использовалось в ТЕКУЩЕМ генерируемом батче
    seg_usage:
        сколько чисел по сегментам уже накоплено в ТЕКУЩЕМ батче
    target_centroid:
        если есть cluster_target, мягко учитываем близость к нему
    """

    # 1) главный штраф: повторное использование тех же чисел в текущем батче
    # квадрат даёт сильный penalty для "залипших" чисел вроде 3, 10, 15 и т.п.
    reuse_penalty = sum((num_usage[n] + 1) ** 2 - 1 for n in nums)

    # 2) мягкий штраф за дальнейшую концентрацию сегментов
    # считаем, как изменится "нагруженность" сегментов после добавления кандидата
    candidate_seg_counts = [0, 0, 0, 0]
    for n in nums:
        candidate_seg_counts[_segment_index(n)] += 1

    segment_penalty = 0.0
    for seg_idx, add_count in enumerate(candidate_seg_counts):
        if add_count == 0:
            continue
        before = seg_usage[seg_idx]
        after = before + add_count
        segment_penalty += (after * after) - (before * before)

    # 3) мягкий штраф за удаление от target cluster
    cluster_penalty = 0.0
    if target_centroid is not None:
        dist = lg.get_segment_distribution(list(nums))
        cluster_penalty = lg.distribution_distance(dist, target_centroid)

    return (
        reuse_weight * reuse_penalty
        + segment_weight * segment_penalty
        + cluster_weight * cluster_penalty
    )


def generate_tickets(
    count: int,
    max_common: int,
    seed: Optional[str] = None,
    cluster_target: Optional[int] = None,
    weights: Optional[Dict[str, Any]] = None,
    history_tickets_input: Optional[List[List[int]]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate lottery tickets using the lottery_generator module.

    Args:
        count: Number of tickets to generate
        max_common: Maximum common numbers with history/current batch
        seed: Optional random seed for reproducibility
        cluster_target: Optional cluster target for distribution-based generation
        weights: Optional weights object from DB
        history_tickets_input: Optional confirmed tickets from DB

    Returns:
        List of ticket dictionaries with ticketIndex, numbers, and strong
    """
    _apply_weights_to_generator(weights)

    rng = random.Random(seed) if seed else random.Random()

    # Use confirmed batch tickets from DB if provided.
    # Fallback to draw_history.jsonl only if nothing was passed.
    history_tickets = _normalize_history_tickets(history_tickets_input)

    if not history_tickets:
        try:
            draws = draw_history.load_history("draw_history.jsonl")
            history_tickets = [tuple(draw["numbers"]) for draw in draws if "numbers" in draw]
        except Exception:
            history_tickets = []

    target_centroid = None
    if cluster_target is not None and lg.CLUSTERING_DATA and "clusters" in lg.CLUSTERING_DATA:
        cluster_key = f"cluster_{cluster_target}"
        cluster_info = lg.CLUSTERING_DATA["clusters"].get(cluster_key)
        if cluster_info and "centroid" in cluster_info:
            target_centroid = tuple(float(x) for x in cluster_info["centroid"])

    results = []
    seen_final = set()
    final_nums_only = []
    history_set = set(history_tickets)

    # usage считаем только по билетам, принятым В ТЕКУЩЕМ вызове generate_tickets()
    batch_num_usage = Counter()
    batch_seg_usage = [0, 0, 0, 0]

    MAX_ATTEMPTS_PER_TICKET = 2000
    CANDIDATE_POOL_SIZE = 64

    for i in range(count):
        candidate_pool = []

        for _ in range(MAX_ATTEMPTS_PER_TICKET):
            nums, ctrl, _batch = lg.build_final_ticket(rng, show_batch=False)

            # 1) точный дубль в текущем ответе
            if nums in seen_final:
                continue

            # 2) точный дубль в истории / уже существующих билетах
            if nums in history_set:
                continue

            # 3) ограничение по пересечениям
            pool = final_nums_only + history_tickets
            if lg.max_intersection(nums, pool) > max_common:
                continue

            # 4) оцениваем кандидата не "первый подошёл", а через score
            score = score_candidate(
                nums=nums,
                num_usage=batch_num_usage,
                seg_usage=batch_seg_usage,
                target_centroid=target_centroid,
                reuse_weight=4.0,
                segment_weight=0.35,
                cluster_weight=2.0,
            )

            candidate_pool.append((score, nums, ctrl))

            # набрали достаточно валидных кандидатов — можно выбирать лучший
            if len(candidate_pool) >= CANDIDATE_POOL_SIZE:
                break

        if not candidate_pool:
            raise RuntimeError("Failed to generate unique ticket within attempt limit")

        # берём лучший score; tie-break -> лексикографически меньший nums, потом меньший ctrl
        candidate_pool.sort(key=lambda item: (item[0], item[1], item[2]))
        best_score, nums, ctrl = candidate_pool[0]

        seen_final.add(nums)
        final_nums_only.append(nums)

        # важно: чтобы следующие билеты учитывали уже принятые текущие
        history_tickets.append(nums)
        history_set.add(nums)

        # обновляем usage только после фактического выбора билета
        for n in nums:
            batch_num_usage[n] += 1

        seg_dist = lg.get_segment_distribution(list(nums))
        for seg_idx, cnt in enumerate(seg_dist):
            batch_seg_usage[seg_idx] += cnt

        results.append({
            "ticketIndex": i + 1,
            "numbers": list(nums),
            "strong": ctrl,
        })

    return results
