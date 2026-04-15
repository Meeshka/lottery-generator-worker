#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generator engine module for Python Worker.
Wraps lottery_generator functionality for ticket generation.
"""

import random
from typing import List, Dict, Any, Optional

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

            # max_common now compares against:
            # 1) confirmed history tickets from DB
            # 2) already generated tickets in current batch
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

        # Important: enrich history with tickets already generated in this batch
        history_tickets.append(nums)
        history_set.add(nums)

        results.append({
            "ticketIndex": i + 1,
            "numbers": list(nums),
            "strong": ctrl,
        })

    return results
