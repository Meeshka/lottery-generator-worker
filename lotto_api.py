# lotto_api.py
# -*- coding: utf-8 -*-

from __future__ import annotations
import json
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional


API_BASE = "https://api.lottosheli.com/api/v1"


class LottoAPIError(RuntimeError):
    pass


def _http_json(
    method: str,
    url: str,
    headers: Dict[str, str],
    body_obj: Optional[Dict[str, Any]] = None,
    timeout: int = 20,
) -> Any:
    data = None
    if body_obj is not None:
        data = json.dumps(body_obj).encode("utf-8")
        headers = dict(headers)
        headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url=url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8", errors="replace")
        except Exception:
            msg = str(e)
        raise LottoAPIError(f"HTTP {e.code} {e.reason}: {msg}")
    except urllib.error.URLError as e:
        raise LottoAPIError(f"URL error: {e}")
    except json.JSONDecodeError as e:
        raise LottoAPIError(f"JSON decode error: {e}")


def generate_otp(id_number: str, phone_number: str) -> None:
    """
    POST /client/otp/generate
    Возвращает 200 и отправляет код на телефон.
    """
    url = f"{API_BASE}/client/otp/generate"
    headers = {
        "Accept": "application/json",
        "User-Agent": "lotto-script/1.0",
        "Origin": "https://lottosheli.com",
        "Referer": "https://lottosheli.com/",
    }
    _http_json(
        method="POST",
        url=url,
        headers=headers,
        body_obj={"idNumber": id_number, "phoneNumber": phone_number},
    )


def validate_otp(id_number: str, phone_number: str, otp_code: str) -> Dict[str, str]:
    """
    POST /client/otp/validate
    Возвращает {"accessToken": "...", "refreshToken": "..."}.
    """
    url = f"{API_BASE}/client/otp/validate"
    headers = {
        "Accept": "application/json",
        "User-Agent": "lotto-script/1.0",
        "Origin": "https://lottosheli.com",
        "Referer": "https://lottosheli.com/",
    }
    res = _http_json(
        method="POST",
        url=url,
        headers=headers,
        body_obj={
            "idNumber": id_number,
            "phoneNumber": phone_number,
            "otpCode": otp_code,
        },
    )
    if not isinstance(res, dict) or "accessToken" not in res:
        raise LottoAPIError(f"Unexpected validate response: {res}")
    return {"accessToken": res["accessToken"], "refreshToken": res.get("refreshToken", "")}


def fetch_draws(access_token: str, include_tables: bool = True) -> List[Dict[str, Any]]:
    """
    GET /client/draws/DRAW_LOTTO?type=null

    Normalized output (per draw):
      {
        "id": int,
        "endsAt": str,
        "numbers": [int*6],
        "strong": int,
        "winningTables": { "regular": {...}, "double": {...}, "extra": {...} }   # optional
        "source": "api.lottosheli.com",
        "fetchedAt": int_epoch
      }
    """
    url = f"{API_BASE}/client/draws/DRAW_LOTTO?type=null"
    headers = {
        "Accept": "application/json",
        "User-Agent": "lotto-script/1.0",
        "Authorization": f"otp {access_token}",  # именно так у тебя работает
        "Origin": "https://lottosheli.com",
        "Referer": "https://lottosheli.com/",
    }
    res = _http_json(method="GET", url=url, headers=headers, body_obj=None)
    if not isinstance(res, list):
        raise LottoAPIError(f"Unexpected draws response type: {type(res)}")

    out: List[Dict[str, Any]] = []
    now = int(time.time())
    for item in res:
        if not isinstance(item, dict):
            continue
        draw_id = item.get("id")
        pais_id = item.get("paisId")
        ends_at = item.get("endsAt")
        results = item.get("results") or {}
        numbers = results.get("numbers")
        strong = results.get("strongNumber")

        if not isinstance(draw_id, int):
            continue
        if not (isinstance(numbers, list) and len(numbers) == 6 and all(isinstance(x, int) for x in numbers)):
            continue
        if not isinstance(strong, int):
            continue
        if pais_id is not None and not isinstance(pais_id, int):
            continue

        norm: Dict[str, Any] = {
            "id": draw_id,
            "paisId": pais_id,
            "endsAt": ends_at,
            "numbers": numbers,
            "strong": strong,
            "source": "api.lottosheli.com",
            "fetchedAt": now,
        }

        if include_tables:
            wt = results.get("winningTables")
            if isinstance(wt, dict):
                # Keep only what we need. Still store as-is for flexibility.
                norm["winningTables"] = wt

        out.append(norm)

    # sort newest first
    out.sort(key=lambda d: (d.get("endsAt") or "", d["id"]), reverse=True)
    return out


def get_open_lottosheli_draw() -> dict:
    """
    Fetches the next lottery draw information from pais.co.il.
    
    Returns:
        dict: Dictionary containing draw information with keys:
            - nextLottoryDate: str
            - displayDate: str
            - displayTime: str
            - firstPrize: int
            - secondPrize: int
            - LotteryNumber: int
    """
    url = "https://www.pais.co.il/include/getNextLotteryDate.ashx?type=1"
    headers = {
        "Accept": "application/json",
        "User-Agent": "lotto-script/1.0",
    }
    
    req = urllib.request.Request(url=url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                raise LottoAPIError("Empty response from pais.co.il")
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8", errors="replace")
        except Exception:
            msg = str(e)
        raise LottoAPIError(f"HTTP {e.code} {e.reason}: {msg}")
    except urllib.error.URLError as e:
        raise LottoAPIError(f"URL error: {e}")
    except json.JSONDecodeError as e:
        raise LottoAPIError(f"JSON decode error: {e}")
    
    if not isinstance(data, list) or len(data) == 0:
        raise LottoAPIError(f"Unexpected response format: {data}")
    
    return data[0]
