#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, List, Optional, Tuple

import lottery_generator as lg
import lotto_api
import lotto_update
import validate_updated as validator


DEFAULT_BASE_URL = "https://lottery-generator-worker.ushakov-ma.workers.dev"

def get_latest_generated_batch(base_url: str, admin_key: str) -> Dict[str, Any]:
    return http_json(
        "GET",
        f"{base_url}/admin/batches/latest-generated",
        admin_key=admin_key,
    )


def resolve_batch_id(
    explicit_batch_id: Optional[int],
    base_url: str,
    admin_key: str,
) -> int:
    if explicit_batch_id is not None:
        return explicit_batch_id

    payload = get_latest_generated_batch(base_url, admin_key)
    batch = payload.get("batch") if isinstance(payload, dict) else None
    batch_id = batch.get("id") if isinstance(batch, dict) else None

    if isinstance(batch_id, int):
        return batch_id

    raise RuntimeError("No generated batch found in Worker")


def http_json(
    method: str,
    url: str,
    admin_key: Optional[str] = None,
    body_obj: Optional[Any] = None,
    timeout: int = 60,
) -> Any:
    headers: Dict[str, str] = {
        "Accept": "application/json",
        "User-Agent": "lotto-bridge/1.0",
    }
    data = None

    if admin_key:
        headers["x-admin-key"] = admin_key

    if body_obj is not None:
        data = json.dumps(body_obj).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code} {e.reason} for {url}\n{body}")


def write_tickets_csv(path: str, tickets: List[Dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["n1", "n2", "n3", "n4", "n5", "n6", "ctrl"])
        for t in tickets:
            nums = list(t["numbers"])
            strong = t.get("strong")
            writer.writerow(nums + [strong if strong is not None else ""])


def sync_local_data(
    auth_path: str,
    token_path: str,
    history_path: str,
    weights_path: str,
) -> None:
    lotto_update.update_history_and_weights(
        auth_path=auth_path,
        token_path=token_path,
        history_path=history_path,
        weights_path=weights_path,
    )
    print(f"Updated local history: {history_path}")
    print(f"Updated local weights: {weights_path}")


def get_current_weights_version(base_url: str) -> Optional[str]:
    row = http_json("GET", f"{base_url}/weights/current")
    if isinstance(row, dict):
        return row.get("version_key")
    return None


def get_latest_batch_summary(base_url: str) -> Any:
    return http_json("GET", f"{base_url}/batches/latest/summary")


def get_batch_summary(base_url: str, batch_id: int) -> Any:
    return http_json("GET", f"{base_url}/batches/{batch_id}/summary")


def fetch_batch_tickets(base_url: str, batch_id: int) -> Dict[str, Any]:
    return http_json("GET", f"{base_url}/batches/{batch_id}/tickets")


def create_batch_in_worker(
    base_url: str,
    admin_key: str,
    batch_key: str,
    generator_version: str,
    weights_version_key: Optional[str],
    tickets: List[Dict[str, Any]],
    target_draw_id: Optional[str] = None,
    target_pais_id: Optional[int] = None,
    target_draw_at: Optional[str] = None,
    target_draw_snapshot_json: Optional[str] = None,
) -> Dict[str, Any]:
    body = {
        "batchKey": batch_key,
        "generatorVersion": generator_version,
        "weightsVersionKey": weights_version_key,
        "tickets": tickets,
    }
    if target_draw_id is not None:
        body["targetDrawId"] = target_draw_id
    if target_pais_id is not None:
        body["targetPaisId"] = target_pais_id
    if target_draw_at is not None:
        body["targetDrawAt"] = target_draw_at
    if target_draw_snapshot_json is not None:
        body["targetDrawSnapshotJson"] = target_draw_snapshot_json
    return http_json(
        "POST",
        f"{base_url}/admin/batches/create",
        admin_key=admin_key,
        body_obj=body,
    )


def import_batch_results(
    base_url: str,
    admin_key: str,
    batch_id: int,
    draw_id: str,
    prize_table: str,
    results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    body = {
        "drawId": draw_id,
        "prizeTable": prize_table,
        "results": results,
    }
    return http_json(
        "POST",
        f"{base_url}/admin/batches/{batch_id}/results/import",
        admin_key=admin_key,
        body_obj=body,
    )


def generate_python_tickets(
    count: int,
    max_common: int,
    seed: Optional[str],
    weights_path: str,
    history_path: Optional[str],
    cluster_target: Optional[int],
) -> List[Dict[str, Any]]:
    lg.load_dynamic_weights(weights_path)

    rng = lg.random.Random(seed) if seed is not None else lg.random.Random()

    history_tickets: List[Tuple[int, ...]] = []
    if history_path and os.path.exists(history_path):
        history_tickets = lg.load_history(history_path)

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

    results: List[Dict[str, Any]] = []
    seen_final = set()
    final_nums_only: List[Tuple[int, ...]] = []
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

        results.append(
            {
                "ticketIndex": i + 1,
                "numbers": list(nums),
                "strong": ctrl,
            }
        )

    return results


def generate_and_upload(
    base_url: str,
    admin_key: str,
    batch_key: str,
    count: int,
    max_common: int,
    seed: Optional[str],
    weights_path: str,
    history_path: Optional[str],
    cluster_target: Optional[int],
    generator_version: str,
) -> Dict[str, Any]:
    open_draw = lotto_api.get_open_lottosheli_draw()
    target_draw_id = None
    target_pais_id = open_draw.get("LotteryNumber")
    target_draw_at = open_draw.get("nextLottoryDate")
    target_draw_snapshot_json = json.dumps(open_draw)
    
    weights_version_key = get_current_weights_version(base_url)
    tickets = generate_python_tickets(
        count=count,
        max_common=max_common,
        seed=seed,
        weights_path=weights_path,
        history_path=history_path,
        cluster_target=cluster_target,
    )
    return create_batch_in_worker(
        base_url=base_url,
        admin_key=admin_key,
        batch_key=batch_key,
        generator_version=generator_version,
        weights_version_key=weights_version_key,
        tickets=tickets,
        target_draw_id=target_draw_id,
        target_pais_id=target_pais_id,
        target_draw_at=target_draw_at,
        target_draw_snapshot_json=target_draw_snapshot_json,
    )


def resolve_batch_key(batch_key: Optional[str]) -> str:
    if batch_key and batch_key.strip():
        return batch_key.strip()

    generated = str(uuid.uuid4())
    print(f"Generated batch key: {generated}")
    return generated


def check_batch_against_latest_draw(
    base_url: str,
    admin_key: str,
    batch_id: int,
    draw_history_path: str,
    prize_table: str = "regular",
) -> Dict[str, Any]:
    batch_payload = fetch_batch_tickets(base_url, batch_id)
    if not isinstance(batch_payload, dict) or "tickets" not in batch_payload:
        raise RuntimeError(f"Unexpected batch tickets response: {batch_payload}")

    tickets_rows = batch_payload["tickets"]
    row_to_ticket_index = {
        csv_row_number: int(row["ticket_index"])
        for csv_row_number, row in enumerate(tickets_rows, start=2)
    }
    latest_draw = validator._load_latest_draw_from_jsonl(draw_history_path)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8", newline=""
    ) as tmp:
        tmp_path = tmp.name

    try:
        normalized_tickets = []
        for row in tickets_rows:
            normalized_tickets.append(
                {
                    "numbers": json.loads(row["numbers_json"]),
                    "strong": row.get("strong_number"),
                }
            )

        write_tickets_csv(tmp_path, normalized_tickets)

        summary = validator.check_tickets_against_latest_draw(
            tickets_csv_path=tmp_path,
            draw_history_path=draw_history_path,
            print_report=True,
            prize_table=prize_table,
        )

        details = summary.get("details", [])
        results_payload = []
        for item in details:
            if "error" in item:
                continue
            ticket_index = row_to_ticket_index.get(item["row"])
            if ticket_index is None:
                raise RuntimeError(
                    f"Could not map validator row {item['row']} to a batch ticket index"
                )
            results_payload.append(
                {
                    "ticketIndex": ticket_index,
                    "matchCount": item["match_count"],
                    "matchedNumbers": item["matched_numbers"],
                    "strongMatch": item["strong_match"],
                    "qualifies3Plus": item["qualifies_3plus"],
                    "prize": item.get("prize"),
                    "prizeTable": prize_table,
                }
            )

        try:
            res = import_batch_results(
                base_url=base_url,
                admin_key=admin_key,
                batch_id=batch_id,
                draw_id=str(latest_draw["id"]),
                prize_table=prize_table,
                results=results_payload,
            )
            worker_import = res
        except RuntimeError as e:
            if "does not match latest draw" in str(e):
                print(f"WARNING: Draw sync mismatch - {e}", file=sys.stderr)
                worker_import = {"error": "draw_sync_mismatch", "message": str(e)}
            else:
                raise

        return {
            "validation_summary": summary,
            "worker_import": worker_import,
        }
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def print_json(obj: Any) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def require_admin_key(value: Optional[str]) -> str:
    if not value:
        raise RuntimeError("ADMIN key is required. Pass --admin-key or set WORKER_ADMIN_KEY.")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Bridge between Python lottery engine and Cloudflare Worker")
    parser.add_argument("--base-url", default=os.getenv("WORKER_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--admin-key", default=os.getenv("WORKER_ADMIN_KEY"))

    sub = parser.add_subparsers(dest="command", required=True)

    p_sync = sub.add_parser("sync")
    p_sync.add_argument("--auth-path", default="auth.json")
    p_sync.add_argument("--token-path", default="token.json")
    p_sync.add_argument("--history-path", default="draw_history.jsonl")
    p_sync.add_argument("--weights-path", default="weights.json")

    p_gen = sub.add_parser("generate")
    p_gen.add_argument("--count", type=int, default=10)
    p_gen.add_argument("--max-common", type=int, default=3)
    p_gen.add_argument("--seed", default=None)
    p_gen.add_argument("--weights-path", default="weights.json")
    p_gen.add_argument("--history-path", default="tickets.csv")
    p_gen.add_argument("--cluster-target", type=int, choices=[1, 2, 3, 4], default=None)
    p_gen.add_argument("--batch-key", default=None)
    p_gen.add_argument("--generator-version", default="python-v1")

    p_check = sub.add_parser("check")
    p_check.add_argument("--batch-id", type=int, default=None)
    p_check.add_argument("--draw-history-path", default="draw_history.jsonl")
    p_check.add_argument("--prize-table", default="regular")

    p_summary = sub.add_parser("summary")
    p_summary.add_argument("--batch-id", type=int, default=None)

    p_full = sub.add_parser("full-cycle")
    p_full.add_argument("--count", type=int, default=10)
    p_full.add_argument("--max-common", type=int, default=3)
    p_full.add_argument("--seed", default=None)
    p_full.add_argument("--weights-path", default="weights.json")
    p_full.add_argument("--history-path", default="tickets.csv")
    p_full.add_argument("--draw-history-path", default="draw_history.jsonl")
    p_full.add_argument("--cluster-target", type=int, choices=[1, 2, 3, 4], default=None)
    p_full.add_argument("--batch-key", default=None)
    p_full.add_argument("--generator-version", default="python-v1")
    p_full.add_argument("--prize-table", default="regular")

    args = parser.parse_args()

    try:
        if args.command == "sync":
            sync_local_data(
                auth_path=args.auth_path,
                token_path=args.token_path,
                history_path=args.history_path,
                weights_path=args.weights_path,
            )
            return

        if args.command == "generate":
            admin_key = require_admin_key(args.admin_key)
            batch_key = resolve_batch_key(args.batch_key)
            res = generate_and_upload(
                base_url=args.base_url,
                admin_key=admin_key,
                batch_key=batch_key,
                count=args.count,
                max_common=args.max_common,
                seed=args.seed,
                weights_path=args.weights_path,
                history_path=args.history_path,
                cluster_target=args.cluster_target,
                generator_version=args.generator_version,
            )
            print_json(res)
            return

        if args.command == "check":
            admin_key = require_admin_key(args.admin_key)
            batch_id = resolve_batch_id(args.batch_id, args.base_url, admin_key)
            res = check_batch_against_latest_draw(
                base_url=args.base_url,
                admin_key=admin_key,
                batch_id=batch_id,
                draw_history_path=args.draw_history_path,
                prize_table=args.prize_table,
            )
            print_json(res)
            return
        
        if args.command == "summary":
            if args.batch_id is None:
                res = get_latest_batch_summary(args.base_url)
            else:
                res = get_batch_summary(args.base_url, args.batch_id)
            print_json(res)
            return

        if args.command == "full-cycle":
            admin_key = require_admin_key(args.admin_key)
            batch_key = resolve_batch_key(args.batch_key)
            created = generate_and_upload(
                base_url=args.base_url,
                admin_key=admin_key,
                batch_key=batch_key,
                count=args.count,
                max_common=args.max_common,
                seed=args.seed,
                weights_path=args.weights_path,
                history_path=args.history_path,
                cluster_target=args.cluster_target,
                generator_version=args.generator_version,
            )

            batch = created.get("batch") or {}
            batch_id = batch.get("id")
            if not isinstance(batch_id, int):
                raise RuntimeError(f"Could not determine batch id from create response: {created}")

            checked = check_batch_against_latest_draw(
                base_url=args.base_url,
                admin_key=admin_key,
                batch_id=batch_id,
                draw_history_path=args.draw_history_path,
                prize_table=args.prize_table,
            )

            summary = get_batch_summary(args.base_url, batch_id)

            print_json(
                {
                    "created": created,
                    "checked": checked,
                    "summary": summary,
                }
            )
            return

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
