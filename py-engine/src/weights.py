# weights.py
# -*- coding: utf-8 -*-

from __future__ import annotations
from typing import Any, Dict, List, Tuple

# Import clustering functionality
CLUSTERING_IMPORT_ERROR = None

try:
    from . import draw_clustering
    CLUSTERING_AVAILABLE = True
except ImportError as e1:
    try:
        import draw_clustering
        CLUSTERING_AVAILABLE = True
    except ImportError as e2:
        CLUSTERING_AVAILABLE = False
        CLUSTERING_IMPORT_ERROR = f"relative import failed: {e1}; absolute import failed: {e2}"

# Сегменты как у тебя: 1–9, 10–19, 20–29, 30–37 (включительно)
SEG_SIZES = [9, 10, 10, 8]
TOTAL_NUMBERS = 37
PICKS = 6

BASE_LIMITS = [3, 3, 3, 2]


def seg_index(n: int) -> int:
    if 1 <= n <= 9:
        return 0
    if 10 <= n <= 19:
        return 1
    if 20 <= n <= 29:
        return 2
    if 30 <= n <= 37:
        return 3
    raise ValueError(n)


def counts_for_numbers(nums: List[int]) -> Tuple[int, int, int, int]:
    c = [0, 0, 0, 0]
    for n in nums:
        c[seg_index(n)] += 1
    return (c[0], c[1], c[2], c[3])


def compute_seg_weights(draws: List[Dict[str, Any]]) -> List[float]:
    """
    SEG_WEIGHTS = (эмпирическое среднее попаданий в сегмент) / (теоретическое ожидание).
    Нормализуем, чтобы среднее веса было 1.0.
    """
    n = 0
    sums = [0, 0, 0, 0]
    for d in draws:
        nums = d.get("numbers")
        if not (isinstance(nums, list) and len(nums) == 6):
            continue
        if not all(isinstance(x, int) for x in nums):
            continue
        c = counts_for_numbers(nums)
        for i in range(4):
            sums[i] += c[i]
        n += 1

    if n == 0:
        return [1.0, 1.0, 1.0, 1.0]

    means = [s / float(n) for s in sums]
    theo = [PICKS * (sz / float(TOTAL_NUMBERS)) for sz in SEG_SIZES]
    raw = [(means[i] / theo[i]) if theo[i] > 0 else 1.0 for i in range(4)]

    avg = sum(raw) / 4.0
    if avg <= 0:
        return [1.0, 1.0, 1.0, 1.0]
    return [w / avg for w in raw]


def overflow_for_dist(dist: Tuple[int, int, int, int]) -> int:
    return sum(max(0, dist[i] - BASE_LIMITS[i]) for i in range(4))


def compute_alpha_overflow(draws: List[Dict[str, Any]]) -> float:
    """
    Вычисляем частоту overflow>=1 по истории и переводим в ALPHA_OVERFLOW.
    Это не "точная математика", а практичная калибровка:
      alpha = clamp(p_overflow, 0.03..0.25)
    """
    n = 0
    over = 0
    for d in draws:
        nums = d.get("numbers")
        if not (isinstance(nums, list) and len(nums) == 6 and all(isinstance(x, int) for x in nums)):
            continue
        dist = counts_for_numbers(nums)
        if overflow_for_dist(dist) >= 1:
            over += 1
        n += 1

    if n == 0:
        return 0.12

    p = over / float(n)

    # ограничим разумным коридором (иначе при маленькой истории может улетать)
    return max(0.03, min(0.25, p))


def compute_beta_zero_by_segment(draws: List[Dict[str, Any]]) -> List[float]:
    """
    Опционально: "штраф" за нулевой сегмент по каждому сегменту.
    Мы делаем очень мягко: beta_i = clamp(1 - p0_i, 0.80..1.00)
    Где p0_i = доля тиражей, где в сегмент i попало 0 чисел.

    Если beta ближе к 1 — почти не штрафуем нули.
    Если beta ближе к 0.8 — нули штрафуем заметнее.
    """
    n = 0
    zeros = [0, 0, 0, 0]
    for d in draws:
        nums = d.get("numbers")
        if not (isinstance(nums, list) and len(nums) == 6 and all(isinstance(x, int) for x in nums)):
            continue
        dist = counts_for_numbers(nums)
        for i in range(4):
            if dist[i] == 0:
                zeros[i] += 1
        n += 1

    if n == 0:
        return [1.0, 1.0, 1.0, 1.0]

    betas = []
    for i in range(4):
        p0 = zeros[i] / float(n)
        b = 1.0 - p0
        b = max(0.80, min(1.00, b))
        betas.append(b)
    return betas


def compute_cluster_weights(draws: List[Dict[str, Any]], seg_weights: List[float]) -> Dict[str, Any]:
    """
    Compute clustering statistics for draw history.
    Returns cluster centroids, sizes, and distribution patterns.
    Uses silhouette analysis to determine optimal number of clusters.
    """
    if not CLUSTERING_AVAILABLE or len(draws) < 4:
        return {
            "error": "Clustering module not available",
            "details": CLUSTERING_IMPORT_ERROR,
        }
    # Process draws to add distribution field
    processed_draws = []
    for d in draws:
        numbers = d.get("numbers")
        if isinstance(numbers, list) and len(numbers) == 6:
            d_copy = dict(d)
            d_copy["distribution"] = draw_clustering.numbers_to_distribution(numbers)
            processed_draws.append(d_copy)
    
    if len(processed_draws) < 4:
        return {"error": "Insufficient valid draws for clustering"}

    print(f"[DEBUG] weights.py: Starting clustering with {len(processed_draws)} draws")

    # Find optimal number of clusters using silhouette analysis
    print(f"[DEBUG] weights.py: Starting silhouette analysis")
    optimal_result = draw_clustering.find_optimal_clusters(
        processed_draws,
        segment_weights=seg_weights,
        max_clusters=5,
        min_clusters=2
    )
    print(f"[DEBUG] weights.py: Silhouette analysis completed")
    
    if "error" in optimal_result:
        # Fallback to fixed 4 clusters if silhouette analysis fails
        result = draw_clustering.weighted_kmeans_clustering(
            processed_draws,
            segment_weights=seg_weights,
            n_clusters=4
        )
    else:
        result = optimal_result["clustering_result"]
    
    if "error" in result:
        return result
    
    # Build cluster statistics
    clusters_data = {}
    total_draws = sum(len(cluster) for cluster in result["clusters"].values())
    
    for i in range(result["n_clusters"]):
        cluster_draws = result["clusters"].get(i, [])
        centroid = result["centroids"][i] if i < len(result["centroids"]) else (0, 0, 0, 0)
        
        # Get distribution patterns in this cluster
        patterns = {}
        for draw in cluster_draws:
            dist = draw.get("distribution")
            if dist:
                patterns[str(dist)] = patterns.get(str(dist), 0) + 1
        
        # Sort patterns by frequency
        sorted_patterns = sorted(patterns.items(), key=lambda x: -x[1])
        
        clusters_data[f"cluster_{i+1}"] = {
            "centroid": [round(float(x), 3) for x in centroid],
            "size": len(cluster_draws),
            "percentage": round(len(cluster_draws) / total_draws * 100, 1) if total_draws > 0 else 0,
            "dominant_patterns": [{"pattern": eval(p[0]), "count": p[1]} for p in sorted_patterns[:3]],
            "description": _get_cluster_description(i + 1, centroid)
        }
    
    return {
        "n_clusters": result["n_clusters"],
        "method": result.get("method", "weighted_kmeans"),
        "segment_weights_used": seg_weights,
        "clusters": clusters_data,
        "recommendations": _generate_recommendations(clusters_data),
        "optimal_n_clusters": optimal_result.get("optimal_n_clusters", result["n_clusters"]),
        "silhouette_score": optimal_result.get("optimal_score", 0.0)
    }


def _get_cluster_description(cluster_id: int, centroid: Tuple[float, float, float, float] = None) -> str:
    """Get human-readable description for each cluster based on centroid data."""
    if centroid is None:
        return "Unknown cluster"
    
    # centroid is (a,b,c,d) where:
    # a = avg count in S1 (1-9)
    # b = avg count in S2 (10-19)
    # c = avg count in S3 (20-29)
    # d = avg count in S4 (30-37)
    
    a, b, c, d = centroid
    
    # Find dominant segments (above average of 1.5 since we have 6 picks across 4 segments)
    avg_per_segment = 6.0 / 4.0  # 1.5
    
    dominant_segments = []
    if a > avg_per_segment + 0.3:
        dominant_segments.append("S1 (1-9)")
    if b > avg_per_segment + 0.3:
        dominant_segments.append("S2 (10-19)")
    if c > avg_per_segment + 0.3:
        dominant_segments.append("S3 (20-29)")
    if d > avg_per_segment + 0.3:
        dominant_segments.append("S4 (30-37)")
    
    # Find weak segments (below average)
    weak_segments = []
    if a < avg_per_segment - 0.3:
        weak_segments.append("S1 (1-9)")
    if b < avg_per_segment - 0.3:
        weak_segments.append("S2 (10-19)")
    if c < avg_per_segment - 0.3:
        weak_segments.append("S3 (20-29)")
    if d < avg_per_segment - 0.3:
        weak_segments.append("S4 (30-37)")
    
    # Build description
    if not dominant_segments and not weak_segments:
        return f"Balanced distribution (avg: {a:.1f}, {b:.1f}, {c:.1f}, {d:.1f})"
    
    description_parts = []
    
    if dominant_segments:
        if len(dominant_segments) == 1:
            description_parts.append(f"{dominant_segments[0]}-heavy")
        else:
            description_parts.append(f"{', '.join(dominant_segments)}-biased")
    
    if weak_segments:
        if len(weak_segments) == 1:
            description_parts.append(f"low {weak_segments[0]}")
        else:
            description_parts.append(f"low {', '.join(weak_segments)}")
    
    base_desc = " + ".join(description_parts)
    
    # Add risk assessment based on distribution
    # High variance in distribution = higher risk/unusual pattern
    variance = sum((x - avg_per_segment) ** 2 for x in [a, b, c, d]) / 4
    if variance > 0.5:
        risk_level = "rare, high-risk pattern"
    elif variance > 0.2:
        risk_level = "unusual pattern"
    else:
        risk_level = "common pattern"
    
    return f"{base_desc} - {risk_level} (avg: {a:.1f}, {b:.1f}, {c:.1f}, {d:.1f})"


def _generate_recommendations(clusters_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate recommendations based on cluster analysis."""
    sizes = {k: v["size"] for k, v in clusters_data.items()}
    total = sum(sizes.values())
    
    if total == 0:
        return {"note": "No data available for recommendations"}
    
    # Find smallest clusters (potential opportunities)
    sorted_by_size = sorted(sizes.items(), key=lambda x: x[1])
    smallest = sorted_by_size[:2]  # Two smallest clusters
    
    return {
        "most_common_cluster": max(sizes.items(), key=lambda x: x[1])[0],
        "rare_clusters": [c[0] for c in smallest],
        "suggested_strategy": "Consider targeting rare clusters for potential underexploited patterns",
        "cluster_targets": {
            c[0].replace("cluster_", ""): {
                "size": c[1],
                "opportunity_score": round((total - c[1]) / total * 100, 1)
            }
            for c in sorted_by_size
        }
    }


def compute_all_weights(draws: List[Dict[str, Any]]) -> Dict[str, Any]:
    seg_w = compute_seg_weights(draws)
    alpha = compute_alpha_overflow(draws)
    beta_seg = compute_beta_zero_by_segment(draws)
    
    # Compute clustering weights
    cluster_data = compute_cluster_weights(draws, seg_w)

    return {
        "segments": {
            "S1_1_9": seg_w[0],
            "S2_10_19": seg_w[1],
            "S3_20_29": seg_w[2],
            "S4_30_37": seg_w[3],
        },
        "SEG_WEIGHTS": seg_w,
        "ALPHA_OVERFLOW": alpha,
        "BETA_ZERO_BY_SEGMENT": beta_seg,
        "BASE_LIMITS": BASE_LIMITS,
        "segment_sizes": SEG_SIZES,
        "total_numbers": TOTAL_NUMBERS,
        "picks": PICKS,
        "n_draws_used": sum(
            1
            for d in draws
            if isinstance(d.get("numbers"), list)
            and len(d["numbers"]) == 6
            and all(isinstance(x, int) for x in d["numbers"])
        ),
        "clustering": cluster_data,
    }
