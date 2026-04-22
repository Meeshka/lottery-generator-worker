# -*- coding: utf-8 -*-
"""
Clustering module for lottery draw history.
Groups draws by their (a,b,c,d) segment distribution patterns.
"""

from __future__ import annotations

import json
import os
from typing import Dict, List, Tuple, Any
from collections import Counter, defaultdict
import numpy as np

# Segment boundaries matching lottery_generator.py
SEGMENTS = [
    list(range(1, 10)),   # S1: 1-9
    list(range(10, 20)),  # S2: 10-19
    list(range(20, 30)),  # S3: 20-29
    list(range(30, 38)),  # S4: 30-37
]


def get_segment_index(n: int) -> int:
    """Return segment index (0-3) for a number (1-37)."""
    if 1 <= n <= 9:
        return 0
    elif 10 <= n <= 19:
        return 1
    elif 20 <= n <= 29:
        return 2
    else:  # 30-37
        return 3


def numbers_to_distribution(numbers: List[int]) -> Tuple[int, int, int, int]:
    """
    Convert list of 6 numbers to (a,b,c,d) segment distribution.
    a = count in S1 (1-9)
    b = count in S2 (10-19)
    c = count in S3 (20-29)
    d = count in S4 (30-37)
    """
    dist = [0, 0, 0, 0]
    for n in numbers:
        dist[get_segment_index(n)] += 1
    return tuple(dist)


def load_draws_for_clustering(path: str) -> List[Dict[str, Any]]:
    """Load draws and add distribution vectors."""
    draws = []
    if not path or not os.path.exists(path):
        return draws
    
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if isinstance(obj, dict) and isinstance(obj.get("id"), int):
                numbers = obj.get("numbers", [])
                if len(numbers) == 6:
                    obj["distribution"] = numbers_to_distribution(numbers)
                    draws.append(obj)
    return draws


def analyze_distribution_frequencies(draws: List[Dict[str, Any]]) -> Dict[Tuple, int]:
    """Count how often each (a,b,c,d) pattern appears."""
    dist_counter = Counter()
    for draw in draws:
        dist = draw.get("distribution")
        if dist:
            dist_counter[dist] += 1
    return dict(dist_counter)


def kmeans_cluster_distributions(
    draws: List[Dict[str, Any]], 
    n_clusters: int = 4,
    max_iterations: int = 100
) -> Dict[str, Any]:
    """
    Simple k-means clustering on (a,b,c,d) distributions.
    Returns cluster assignments and centroids.
    """
    if not draws:
        return {"error": "No draws to cluster"}
    
    # Extract distribution vectors
    vectors = np.array([d["distribution"] for d in draws], dtype=float)
    n_samples = len(vectors)
    
    if n_samples < n_clusters:
        n_clusters = n_samples
    
    # Initialize centroids randomly from data points
    np.random.seed(42)
    indices = np.random.choice(n_samples, n_clusters, replace=False)
    centroids = vectors[indices].copy()
    
    # K-means iterations
    for iteration in range(max_iterations):
        # Assign points to nearest centroid
        distances = np.sqrt(((vectors[:, np.newaxis] - centroids) ** 2).sum(axis=2))
        labels = np.argmin(distances, axis=1)
        
        # Update centroids
        new_centroids = np.array([
            vectors[labels == k].mean(axis=0) if np.sum(labels == k) > 0 else centroids[k]
            for k in range(n_clusters)
        ])
        
        # Check convergence
        if np.allclose(centroids, new_centroids, atol=1e-6):
            break
        centroids = new_centroids
    
    # Build result
    clusters = defaultdict(list)
    for i, draw in enumerate(draws):
        cluster_id = int(labels[i])
        clusters[cluster_id].append({
            "id": draw["id"],
            "numbers": draw["numbers"],
            "strong": draw.get("strong"),
            "distribution": draw["distribution"],
            "endsAt": draw.get("endsAt")
        })
    
    # Round centroids for display
    rounded_centroids = [
        tuple(round(x, 2) for x in centroid)
        for centroid in centroids
    ]
    
    return {
        "n_clusters": n_clusters,
        "centroids": rounded_centroids,
        "clusters": dict(clusters),
        "iterations": iteration + 1
    }


def weighted_kmeans_clustering(
    draws: List[Dict[str, Any]],
    segment_weights: List[float] = None,
    n_clusters: int = 4
) -> Dict[str, Any]:
    """
    K-means with weighted distance metric (respecting SEG_WEIGHTS).
    """
    if segment_weights is None:
        segment_weights = [0.9, 0.96, 1.1, 1.05]  # Default from lottery_generator
    
    if not draws:
        return {"error": "No draws to cluster"}
    
    vectors = np.array([d["distribution"] for d in draws], dtype=float)
    weights = np.array(segment_weights)
    n_samples = len(vectors)
    
    if n_samples < n_clusters:
        n_clusters = n_samples
    
    # Weighted distance: multiply difference by segment weights
    def weighted_distance(a, b):
        diff = (a - b) * weights
        return np.sqrt(np.sum(diff ** 2))
    
    # Initialize centroids
    np.random.seed(42)
    indices = np.random.choice(n_samples, n_clusters, replace=False)
    centroids = vectors[indices].copy()
    
    # Weighted k-means
    for iteration in range(100):
        # Assign to nearest centroid (weighted distance)
        labels = np.zeros(n_samples, dtype=int)
        for i in range(n_samples):
            distances = [weighted_distance(vectors[i], c) for c in centroids]
            labels[i] = np.argmin(distances)
        
        # Update centroids
        new_centroids = np.array([
            vectors[labels == k].mean(axis=0) if np.sum(labels == k) > 0 else centroids[k]
            for k in range(n_clusters)
        ])
        
        if np.allclose(centroids, new_centroids, atol=1e-6):
            break
        centroids = new_centroids
    
    # Build clusters
    clusters = defaultdict(list)
    for i, draw in enumerate(draws):
        cluster_id = int(labels[i])
        clusters[cluster_id].append({
            "id": draw["id"],
            "numbers": draw["numbers"],
            "strong": draw.get("strong"),
            "distribution": draw["distribution"]
        })
    
    return {
        "n_clusters": n_clusters,
        "centroids": [tuple(round(x, 2) for x in c) for c in centroids],
        "clusters": dict(clusters),
        "segment_weights": segment_weights,
        "method": "weighted_kmeans"
    }


def print_cluster_analysis(result: Dict[str, Any]) -> None:
    """Pretty print clustering results."""
    print("\n" + "="*60)
    print("DRAW HISTORY CLUSTERING ANALYSIS")
    print("="*60)
    
    if "error" in result:
        print(f"Error: {result['error']}")
        return
    
    print(f"\nMethod: {result.get('method', 'kmeans')}")
    print(f"Number of clusters: {result['n_clusters']}")
    print(f"Iterations to converge: {result.get('iterations', 'N/A')}")
    
    if result.get('segment_weights'):
        print(f"Segment weights: {result['segment_weights']}")
    
    print("\n" + "-"*60)
    print("CLUSTER CENTROIDS (a,b,c,d) where:")
    print("  a = count in 1-9, b = count in 10-19")
    print("  c = count in 20-29, d = count in 30-37")
    print("-"*60)
    
    clusters = result["clusters"]
    centroids = result["centroids"]
    
    for i in range(len(clusters)):
        cluster_draws = clusters.get(i, [])
        centroid = centroids[i] if i < len(centroids) else (0,0,0,0)
        
        print(f"\n[CLUSTER {i+1}] (n={len(cluster_draws)} draws)")
        print(f"   Centroid: {centroid}")
        
        # Show distribution patterns in this cluster
        dist_patterns = Counter(d["distribution"] for d in cluster_draws)
        print(f"   Patterns: {dict(dist_patterns)}")
        
        # Show sample draws
        print("   Sample draws:")
        for draw in cluster_draws[:3]:  # Show first 3
            nums = " ".join(f"{n:2d}" for n in draw["numbers"])
            dist = draw["distribution"]
            strong = draw.get("strong", "?")
            print(f"     Draw {draw['id']}: [{nums}]  dist={dist}  strong={strong}")
        if len(cluster_draws) > 3:
            print(f"     ... and {len(cluster_draws)-3} more")
    
    print("\n" + "="*60)


def analyze_cluster_patterns(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract insights from clusters."""
    insights = {
        "dominant_patterns": [],
        "rare_patterns": [],
        "cluster_sizes": []
    }
    
    clusters = result.get("clusters", {})
    total_draws = sum(len(c) for c in clusters.values())
    
    for i, cluster_draws in clusters.items():
        size = len(cluster_draws)
        percentage = (size / total_draws) * 100 if total_draws > 0 else 0
        insights["cluster_sizes"].append({
            "cluster": i,
            "count": size,
            "percentage": round(percentage, 1)
        })
        
        # Find most common pattern in cluster
        if cluster_draws:
            patterns = Counter(d["distribution"] for d in cluster_draws)
            most_common = patterns.most_common(1)[0]
            insights["dominant_patterns"].append({
                "cluster": i,
                "pattern": most_common[0],
                "frequency": most_common[1]
            })
    
    return insights


def calculate_silhouette_score(
    vectors: np.ndarray,
    labels: np.ndarray,
    weights: np.ndarray = None
) -> float:
    """
    Calculate silhouette score for clustering evaluation.
    Returns average silhouette score (range: -1 to 1, higher is better).
    """
    n_samples = len(vectors)
    if n_samples <= 1:
        return 0.0

    if weights is None:
        weights = np.ones(vectors.shape[1], dtype=float)
    else:
        weights = np.asarray(weights, dtype=float)

    unique_clusters = np.unique(labels)
    if len(unique_clusters) < 2:
        return 0.0

    weighted_vectors = vectors * weights
    diff = weighted_vectors[:, np.newaxis, :] - weighted_vectors[np.newaxis, :, :]
    distance_matrix = np.sqrt(np.sum(diff ** 2, axis=2))

    silhouette_scores = np.zeros(n_samples, dtype=float)

    for i in range(n_samples):
        cluster_i = labels[i]

        same_mask = (labels == cluster_i)
        same_mask[i] = False
        if not np.any(same_mask):
            silhouette_scores[i] = 0.0
            continue

        a = float(np.mean(distance_matrix[i, same_mask]))

        b = None
        for cluster_j in unique_clusters:
            if cluster_j == cluster_i:
                continue
            other_mask = (labels == cluster_j)
            if not np.any(other_mask):
                continue
            mean_dist = float(np.mean(distance_matrix[i, other_mask]))
            if b is None or mean_dist < b:
                b = mean_dist

        if b is None or (a == 0.0 and b == 0.0):
            silhouette_scores[i] = 0.0
        else:
            silhouette_scores[i] = (b - a) / max(a, b)

    return float(np.mean(silhouette_scores))


def find_optimal_clusters(
    draws: List[Dict[str, Any]],
    segment_weights: List[float] = None,
    max_clusters: int = 8,
    min_clusters: int = 2
) -> Dict[str, Any]:
    """
    Find optimal number of clusters using silhouette analysis.
    Tests cluster counts from min_clusters to max_clusters and returns
    the one with the highest silhouette score.
    """
    if not draws:
        return {"error": "No draws to analyze"}
    
    vectors = np.array([d["distribution"] for d in draws], dtype=float)
    weights = np.array(segment_weights) if segment_weights else np.ones(4)
    n_samples = len(vectors)
    
    # Adjust max_clusters based on sample size
    max_clusters = min(max_clusters, n_samples - 1)
    min_clusters = min(min_clusters, max_clusters)
    
    if max_clusters < 2:
        return {"error": "Insufficient samples for clustering", "optimal_n_clusters": 1}
    
    silhouette_scores = []
    cluster_results = {}
    
    id_to_index = {d["id"]: i for i, d in enumerate(draws) if "id" in d}

    for n_clusters in range(min_clusters, max_clusters + 1):
        # Run weighted k-means
        result = weighted_kmeans_clustering(
            draws,
            segment_weights=segment_weights,
            n_clusters=n_clusters
        )
        
        if "error" in result:
            continue
        
        # Calculate labels from result
        labels = np.zeros(n_samples, dtype=int)
        for cluster_id, cluster_draws in result["clusters"].items():
            for draw in cluster_draws:
                draw_idx = id_to_index.get(draw["id"])
                if draw_idx is not None:
                    labels[draw_idx] = cluster_id
        
        # Calculate silhouette score
        score = calculate_silhouette_score(vectors, labels, weights)
        silhouette_scores.append((n_clusters, score))
        cluster_results[n_clusters] = result
    
    if not silhouette_scores:
        return {"error": "Failed to cluster with any n_clusters"}
    
    # Find optimal n_clusters (highest silhouette score)
    optimal_n_clusters, optimal_score = max(silhouette_scores, key=lambda x: x[1])
    
    return {
        "optimal_n_clusters": optimal_n_clusters,
        "silhouette_scores": silhouette_scores,
        "optimal_score": optimal_score,
        "clustering_result": cluster_results.get(optimal_n_clusters)
    }


if __name__ == "__main__":
    # Load and cluster the draw history
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    history_path = os.path.join(script_dir, "../data/draw_history.jsonl")
    
    print("Loading draw history...")
    draws = load_draws_for_clustering(history_path)
    print(f"Loaded {len(draws)} draws")
    
    # Show distribution frequency analysis
    print("\n" + "="*60)
    print("DISTRIBUTION FREQUENCY ANALYSIS")
    print("="*60)
    dist_freq = analyze_distribution_frequencies(draws)
    print("\nAll (a,b,c,d) patterns found in history:")
    for pattern, count in sorted(dist_freq.items(), key=lambda x: -x[1]):
        print(f"  {pattern}: {count} draws")
    
    # Run standard k-means
    print("\n" + "="*60)
    print("STANDARD K-MEANS CLUSTERING")
    print("="*60)
    result_standard = kmeans_cluster_distributions(draws, n_clusters=4)
    print_cluster_analysis(result_standard)
    
    # Run weighted k-means (using your SEG_WEIGHTS)
    print("\n" + "="*60)
    print("WEIGHTED K-MEANS CLUSTERING (with SEG_WEIGHTS)")
    print("="*60)
    result_weighted = weighted_kmeans_clustering(
        draws, 
        segment_weights=[0.9, 0.96, 1.1, 1.05],
        n_clusters=4
    )
    print_cluster_analysis(result_weighted)
    
    # Final insights
    print("\n" + "="*60)
    print("CLUSTER INSIGHTS SUMMARY")
    print("="*60)
    insights = analyze_cluster_patterns(result_weighted)
    print("\nCluster size distribution:")
    for cs in insights["cluster_sizes"]:
        print(f"  Cluster {cs['cluster']+1}: {cs['count']} draws ({cs['percentage']}%)")
    
    print("\nDominant patterns per cluster:")
    for dp in insights["dominant_patterns"]:
        print(f"  Cluster {dp['cluster']+1}: pattern {dp['pattern']} appears {dp['frequency']} times")
