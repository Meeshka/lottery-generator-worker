# draw_history.py
# -*- coding: utf-8 -*-

from __future__ import annotations
import json
import os
from typing import Dict, Iterable, List, Set, Any


def load_history_ids(path: str) -> Set[int]:
    ids: Set[int] = set()
    if not path or not os.path.exists(path):
        return ids

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
                ids.add(obj["id"])
    return ids


def load_history(path: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not path or not os.path.exists(path):
        return out
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
                out.append(obj)
    return out


def append_new_draws_jsonl(path: str, draws: Iterable[Dict[str, Any]]) -> int:
    """
    Дописывает только новые (по id). Возвращает количество добавленных.
    """
    existing = load_history_ids(path)
    added = 0

    # ensure dir
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.exists(d):
        os.makedirs(d)

    with open(path, "a", encoding="utf-8") as f:
        for draw in draws:
            draw_id = draw.get("id")
            if not isinstance(draw_id, int):
                continue
            if draw_id in existing:
                continue
            f.write(json.dumps(draw, ensure_ascii=False) + "\n")
            existing.add(draw_id)
            added += 1

    return added
