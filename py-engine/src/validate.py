import csv
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any


def _parse_iso_dt(s: str) -> Optional[datetime]:
    """
    Parses ISO8601 like '2026-01-29T20:45:00.000Z' into datetime (UTC-naive).
    Returns None if parse fails.
    """
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    try:
        # Handle trailing Z (UTC)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _load_latest_draw_from_jsonl(draw_history_path: str) -> Dict[str, Any]:
    """
    Reads draw_history.jsonl and returns the latest draw record.
    Latest is decided by endsAt if present/parsable, otherwise by max id.

    Minimum expected fields: id (int), numbers (list[int]), strong (int), endsAt (str optional).
    Optional fields (if you store them): winningTables, firstPrize, etc.
    """
    if not os.path.exists(draw_history_path):
        raise FileNotFoundError(f"draw history not found: {draw_history_path}")

    best: Optional[Dict[str, Any]] = None
    best_dt: Optional[datetime] = None
    best_id: int = -1

    with open(draw_history_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue

            if not isinstance(obj, dict):
                continue

            draw_id = obj.get("id")
            nums = obj.get("numbers")
            if not isinstance(draw_id, int):
                continue
            if not (isinstance(nums, list) and len(nums) == 6 and all(isinstance(x, int) for x in nums)):
                continue

            dt = _parse_iso_dt(obj.get("endsAt")) if "endsAt" in obj else None

            if best is None:
                best = obj
                best_dt = dt
                best_id = draw_id
                continue

            # Prefer endsAt if both have it
            if dt is not None and best_dt is not None:
                if dt > best_dt:
                    best, best_dt, best_id = obj, dt, draw_id
                continue

            # If only one has endsAt, prefer the one with endsAt
            if dt is not None and best_dt is None:
                best, best_dt, best_id = obj, dt, draw_id
                continue

            # Same draw? prefer the one that contains winningTables (if your history stores it)
            if draw_id == best_id and dt == best_dt:
                if isinstance(obj.get("winningTables"), dict) and not isinstance(best.get("winningTables"), dict):
                    best, best_dt, best_id = obj, dt, draw_id
                continue

            # Fallback: max id
            if draw_id > best_id:
                best, best_dt, best_id = obj, dt, draw_id

    if best is None:
        raise RuntimeError(f"No valid draws found in {draw_history_path}")

    best["numbers"] = sorted(best["numbers"])
    return best


def _parse_ticket_row(row: List[str]) -> Optional[Tuple[Tuple[int, ...], Optional[int]]]:
    """
    Parses a CSV row into (numbers_tuple_sorted, control_optional).
    Returns None for header/empty lines.

    Accepts formats:
      - 6 columns: n1..n6
      - 7 columns: n1..n6, control
      - 1 column containing '1,2,3,4,5,6,7' (rare, but supported)
    """
    if not row or all(str(c).strip() == "" for c in row):
        return None

    # Skip header if present
    first = str(row[0]).strip().lower()
    if first in ("n1", "num1", "a", "number1"):
        return None

    # Flatten "single cell with commas"
    if len(row) == 1 and isinstance(row[0], str) and "," in row[0]:
        row = [c.strip() for c in row[0].split(",") if c.strip()]

    vals: List[int] = []
    for cell in row:
        cell = str(cell).strip()
        if cell == "":
            continue
        vals.append(int(cell))

    if len(vals) < 6:
        raise ValueError(f"Ticket row has <6 numbers: {row}")

    nums = vals[:6]
    control = vals[6] if len(vals) >= 7 else None

    if any(n < 1 or n > 37 for n in nums):
        raise ValueError(f"Ticket numbers out of range 1..37: {nums}")
    if len(set(nums)) != 6:
        raise ValueError(f"Ticket has duplicates: {nums}")

    return tuple(sorted(nums)), control


def calc_lottosheli_prize(latest_draw: Dict[str, Any], match_count: int, strong_match: Optional[bool],
                          table: str = "regular") -> Optional[int]:
    """
    Returns the prize amount for Lotto Sheli for a given ticket result.
    - match_count: number of matched main numbers (0..6)
    - strong_match: True/False/None (None if ticket has no ctrl)
    - table: "regular" / "double" / "extra"

    IMPORTANT:
      This requires that draw_history stores winning tables, e.g.:
        latest_draw["winningTables"]["regular"] == {"G3":10, "G4":48, ... "Strong3":35, ...}
      If tables are missing -> returns None.
    """
    if match_count < 3:
        return 0

    wt_all = latest_draw.get("winningTables")
    if not isinstance(wt_all, dict):
        return None

    wt = wt_all.get(table)
    if not isinstance(wt, dict):
        return None

    if strong_match is True:
        key = f"Strong{match_count}"
    else:
        key = f"G{match_count}"

    prize = wt.get(key)
    if prize is None:
        return None
    try:
        return int(prize)
    except Exception:
        return None


def check_tickets_against_latest_draw(
    tickets_csv_path: str = "tickets.csv",
    draw_history_path: str = "draw_history.jsonl",
    print_report: bool = True,
    prize_table: str = "regular",
) -> Dict[str, Any]:
    """
    Reads tickets.csv and compares each ticket to the latest draw in draw_history.jsonl.

    Adds:
      - prize: computed for match_count >= 3 (requires winningTables in draw_history)
      - total_prize: sum of prize across all tickets (only if prize is available)
    """
    latest = _load_latest_draw_from_jsonl(draw_history_path)
    draw_nums = set(latest["numbers"])
    draw_strong = latest.get("strong")
    draw_id = latest.get("id")
    draw_ends_at = latest.get("endsAt")

    results: List[Dict[str, Any]] = []
    total = 0
    bad_rows = 0
    three_plus = 0
    total_prize = 0
    prize_available = False

    with open(tickets_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        for idx, row in enumerate(reader, start=1):
            parsed = _parse_ticket_row(row)
            if parsed is None:
                continue

            total += 1
            try:
                nums, control = parsed
                match_set = set(nums) & draw_nums
                match_count = len(match_set)

                strong_match = None
                if control is not None and isinstance(draw_strong, int):
                    strong_match = (control == draw_strong)

                qualifies = match_count >= 3
                if qualifies:
                    three_plus += 1

                prize = None
                if qualifies:
                    prize = calc_lottosheli_prize(latest, match_count, strong_match, table=prize_table)
                    if isinstance(prize, int):
                        prize_available = True
                        total_prize += prize

                results.append(
                    {
                        "row": idx,
                        "ticket_numbers": list(nums),
                        "ticket_control": control,
                        "match_count": match_count,
                        "matched_numbers": sorted(match_set),
                        "strong_match": strong_match,
                        "qualifies_3plus": qualifies,
                        "prize": prize,
                    }
                )
            except Exception as e:
                bad_rows += 1
                results.append(
                    {
                        "row": idx,
                        "error": str(e),
                        "raw": row,
                    }
                )

    summary = {
        "draw": {
            "id": draw_id,
            "endsAt": draw_ends_at,
            "numbers": sorted(list(draw_nums)),
            "strong": draw_strong,
        },
        "tickets_total_rows": total,
        "tickets_parsed_ok": total - bad_rows,
        "tickets_bad_rows": bad_rows,
        "tickets_with_3plus": three_plus,
        "details": results,
    }

    if prize_available:
        summary["total_prize"] = total_prize
        summary["prize_table"] = prize_table

    if print_report:
        print(f"Latest draw: id={draw_id}, endsAt={draw_ends_at}")
        print("Numbers:", " ".join(f"{n:>2}" for n in sorted(draw_nums)), f"; strong={draw_strong}")
        print(f"Tickets: total={total}, ok={total - bad_rows}, bad={bad_rows}, >=3 matches={three_plus}")
        if prize_available:
            print(f"Total prize ({prize_table}): {total_prize}")
        else:
            print("Prize: not computed (winningTables not found in draw_history).")
        print("-" * 60)

        for r in results:
            if "error" in r:
                print(f"Row {r['row']:>3}: ERROR: {r['error']} | raw={r.get('raw')}")
                continue

            nums = r["ticket_numbers"]
            mc = r["match_count"]
            matched = r["matched_numbers"]
            ctrl = r["ticket_control"]
            sm = r["strong_match"]
            prize = r.get("prize")

            extra = ""
            if ctrl is not None:
                extra = f" | control={ctrl} strong_match={sm}"

            prize_txt = ""
            if mc >= 3:
                prize_txt = f" | prize={prize}" if prize is not None else " | prize=?"

            flag = "  ✅" if r["qualifies_3plus"] else ""
            print(
                f"Row {r['row']:>3}: "
                f"{' '.join(f'{n:>2}' for n in nums)} -> matches={mc} ({matched}){extra}{prize_txt}{flag}"
            )

    return summary


if __name__ == "__main__":
    check_tickets_against_latest_draw()
