#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор билетов для лотереи 6 из 36 с ограничениями по сегментам + контрольная цифра (1..7).

Новый процесс генерации КАЖДОГО финального билета:
1) Сгенерировать 10 обычных билетов текущим алгоритмом (распределения a-b-c-d соблюдаются).
2) По этим 10 билетам посчитать частоты всех чисел (1..36) и контрольных цифр (1..7).
3) Взять 6 ЧИСЕЛ с максимальной частотой (при равенстве — меньшие числа в приоритете), отсортировать по возрастанию.
4) Взять КОНТРОЛЬНУЮ ЦИФРУ с максимальной частотой (при равенстве — меньшая цифра).
Это и будет результирующий билет.
Дополнительно: по возможности избегаем повторов результирующих билетов в одной сессии.

Сегменты:
  S1:  1–9   (не более 3 чисел)
  S2: 10–19  (не более 3 чисел)
  S3: 20–29  (не более 3 чисел)
  S4: 30–37  (не более 2 чисел)

Суммарно в билете: ровно 6 чисел.
"""

import random
import sys
import argparse
from collections import Counter
from time import sleep
import os
import re
from typing import List, Tuple, Optional, Dict, Any
import csv
import json

# Import clustering functionality
try:
    import draw_clustering
    CLUSTERING_AVAILABLE = True
except ImportError:
    CLUSTERING_AVAILABLE = False

# Диапазоны сегментов (концы включительно)
SEGMENTS = [
    list(range(1, 10)),   # 1..9    (9 чисел)
    list(range(10, 20)),  # 10..19  (10 чисел)
    list(range(20, 30)),  # 20..29  (10 чисел)
    list(range(30, 38)),  # 30..37  (7 чисел)
]

# Ограничения по количеству чисел в сегменте
BASE_LIMITS = [3, 3, 3, 2]
HARD_LIMITS = [4, 4, 4, 3]

SEG_WEIGHTS = [0.9, 0.96, 1.1, 1.05]

ALPHA_OVERFLOW = 0.12   # штраф за каждую единицу превышения базы
BETA_ZERO = 0.85        # (legacy) штраф за каждый нулевой сегмент (можно 1.0 отключить)
# Если загрузим веса из API-истории, то может быть задано по-сегментное наказание за нулевой сегмент.
# Тогда BETA_ZERO будет игнорироваться.
BETA_ZERO_BY_SEGMENT: Optional[List[float]] = None

# Clustering data loaded from weights.json
CLUSTERING_DATA: Optional[Dict[str, Any]] = None

# Файл с пересчитанными весами (обновляется опцией "обновить статистику")
WEIGHTS_DEFAULT = "weights.json"

HISTORY_DEFAULT = "tickets.csv"

def dist_weight(dist):
    # dist = (a,b,c,d)
    overflow = sum(max(0, dist[i] - BASE_LIMITS[i]) for i in range(4))
    zeros = [i for i, x in enumerate(dist) if x == 0]

    w = 1.0
    for i in range(4):
        w *= (SEG_WEIGHTS[i] ** dist[i])

    w *= (ALPHA_OVERFLOW ** overflow)
    if BETA_ZERO_BY_SEGMENT and len(BETA_ZERO_BY_SEGMENT) == 4:
        for i in zeros:
            w *= float(BETA_ZERO_BY_SEGMENT[i])
    else:
        w *= (BETA_ZERO ** len(zeros))
    return w

def parse_history_line(line: str) -> Optional[Tuple[int, ...]]:
    """
    Принимает строку, достаёт первые 6 чисел.
    Допускаются разделители: пробелы, запятые, ;, табы.
    """
    nums = [int(x) for x in re.findall(r"\d+", line)]
    if len(nums) < 6:
        return None
    nums = nums[:6]

    # проверка диапазона (у тебя сегменты до 37) :contentReference[oaicite:2]{index=2}
    if any(n < 1 or n > 37 for n in nums):
        return None
    if len(set(nums)) != 6:
        return None

    return tuple(sorted(nums))

def load_history(path: str) -> List[Tuple[int, ...]]:
    if not path or not os.path.exists(path):
        return []

    res = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue

            # пропускаем заголовок, если он есть
            if row[0].strip().lower() in ("n1", "num1", "a"):
                continue

            nums = []
            for cell in row:
                cell = cell.strip()
                if cell == "":
                    continue
                # берём только первые 6 чисел
                try:
                    nums.append(int(cell))
                except ValueError:
                    continue
                if len(nums) == 6:
                    break

            if len(nums) != 6:
                continue
            if any(n < 1 or n > 37 for n in nums):
                continue
            if len(set(nums)) != 6:
                continue

            res.append(tuple(sorted(nums)))

    return res

def append_history(path: str, tickets: List[Tuple[int, ...]], ctrls: Optional[List[int]] = None) -> None:
    if not path:
        return

    file_exists = os.path.exists(path)
    with open(path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)

        # если файл новый — пишем заголовок
        if not file_exists:
            writer.writerow(["n1", "n2", "n3", "n4", "n5", "n6", "ctrl"])

        for i, t in enumerate(tickets):
            row = list(t)
            if ctrls is not None and i < len(ctrls):
                row.append(int(ctrls[i]))
            else:
                row.append("")  # ctrl пустой
            writer.writerow(row)

def intersection_size(a: Tuple[int, ...], b: Tuple[int, ...]) -> int:
    return len(set(a).intersection(b))

def max_intersection(candidate: Tuple[int, ...], pool: List[Tuple[int, ...]]) -> int:
    if not pool:
        return 0
    return max(intersection_size(candidate, t) for t in pool)

def allowed_distributions_weighted():
    res = []
    for a in range(HARD_LIMITS[0] + 1):
        for b in range(HARD_LIMITS[1] + 1):
            for c in range(HARD_LIMITS[2] + 1):
                for d in range(HARD_LIMITS[3] + 1):
                    if a + b + c + d != 6:
                        continue
                    dist = (a, b, c, d)
                    res.append((dist, dist_weight(dist)))
    return res

# Кэш, потому что веса могут обновляться по API
ALLOWED_CACHE = None  # type: Optional[List[Tuple[Tuple[int,int,int,int], float]]]


def get_allowed():
    global ALLOWED_CACHE
    if ALLOWED_CACHE is None:
        ALLOWED_CACHE = allowed_distributions_weighted()
    return ALLOWED_CACHE


def invalidate_allowed_cache():
    global ALLOWED_CACHE
    ALLOWED_CACHE = None


def load_dynamic_weights(weights_path: str) -> bool:
    """Load SEG_WEIGHTS / ALPHA_OVERFLOW / BETA_ZERO_BY_SEGMENT / CLUSTERING from a json file.

    Returns True if something was loaded.
    """
    global SEG_WEIGHTS, ALPHA_OVERFLOW, BETA_ZERO_BY_SEGMENT, CLUSTERING_DATA
    if not weights_path or not os.path.exists(weights_path):
        return False
    try:
        with open(weights_path, "r", encoding="utf-8") as f:
            w = json.load(f)
    except Exception:
        return False

    changed = False
    sw = w.get("SEG_WEIGHTS")
    if isinstance(sw, list) and len(sw) == 4:
        SEG_WEIGHTS = [float(x) for x in sw]
        changed = True

    ao = w.get("ALPHA_OVERFLOW")
    if isinstance(ao, (int, float)) and float(ao) > 0:
        ALPHA_OVERFLOW = float(ao)
        changed = True

    bz = w.get("BETA_ZERO_BY_SEGMENT")
    if isinstance(bz, list) and len(bz) == 4:
        BETA_ZERO_BY_SEGMENT = [float(x) for x in bz]
        changed = True
    
    # Load clustering data if available
    clustering = w.get("clustering")
    if isinstance(clustering, dict) and "clusters" in clustering:
        CLUSTERING_DATA = clustering
        changed = True

    if changed:
        invalidate_allowed_cache()
    return changed

def random_ticket(rng: random.Random, dist=None):
    """
    Сгенерировать один обычный билет (6 чисел по возрастанию) и контрольную цифру (1..7).
    dist — необязательная конкретная четверка (a,b,c,d); если None, выберем случайно из допустимых.
    """
    if dist is None:
        allowed = get_allowed()
        dists = [d for d, w in allowed]
        weights = [w for d, w in allowed]
        dist = rng.choices(dists, weights=weights, k=1)[0]

    picks = []
    for seg_idx, count in enumerate(dist):
        if count == 0:
            continue
        picks.extend(rng.sample(SEGMENTS[seg_idx], count))
    picks.sort()
    control = rng.randint(1, 7)  # контрольная цифра 1..7
    return tuple(picks), dist, control

def consensus_from_batch(batch):
    """
    batch: list of 10 tuples (nums_tuple6, dist, ctrl)

    Возвращает (top6_numbers, top_ctrl), где top6 выбирается
    через оптимизацию:
      score = sum(freq) * SEGMENT_PREF * overflow_penalty * zero_penalty

    HARD_LIMITS задаёт максимально допустимые количества по сегментам (мягкий потолок).
    BASE_LIMITS задаёт "норму" (выход за неё штрафуется через ALPHA_OVERFLOW).
    """
    num_counter = Counter()
    ctrl_counter = Counter()

    for nums, _dist, ctrl in batch:
        num_counter.update(nums)
        ctrl_counter.update([ctrl])

    # Списки чисел по сегментам
    seg_lists = [[], [], [], []]  # каждый элемент: (n, freq)

    def seg_index(n: int) -> int:
        if 1 <= n <= 9:
            return 0
        elif 10 <= n <= 19:
            return 1
        elif 20 <= n <= 29:
            return 2
        else:  # 30..37
            return 3

    for n in range(1, 38):
        si = seg_index(n)
        seg_lists[si].append((n, num_counter.get(n, 0)))

    # Сортируем внутри сегментов: чаще -> раньше, при равенстве -> меньшее число раньше
    for si in range(4):
        seg_lists[si].sort(key=lambda kv: (-kv[1], kv[0]))

    # Префиксы "лучших чисел" для быстрого выбора top-k из сегмента
    # top_nums[si][k] = список первых k чисел сегмента
    # top_sumfreq[si][k] = сумма их частот
    top_nums = [[[] for _ in range(7)] for _ in range(4)]      # k максимум 6
    top_sumfreq = [[0 for _ in range(7)] for _ in range(4)]

    for si in range(4):
        cur_nums = []
        cur_sum = 0
        top_nums[si][0] = []
        top_sumfreq[si][0] = 0
        for k in range(1, 7):
            n, f = seg_lists[si][k-1]
            cur_nums.append(n)
            cur_sum += f
            top_nums[si][k] = list(cur_nums)
            top_sumfreq[si][k] = cur_sum

    # Все допустимые распределения по HARD_LIMITS
    dists = []
    for a in range(HARD_LIMITS[0] + 1):
        for b in range(HARD_LIMITS[1] + 1):
            for c in range(HARD_LIMITS[2] + 1):
                for d in range(HARD_LIMITS[3] + 1):
                    if a + b + c + d == 6:
                        dists.append((a, b, c, d))

    best_score = None
    best_nums = None

    for dist in dists:
        a, b, c, d = dist

        # берём топы внутри сегментов
        nums = top_nums[0][a] + top_nums[1][b] + top_nums[2][c] + top_nums[3][d]
        nums_sorted = tuple(sorted(nums))

        # базовый "плюс" = сумма частот
        sumfreq = top_sumfreq[0][a] + top_sumfreq[1][b] + top_sumfreq[2][c] + top_sumfreq[3][d]

        # мягкие предпочтения сегментов (как в генераторе dist_weight)
        seg_pref = (SEG_WEIGHTS[0] ** a) * (SEG_WEIGHTS[1] ** b) * (SEG_WEIGHTS[2] ** c) * (SEG_WEIGHTS[3] ** d)

        # штраф за превышение базы
        overflow = sum(max(0, dist[i] - BASE_LIMITS[i]) for i in range(4))
        overflow_pen = (ALPHA_OVERFLOW ** overflow)

        # опциональный штраф за "нули"
        zero_idxs = [i for i, x in enumerate(dist) if x == 0]
        if BETA_ZERO_BY_SEGMENT and len(BETA_ZERO_BY_SEGMENT) == 4:
            zero_pen = 1.0
            for i in zero_idxs:
                zero_pen *= float(BETA_ZERO_BY_SEGMENT[i])
        else:
            zero_pen = (BETA_ZERO ** len(zero_idxs))

        # итоговый score (умножение, чтобы логика была как у весов)
        score = (sumfreq + 1e-9) * seg_pref * overflow_pen * zero_pen

        # tie-break: если score равен, предпочитаем "меньшие числа" лексикографически
        if best_score is None or score > best_score or (abs(score - best_score) < 1e-12 and nums_sorted < best_nums):
            best_score = score
            best_nums = nums_sorted

    # контрольная цифра по частоте (как было)
    ctrl_items = [(k, ctrl_counter.get(k, 0)) for k in range(1, 8)]
    ctrl_items.sort(key=lambda kv: (-kv[1], kv[0]))
    top_ctrl = ctrl_items[0][0]

    return best_nums, top_ctrl

def build_final_ticket(rng: random.Random, show_batch=False):
    """
    Генерирует одну партию из 10 обычных билетов и собирает итоговый по правилу консенсуса.
    Возвращает:
        final_nums (tuple[int,int,int,int,int,int])
        final_control (int 1..7)
        batch (list из 10 кортежей (nums, dist, control))
    """
    batch = [random_ticket(rng) for _ in range(10)]
    final_nums, final_control = consensus_from_batch(batch)

    if show_batch:
        print("  Кандидаты (10 шт.):")
        for i, (nums, dist, ctrl) in enumerate(batch, start=1):
            print("   - {:2d}) {}  (распр.: {}-{}-{}-{}; контрольная: {})"
                  .format(i, " ".join("{:>2}".format(x) for x in nums),
                          dist[0], dist[1], dist[2], dist[3], ctrl))
        print("  => Итоговые числа:", " ".join("{:>2}".format(x) for x in final_nums),
              "; контрольная:", final_control)

    return final_nums, final_control, batch

def ask_int(prompt, min_value=None, max_value=None, default=10, use_defaults=False):
    if use_defaults:
        return default
    while True:
        try:
            raw = input(prompt).strip()
            value = int(raw)
            if min_value is not None and value < min_value:
                print("Число должно быть ≥ {}.\n".format(min_value))
                continue
            if max_value is not None and value > max_value:
                print("Число должно быть ≤ {}.\n".format(max_value))
                continue
            return value
        except ValueError:
            #print("Введите целое число.\n")
            return default

def ask_yes_no(prompt, default=False, use_defaults=False):
    """
    Возвращает True/False.
    default: значение по умолчанию при пустом вводе.
    """
    if use_defaults:
        return default
    suffix = " [Y/n]: " if default else " [y/N]: "
    while True:
        raw = input(prompt + suffix).strip().lower()
        if raw == "" and default is not None:
            return default
        if raw in ("y", "yes", "д", "да"):
            return True
        if raw in ("n", "no", "н", "нет"):
            return False
        print("Ответьте 'y' или 'n'.")

def get_input_with_default(prompt, default_value, use_defaults=False):
    """Get user input or return default if skipping questions"""
    if use_defaults:
        return default_value
    return input(f"{prompt} (default: {default_value}): ").strip() or default_value

def get_segment_distribution(numbers: List[int]) -> Tuple[int, int, int, int]:
    """Convert list of numbers to (a,b,c,d) segment distribution."""
    dist = [0, 0, 0, 0]
    for n in numbers:
        if 1 <= n <= 9:
            dist[0] += 1
        elif 10 <= n <= 19:
            dist[1] += 1
        elif 20 <= n <= 29:
            dist[2] += 1
        else:  # 30-37
            dist[3] += 1
    return tuple(dist)


def distribution_distance(dist1: Tuple[int, ...], dist2: Tuple[int, ...]) -> float:
    """Calculate Euclidean distance between two distributions."""
    return sum((a - b) ** 2 for a, b in zip(dist1, dist2)) ** 0.5


def main():
    parser = argparse.ArgumentParser(description='Генератор билетов 6 из 37 с сегментами и контрольной цифрой')
    parser.add_argument('--defaults', action='store_true', help='Пропустить все вопросы и использовать значения по умолчанию')
    parser.add_argument('--cluster-target', type=int, choices=[1, 2, 3, 4], default=None,
                        help='Target cluster (1-4) for distribution bias. Uses historical clustering to favor specific patterns.')
    args = parser.parse_args()
    
    use_defaults = args.defaults
    
    print("Генератор билетов 6 из 37 (сегменты 1–9, 10–19, 20–29, 30–37) + контрольная цифра (1..7).")
    print("Новый режим: каждый итоговый билет собирается из 10 кандидатных по правилу частот и веса сегмента.\n")
    print("Учитываются уже созданные билеты с целью большего покрытия вариантов (без повторения комбинаций)")

    n = ask_int("Сколько итоговых билетов сгенерировать? (default: 10)", min_value=1, default=10, use_defaults=use_defaults)

    # Необязательный seed, чтобы можно было воспроизводить результаты
    seed_input = get_input_with_default("Необязательный seed", "", use_defaults=use_defaults)
    if seed_input:
        try:
            seed = int(seed_input)
        except ValueError:
            seed = seed_input  # строка тоже ок
        rng = random.Random(seed)
        print("Используется seed:", seed)
    else:
        rng = random.Random()

    # (опционально) обновить статистику по тиражам + пересчитать веса сегментов
    # Требуются файлы:
    #   auth.json  : {"idNumber":"...","phoneNumber":"..."}
    #   token.json : {"accessToken":"...", "savedAt": 1234567890}  (может быть создан автоматически)
    #   draw_history.jsonl : локальная история тиражей
    #   weights.json : сюда пишется пересчёт
    do_update = ask_yes_no("Запустить обновление статистики по тиражам (lottosheli.com) перед генерацией? (default: Yes)", default=True, use_defaults=use_defaults)
    if do_update:
        try:
            import lotto_update
        except Exception as e:
            print("Не удалось импортировать модуль lotto_update.py:", e)
        else:
            auth_path = get_input_with_default("Файл credentials", "auth.json", use_defaults=use_defaults)
            token_path = get_input_with_default("Файл токена", "token.json", use_defaults=use_defaults)
            draw_path = get_input_with_default("Файл истории тиражей JSONL", "draw_history.jsonl", use_defaults=use_defaults)
            weights_path = get_input_with_default(f"Файл весов", WEIGHTS_DEFAULT, use_defaults=use_defaults)
            try:
                lotto_update.update_history_and_weights(
                    auth_path=auth_path,
                    token_path=token_path,
                    history_path=draw_path,
                    weights_path=weights_path,
                )
            except Exception as e:
                print("ОШИБКА обновления статистики:", e)

    # Загрузим веса если файл существует (даже если update не запускали)
    weights_path = get_input_with_default(f"Загрузить веса из {WEIGHTS_DEFAULT} (Enter = да / путь / '-' = нет)", WEIGHTS_DEFAULT, use_defaults=use_defaults)
    if weights_path != "-":
        weights_path = weights_path or WEIGHTS_DEFAULT
        if load_dynamic_weights(weights_path):
            print("Загружены веса из", weights_path)
            print("  SEG_WEIGHTS:", SEG_WEIGHTS)
            print("  ALPHA_OVERFLOW:", ALPHA_OVERFLOW)
            if BETA_ZERO_BY_SEGMENT:
                print("  BETA_ZERO_BY_SEGMENT:", BETA_ZERO_BY_SEGMENT)
        else:
            print("weights.json не найден/непрочитан, используем встроенные веса.")

    show_batch = ask_yes_no("Показывать 10 кандидатов для каждого билета? (default: No)", default=False, use_defaults=use_defaults)
    use_history = ask_yes_no("Использовать историю билетов из файла? (default: Yes)", default=True, use_defaults=use_defaults)
    history_path = HISTORY_DEFAULT
    history_tickets = []

    if use_history:
        raw_path = get_input_with_default(f"Файл истории", HISTORY_DEFAULT, use_defaults=use_defaults)
        if raw_path:
            history_path = raw_path
        history_tickets = load_history(history_path)
        print(f"Загружено из истории: {len(history_tickets)} билетов")

    max_common = ask_int("Максимум общих чисел с любым прошлым/текущим билетом (0..6)? (default: 3)", min_value=0, max_value=6, default=3, use_defaults=use_defaults)
    save_history = ask_yes_no("Дописывать сгенерированные билеты в файл истории? (default: Yes)", default=True, use_defaults=use_defaults)

    # CLUSTER TARGET LOGIC
    target_cluster_id = args.cluster_target
    cluster_centroids = None
    target_centroid = None
    
    if target_cluster_id is not None:
        # Try to load centroids from weights.json first (fast)
        if CLUSTERING_DATA and "clusters" in CLUSTERING_DATA:
            cluster_key = f"cluster_{target_cluster_id}"
            if cluster_key in CLUSTERING_DATA["clusters"]:
                centroid_data = CLUSTERING_DATA["clusters"][cluster_key]["centroid"]
                target_centroid = tuple(float(x) for x in centroid_data)
                cluster_info = CLUSTERING_DATA["clusters"][cluster_key]
                print(f"\n[CLUSTER MODE] Targeting Cluster {target_cluster_id} (from weights.json)")
                print(f"  Centroid: {target_centroid}")
                print(f"  Pattern: (a={target_centroid[0]:.1f}, b={target_centroid[1]:.1f}, c={target_centroid[2]:.1f}, d={target_centroid[3]:.1f})")
                print(f"  Historical frequency: {cluster_info['percentage']}% ({cluster_info['size']} draws)")
                print(f"  Description: {cluster_info['description']}")
        
        # Fallback: compute clustering from draw_history.jsonl
        elif CLUSTERING_AVAILABLE:
            draw_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "draw_history.jsonl")
            if os.path.exists(draw_path):
                draws = draw_clustering.load_draws_for_clustering(draw_path)
                if len(draws) >= 4:
                    result = draw_clustering.weighted_kmeans_clustering(
                        draws, 
                        segment_weights=SEG_WEIGHTS,
                        n_clusters=4
                    )
                    if "clusters" in result:
                        cluster_centroids = result["centroids"]
                        target_centroid = cluster_centroids[target_cluster_id - 1]  # Convert to 0-based
                        print(f"\n[CLUSTER MODE] Targeting Cluster {target_cluster_id} (computed from history)")
                        centroid_clean = tuple(float(x) for x in target_centroid)
                        print(f"  Centroid: {centroid_clean}")
                        print(f"  Pattern: (a={centroid_clean[0]:.1f}, b={centroid_clean[1]:.1f}, c={centroid_clean[2]:.1f}, d={centroid_clean[3]:.1f})")
                        print(f"  Interpretation: ", end="")
                        if target_cluster_id == 1:
                            print("S3-heavy (20-29 range favored)")
                        elif target_cluster_id == 2:
                            print("Balanced with S2 preference (10-19 range)")
                        elif target_cluster_id == 3:
                            print("Low+S3 mix (1-9 and 20-29)")
                        elif target_cluster_id == 4:
                            print("High-heavy (30-37 range favored)")
                else:
                    print(f"Недостаточно данных для кластеризации ({len(draws)} тиражей). --cluster-target игнорируется.")
                    target_cluster_id = None
            else:
                print(f"Файл истории не найден: {draw_path}. --cluster-target игнорируется.")
                target_cluster_id = None
        else:
            print("Предупреждение: Кластеризация недоступна (нет draw_clustering.py и нет данных в weights.json). --cluster-target игнорируется.")
            target_cluster_id = None

    # Генерация итоговых уникальных билетов (по 6 числам; контрольная может совпадать)
    MAX_ATTEMPTS_PER_TICKET = 2000
    seen_final = set()
    finals = []   # list of tuples: (nums_tuple, control7)
    final_nums_only = []  # только 6 чисел, без контрольной

    history_set = set(history_tickets)
    for i in range(n):
        best_candidate = None
        best_distance = float('inf')
        
        for _ in range(MAX_ATTEMPTS_PER_TICKET):
            nums, ctrl, batch = build_final_ticket(rng, show_batch=show_batch)
            # 1) избегаем точных дублей (как раньше)
            if nums in seen_final:
                continue

            # 2) избегаем уже имеющихся в истории (если включено)
            if use_history and nums in history_set:
                continue

            # 3) ограничиваем пересечения
            pool = final_nums_only + (history_tickets if use_history else [])
            if max_intersection(nums, pool) > max_common:
                continue

            # 4) CLUSTER TARGET: evaluate distance to target centroid
            if target_centroid is not None:
                dist = get_segment_distribution(list(nums))
                distance = distribution_distance(dist, target_centroid)
                if distance < best_distance:
                    best_distance = distance
                    best_candidate = (nums, ctrl)
                # Accept if very close to target (within 1.0 distance)
                if distance <= 1.0:
                    break
            else:
                # No cluster target - accept first valid ticket
                best_candidate = (nums, ctrl)
                break
        
        # Use the best candidate found
        if best_candidate is not None:
            nums, ctrl = best_candidate
            seen_final.add(nums)
            finals.append((nums, ctrl))
            final_nums_only.append(nums)
            if use_history:
                history_tickets.append(nums)
                history_set.add(nums)
            if target_centroid is not None:
                dist = get_segment_distribution(list(nums))
                distance = distribution_distance(dist, target_centroid)
                print(f"  [Cluster {target_cluster_id}] distance: {distance:.2f}, distribution: {dist}")
        else:
            print("Не удалось подобрать уникальный итоговый билет за разумное число попыток. Остановлено.")
            break

    # Вывод результатов
    print("\nСгенерировано итоговых билетов:", len(finals))
    for idx, (nums, ctrl) in enumerate(finals, start=1):
        print("Билет {idx:>3}: {t}   (контрольная: {c7})"
              .format(idx=idx,
                      t=" ".join("{:>2}".format(x) for x in nums),
                      c7=ctrl))
        sleep(1)

    print("\nПодсказка: чтобы сохранить результат в файл, запустите, например:")
    print("  python3 lottery_generator.py > tickets.txt")
    if save_history and use_history:
        append_history(history_path, final_nums_only, [c for _n, c in finals])
        print(f"Записано в историю: {len(final_nums_only)} билетов -> {history_path}")

    # add pause to keep console window open
    input("\nНажмите любую клавишу для продолжения...")

    

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nОтменено пользователем.")
        sys.exit(1)
