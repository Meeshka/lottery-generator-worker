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


def generate_tickets(
    count: int,
    max_common: int,
    seed: Optional[str] = None,
    cluster_target: Optional[int] = None,
    weights: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate lottery tickets using the lottery_generator module.

    Args:
        count: Number of tickets to generate
        max_common: Maximum common numbers with history
        seed: Optional random seed for reproducibility
        cluster_target: Optional cluster target (1-4) for distribution-based generation
        weights: Optional weights dict to apply directly instead of loading from file

    Returns:
        List of ticket dictionaries with ticketIndex, numbers, and strong
    """
    # Apply weights if provided, otherwise try loading from file
    if isinstance(weights, dict):
        if isinstance(weights.get("SEG_WEIGHTS"), list) and len(weights["SEG_WEIGHTS"]) == 4:
            lg.SEG_WEIGHTS = [float(x) for x in weights["SEG_WEIGHTS"]]
        if isinstance(weights.get("ALPHA_OVERFLOW"), (int, float)):
            lg.ALPHA_OVERFLOW = float(weights["ALPHA_OVERFLOW"])
        if isinstance(weights.get("BETA_ZERO_BY_SEGMENT"), list) and len(weights["BETA_ZERO_BY_SEGMENT"]) == 4:
            lg.BETA_ZERO_BY_SEGMENT = [float(x) for x in weights["BETA_ZERO_BY_SEGMENT"]]
        if isinstance(weights.get("clustering"), dict):
            lg.CLUSTERING_DATA = weights["clustering"]
        lg.invalidate_allowed_cache()
    else:
        try:
            lg.load_dynamic_weights("weights.json")
        except Exception:
            pass  # Weights file might not be available in worker context
    
    # Initialize random with seed if provided
    rng = random.Random(seed) if seed else random.Random()
    
    # Load history if available
    history_tickets = []
    try:
        draws = draw_history.load_history("draw_history.jsonl")
        history_tickets = [tuple(draw["numbers"]) for draw in draws if "numbers" in draw]
    except Exception:
        pass  # History might not be available
    
    # Get target centroid for cluster-based generation
    target_centroid = None
    if cluster_target is not None and lg.CLUSTERING_AVAILABLE:
        if lg.CLUSTERING_DATA and "clusters" in lg.CLUSTERING_DATA:
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
        
        results.append({
            "ticketIndex": i + 1,
            "numbers": list(nums),
            "strong": ctrl,
        })
    
    return results
