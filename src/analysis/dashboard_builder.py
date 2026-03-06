import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
            return parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            return [item.strip() for item in stripped.split(",") if item.strip()]
    return [value]


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if not isinstance(value, str):
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_currency(value: float) -> str:
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"${value / 1_000:.1f}K"
    return f"${value:.0f}"


def _format_relative_time(target: Optional[datetime], now: datetime) -> str:
    if target is None:
        return "LIVE"

    delta_seconds = int((target - now).total_seconds())
    if delta_seconds <= 0:
        return "LIVE"

    days, remainder = divmod(delta_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)

    if days > 0:
        return f"{days}d"
    if hours > 0:
        return f"{hours}h"
    return f"{max(minutes, 1)}m"


def _pick_market_probability(market: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    outcomes = [str(item) for item in _coerce_list(market.get("outcomes"))]
    prices = [_coerce_float(item, default=-1.0) for item in _coerce_list(market.get("outcomePrices"))]

    valid_pairs = [
        (index, outcomes[index] if index < len(outcomes) else f"Outcome {index + 1}", price)
        for index, price in enumerate(prices)
        if price >= 0
    ]
    if not valid_pairs:
        return None

    normalized_outcomes = [label.strip().lower() for _, label, _ in valid_pairs]
    if set(normalized_outcomes) == {"yes", "no"}:
        for index, label, price in valid_pairs:
            if label.strip().lower() == "yes":
                chosen = (index, label, price)
                break
        else:
            chosen = max(valid_pairs, key=lambda item: item[2])
    else:
        chosen = max(valid_pairs, key=lambda item: item[2])

    _, label, price = chosen
    volume = _coerce_float(
        market.get("volume24hr")
        or market.get("volume24Hr")
        or market.get("volumeNum")
        or market.get("volume"),
    )
    liquidity = _coerce_float(market.get("liquidityNum") or market.get("liquidity"))
    question = market.get("question") or market.get("title") or market.get("description") or ""

    return {
        "label": label,
        "price": price,
        "volume": volume,
        "liquidity": liquidity,
        "question": question,
    }


def _iter_market_selections(markets: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    selections: List[Dict[str, Any]] = []
    for market in markets:
        selection = _pick_market_probability(market)
        if selection is not None:
            selections.append(selection)
    return selections


def _build_opportunity(event: Dict[str, Any], now: datetime) -> Optional[Dict[str, Any]]:
    markets = event.get("markets") or []
    selections = _iter_market_selections(markets)
    if not selections:
        return None

    primary = max(
        selections,
        key=lambda item: (
            item["volume"],
            item["liquidity"],
            item["price"],
        ),
    )
    blended_probability = sum(item["price"] for item in selections) / len(selections)
    market_probability = primary["price"]
    divergence = blended_probability - market_probability

    event_end = _parse_datetime(event.get("endDate") or event.get("end_date"))
    volume_24h = _coerce_float(
        event.get("volume24hr") or event.get("volume24Hr") or event.get("volume"),
    )
    liquidity = _coerce_float(event.get("liquidityNum") or event.get("liquidity"))
    title = event.get("title") or event.get("question") or "Untitled market"
    description = event.get("description") or primary["question"] or ""
    slug = event.get("slug") or ""

    return {
        "id": str(event.get("id") or slug or title),
        "slug": slug,
        "url": f"https://polymarket.com/event/{slug}" if slug else None,
        "title": title,
        "description": description,
        "outcome_label": primary["label"],
        "market_question": primary["question"],
        "peb_prob": round(blended_probability * 100, 1),
        "market_price": round(market_probability * 100, 1),
        "divergence": round(divergence * 100, 1),
        "has_markets": True,
        "market_count": len(selections),
        "volume_24h": round(volume_24h, 2),
        "volume_24h_label": _format_currency(volume_24h),
        "liquidity": round(liquidity, 2),
        "liquidity_label": _format_currency(liquidity),
        "end_date": event_end.isoformat() if event_end else None,
        "time_label": _format_relative_time(event_end, now),
    }


def _build_intelligence(opportunities: List[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    if not opportunities:
        return []

    sorted_by_volume = sorted(
        opportunities,
        key=lambda item: item["volume_24h"],
        reverse=True,
    )
    sorted_by_liquidity = sorted(
        opportunities,
        key=lambda item: item["liquidity"],
        reverse=True,
    )
    sorted_by_time = sorted(
        opportunities,
        key=lambda item: item["end_date"] or "9999-12-31T00:00:00+00:00",
    )
    sorted_by_divergence = sorted(
        opportunities,
        key=lambda item: abs(item["divergence"]),
        reverse=True,
    )

    feed = [
        {
            "tag": "24H VOLUME",
            "title": sorted_by_volume[0]["title"],
            "impact": (
                f"{sorted_by_volume[0]['outcome_label']} leads at "
                f"{sorted_by_volume[0]['market_price']:.1f}% with "
                f"{sorted_by_volume[0]['volume_24h_label']} 24h volume."
            ),
            "time": "LIVE",
        },
        {
            "tag": "LIQUIDITY",
            "title": sorted_by_liquidity[0]["title"],
            "impact": (
                f"{sorted_by_liquidity[0]['liquidity_label']} liquidity. "
                f"Primary outcome: {sorted_by_liquidity[0]['outcome_label']}."
            ),
            "time": "LIVE",
        },
        {
            "tag": "SPREAD",
            "title": sorted_by_divergence[0]["title"],
            "impact": (
                f"Blend {sorted_by_divergence[0]['peb_prob']:.1f}% vs "
                f"primary {sorted_by_divergence[0]['market_price']:.1f}%."
            ),
            "time": sorted_by_divergence[0]["time_label"],
        },
    ]

    earliest = sorted_by_time[0]
    earliest_end = _parse_datetime(earliest["end_date"])
    if earliest_end and earliest_end > now:
        feed[2] = {
            "tag": "CLOSING",
            "title": earliest["title"],
            "impact": (
                f"Ends {earliest_end.date().isoformat()}. "
                f"Leader: {earliest['outcome_label']} at {earliest['market_price']:.1f}%."
            ),
            "time": earliest["time_label"],
        }

    return feed


def _build_countdown(opportunities: List[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    upcoming: List[Dict[str, Any]] = []
    for item in opportunities:
        end_date = _parse_datetime(item.get("end_date"))
        if end_date is None or end_date <= now:
            continue
        days_left = max((end_date.date() - now.date()).days, 0)
        upcoming.append(
            {
                "title": item["title"],
                "days_left": days_left,
                "label": f"{days_left}d" if days_left > 0 else "Today",
            }
        )

    upcoming.sort(key=lambda entry: entry["days_left"])
    return upcoming[:4]


def build_dashboard_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    opportunities = [
        opportunity
        for opportunity in (_build_opportunity(event, now) for event in events)
        if opportunity is not None
    ]
    opportunities.sort(
        key=lambda item: (
            item["volume_24h"],
            item["liquidity"],
            item["market_price"],
        ),
        reverse=True,
    )

    total_markets = sum(item["market_count"] for item in opportunities)
    stats = {
        "active_elections": len(opportunities),
        "poll_sources": total_markets,
        "arbitrage_signals": sum(1 for item in opportunities if abs(item["divergence"]) >= 3.0),
        "last_updated": now.isoformat(),
    }

    return {
        "opportunities": opportunities,
        "intelligence": _build_intelligence(opportunities, now),
        "stats": stats,
        "countdown": _build_countdown(opportunities, now),
        "source": "polymarket-gamma-api",
    }
