import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

TRANSLATION_REPLACEMENTS = [
    ("Democratic Presidential Nominee", "民主党总统候选人"),
    ("Republican Presidential Nominee", "共和党总统候选人"),
    ("Presidential Election Winner", "总统选举获胜者"),
    ("House of Representatives", "众议院"),
    ("Chamber of Representatives", "众议院"),
    ("Prime Minister", "总理"),
    ("Presidential", "总统"),
    ("President", "总统"),
    ("Election", "选举"),
    ("Winner", "获胜者"),
    ("Nominee", "候选人"),
    ("Senate", "参议院"),
    ("Parliamentary", "议会"),
    ("Parliament", "议会"),
    ("Legislative", "立法机构"),
    ("Primary", "初选"),
    ("Governor", "州长"),
    ("Mayor", "市长"),
    ("Minister", "部长"),
    ("Democratic", "民主党"),
    ("Republican", "共和党"),
    ("Colombia", "哥伦比亚"),
    ("Hungary", "匈牙利"),
    ("Brazil", "巴西"),
    ("Texas", "得州"),
    ("Nepal", "尼泊尔"),
    ("Slovenia", "斯洛文尼亚"),
    ("Castilla y Leon", "卡斯蒂利亚-莱昂"),
    ("Baden-Württemberg", "巴登-符腾堡"),
    ("Marseille", "马赛"),
    ("Santa Cruz de la Sierra", "圣克鲁斯"),
    ("Sucre", "苏克雷"),
    ("Rhineland-Palatinate", "莱茵兰-普法尔茨"),
    ("Will Trump visit China", "特朗普会访问中国"),
    ("Yes", "是"),
    ("No", "否"),
]


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


def _format_relative_time_zh(target: Optional[datetime], now: datetime) -> str:
    if target is None:
        return "实时"

    delta_seconds = int((target - now).total_seconds())
    if delta_seconds <= 0:
        return "实时"

    days, remainder = divmod(delta_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)

    if days > 0:
        return f"{days}天"
    if hours > 0:
        return f"{hours}小时"
    return f"{max(minutes, 1)}分钟"


def _translate_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    translated = text
    for source, target in TRANSLATION_REPLACEMENTS:
        translated = re.sub(source, target, translated, flags=re.IGNORECASE)

    translated = translated.replace("will resolve to", "将按以下结果结算")
    translated = translated.replace("This market", "该市场")
    translated = translated.replace("market", "市场")
    translated = translated.replace("scheduled to take place on", "预计举行日期为")
    translated = translated.replace("takes place on", "举行日期为")
    translated = translated.replace(" if required", "（如需要）")
    translated = re.sub(r"\s+", " ", translated).strip()
    return translated


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
        chosen = next(
            (pair for pair in valid_pairs if pair[1].strip().lower() == "yes"),
            max(valid_pairs, key=lambda item: item[2]),
        )
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
        "label_zh": _translate_text(label) or label,
        "price": price,
        "volume": volume,
        "liquidity": liquidity,
        "question": question,
        "question_zh": _translate_text(question) or question,
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
        "title_zh": _translate_text(title) or title,
        "description": description,
        "description_zh": _translate_text(description) or description,
        "outcome_label": primary["label"],
        "outcome_label_zh": primary["label_zh"],
        "market_question": primary["question"],
        "market_question_zh": primary["question_zh"],
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
        "time_label_zh": _format_relative_time_zh(event_end, now),
    }


def _build_intelligence(opportunities: List[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    if not opportunities:
        return []

    sorted_by_volume = sorted(opportunities, key=lambda item: item["volume_24h"], reverse=True)
    sorted_by_liquidity = sorted(opportunities, key=lambda item: item["liquidity"], reverse=True)
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
            "tag": "24小时成交额",
            "title": sorted_by_volume[0]["title_zh"],
            "impact": (
                f"{sorted_by_volume[0]['outcome_label_zh']} 当前领先，主市场价格 "
                f"{sorted_by_volume[0]['market_price']:.1f}%，24小时成交额 "
                f"{sorted_by_volume[0]['volume_24h_label']}。"
            ),
            "time": "实时",
        },
        {
            "tag": "流动性",
            "title": sorted_by_liquidity[0]["title_zh"],
            "impact": (
                f"流动性达到 {sorted_by_liquidity[0]['liquidity_label']}，"
                f"当前主导结果为 {sorted_by_liquidity[0]['outcome_label_zh']}。"
            ),
            "time": "实时",
        },
        {
            "tag": "价差",
            "title": sorted_by_divergence[0]["title_zh"],
            "impact": (
                f"融合概率 {sorted_by_divergence[0]['peb_prob']:.1f}% ，"
                f"主市场概率 {sorted_by_divergence[0]['market_price']:.1f}%。"
            ),
            "time": sorted_by_divergence[0]["time_label_zh"],
        },
    ]

    earliest = sorted_by_time[0]
    earliest_end = _parse_datetime(earliest["end_date"])
    if earliest_end and earliest_end > now:
        feed[2] = {
            "tag": "临近结算",
            "title": earliest["title_zh"],
            "impact": (
                f"预计在 {earliest_end.date().isoformat()} 结算，"
                f"当前领先结果为 {earliest['outcome_label_zh']}，概率 {earliest['market_price']:.1f}%。"
            ),
            "time": earliest["time_label_zh"],
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
                "title_zh": item["title_zh"],
                "days_left": days_left,
                "label": f"{days_left}天" if days_left > 0 else "今天",
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
