# -*- coding: utf-8 -*-

"""Helper to update local draw history + weights.

Used by the interactive generator when user chooses "update before generating".
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List

import lotto_api
import draw_history
import weights


def _load_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, obj: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _token_is_fresh(token_obj: Dict[str, Any], max_age_seconds: int = 6 * 60 * 60) -> bool:
    ts = token_obj.get("savedAt")
    if not isinstance(ts, int):
        return False
    return (int(time.time()) - ts) <= max_age_seconds


def _get_access_token_interactive(auth: Dict[str, Any], token_path: str) -> str:
    idn = str(auth.get("idNumber", "")).strip()
    ph = str(auth.get("phoneNumber", "")).strip()
    if not idn or not ph:
        raise RuntimeError("auth.json must contain idNumber and phoneNumber")

    print("1) Запрашиваем OTP (код придёт на телефон)...")
    lotto_api.generate_otp(idn, ph)
    code = input("Введите OTP код: ").strip()

    print("2) Валидируем OTP и получаем accessToken...")
    tok = lotto_api.validate_otp(idn, ph, code)
    access = tok["accessToken"]
    _save_json(token_path, {"accessToken": access, "savedAt": int(time.time())})
    return access


def fetch_draws_from_api(
    auth_path: str = "auth.json",
    token_path: str = "token.json",
    history_path: str = "draw_history.jsonl",
) -> int:
    """Fetch latest draws from Lotto API and append to history.

    Returns the number of new draws added.
    Requires auth.json with idNumber and phoneNumber.
    """
    auth = _load_json(auth_path)
    token_obj = _load_json(token_path)

    access = token_obj.get("accessToken") if _token_is_fresh(token_obj) else None
    if not isinstance(access, str) or not access:
        access = _get_access_token_interactive(auth, token_path)

    try:
        draws: List[Dict[str, Any]] = lotto_api.fetch_draws(access)
    except lotto_api.LottoAPIError as e:
        msg = str(e)
        if "401" in msg or "unauthorized" in msg.lower():
            print("Похоже, токен протух/невалиден. Получаем новый через OTP...")
            access = _get_access_token_interactive(auth, token_path)
            draws = lotto_api.fetch_draws(access)
        else:
            raise

    added = draw_history.append_new_draws_jsonl(history_path, draws)
    print(f"Добавлено новых тиражей в историю: {added} -> {history_path}")

    backfilled = draw_history.backfill_pais_ids_jsonl(history_path, draws)
    print(f"Обновлено paisId в существующей истории: {backfilled} -> {history_path}")

    return added


def recalculate_weights(
    history_path: str = "draw_history.jsonl",
    weights_path: str = "weights.json",
) -> Dict[str, Any]:
    """Recalculate weights from existing draw history.

    Returns the computed weights dict.
    Does NOT fetch from API - uses existing history file.
    """
    all_draws = draw_history.load_history(history_path)
    w = weights.compute_all_weights(all_draws)
    _save_json(weights_path, w)
    print(f"weights.json обновлён -> {weights_path}")
    return w


def update_history_and_weights(
    auth_path: str = "auth.json",
    token_path: str = "token.json",
    history_path: str = "draw_history.jsonl",
    weights_path: str = "weights.json",
) -> Dict[str, Any]:
    """Fetch latest draws, append only new ids, recompute weights on full history.

    Returns the computed weights dict.
    Wrapper that calls fetch_draws_from_api then recalculate_weights.
    """
    fetch_draws_from_api(auth_path, token_path, history_path)
    return recalculate_weights(history_path, weights_path)

if __name__ == "__main__":
    update_history_and_weights()