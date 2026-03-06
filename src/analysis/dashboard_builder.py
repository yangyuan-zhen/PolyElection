import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

PHRASE_TRANSLATIONS = {
    "Democratic Presidential Nominee": "民主党总统候选人",
    "Republican Presidential Nominee": "共和党总统候选人",
    "Presidential Election Winner": "总统选举获胜者",
    "Presidential Election": "总统选举",
    "Prime Minister": "总理",
    "House of Representatives": "众议院",
    "Chamber of Representatives": "众议院",
    "National Assembly": "国民议会",
    "Regional Election": "地区选举",
    "Parliamentary": "议会选举",
    "Parliament": "议会",
    "Legislative": "立法选举",
    "Senate": "参议院",
    "Mayoral": "市长选举",
    "Mayor": "市长选举",
    "Primary Winner": "初选获胜者",
    "Primary": "初选",
    "Winner": "获胜者",
    "Nominee": "候选人",
    "President": "总统",
}

PLACE_TRANSLATIONS = {
    "U.S.": "美国",
    "US": "美国",
    "United States": "美国",
    "Hungary": "匈牙利",
    "Colombia": "哥伦比亚",
    "Brazil": "巴西",
    "Texas": "德州",
    "Maine": "缅因州",
    "Nepal": "尼泊尔",
    "Slovenia": "斯洛文尼亚",
    "Castilla y Leon": "卡斯蒂利亚-莱昂",
    "Baden-Württemberg": "巴登-符腾堡",
    "Marseille": "马赛",
    "Santa Cruz de la Sierra": "圣克鲁斯",
    "Sucre": "苏克雷",
    "Rhineland-Palatinate": "莱茵兰-普法尔茨",
    "La Paz": "拉巴斯",
    "Cochabamba": "科恰班巴",
    "Quebec": "魁北克",
    "Taiwan": "台湾",
    "Japan": "日本",
    "Thailand": "泰国",
    "Portugal": "葡萄牙",
    "Aragon": "阿拉贡",
    "Vietnam": "越南",
    "South Korea": "韩国",
    "Kosovo": "科索沃",
    "Latvia": "拉脱维亚",
    "Russia": "俄罗斯",
}

OUTCOME_TRANSLATIONS = {
    "Yes": "是",
    "No": "否",
    "PCC": "哥伦比亚保守党（PCC）",
    "PH": "哥伦比亚历史协议（PH）",
    "CD": "民主中心（CD）",
    "PLC": "哥伦比亚自由党（PLC）",
    "PP": "人民党（PP）",
    "PSOE": "西班牙工人社会党（PSOE）",
    "VOX": "VOX",
    "LDP": "自民党（LDP）",
    "KMT": "中国国民党（KMT）",
    "DPP": "民主进步党（DPP）",
    "Tô Lâm": "苏林",
    "Lê Minh Hưng": "黎明兴",
}


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


def _replace_from_map(text: str, mapping: Dict[str, str]) -> str:
    translated = text
    for source, target in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
        translated = re.sub(re.escape(source), target, translated, flags=re.IGNORECASE)
    return translated


def _translate_place(text: str) -> str:
    return _replace_from_map(text.strip(), PLACE_TRANSLATIONS)


def _translate_outcome(text: str) -> str:
    stripped = text.strip()
    return OUTCOME_TRANSLATIONS.get(stripped, _replace_from_map(stripped, PLACE_TRANSLATIONS))


def _normalize_title(title: str) -> str:
    normalized = title.strip()
    patterns = [
        (
            r"^Democratic Presidential Nominee (\d{4})$",
            lambda m: f"{m.group(1)}年民主党总统候选人",
        ),
        (
            r"^Republican Presidential Nominee (\d{4})$",
            lambda m: f"{m.group(1)}年共和党总统候选人",
        ),
        (
            r"^Presidential Election Winner (\d{4})$",
            lambda m: f"{m.group(1)}年总统选举获胜者",
        ),
        (
            r"^Next Prime Minister of (.+)$",
            lambda m: f"{_translate_place(m.group(1))}下一任总理",
        ),
        (
            r"^(.+?) Republican Senate Primary Winner$",
            lambda m: f"{_translate_place(m.group(1))}共和党参议院初选获胜者",
        ),
        (
            r"^(.+?) Democratic Senate Primary Winner$",
            lambda m: f"{_translate_place(m.group(1))}民主党参议院初选获胜者",
        ),
        (
            r"^(.+?) Senate Election Winner$",
            lambda m: f"{_translate_place(m.group(1))}参议院选举获胜者",
        ),
        (
            r"^(.+?) Chamber of Representatives Election Winner$",
            lambda m: f"{_translate_place(m.group(1))}众议院选举获胜者",
        ),
        (
            r"^(.+?) Presidential Election$",
            lambda m: f"{_translate_place(m.group(1))}总统选举",
        ),
        (
            r"^(.+?) Prime Minister$",
            lambda m: f"{_translate_place(m.group(1))}总理",
        ),
        (
            r"^(.+?) Parliamentary$",
            lambda m: f"{_translate_place(m.group(1))}议会选举",
        ),
        (
            r"^(.+?) Legislative$",
            lambda m: f"{_translate_place(m.group(1))}立法选举",
        ),
        (
            r"^(.+?) Mayoral$",
            lambda m: f"{_translate_place(m.group(1))}市长选举",
        ),
        (
            r"^(.+?) Mayor$",
            lambda m: f"{_translate_place(m.group(1))}市长选举",
        ),
        (
            r"^(.+?) Regional Election$",
            lambda m: f"{_translate_place(m.group(1))}地区选举",
        ),
    ]

    for pattern, builder in patterns:
        match = re.match(pattern, normalized, flags=re.IGNORECASE)
        if match:
            return builder(match)

    normalized = _replace_from_map(normalized, PLACE_TRANSLATIONS)
    normalized = _replace_from_map(normalized, PHRASE_TRANSLATIONS)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _normalize_question(question: str, title_zh: str, outcome_zh: str) -> str:
    normalized = question.strip().rstrip("?")
    if not normalized:
        return f"该市场围绕“{title_zh}”展开。"

    patterns = [
        (
            r"^Will (.+?) win the most seats in the (\d{4}) (.+?) Senate$",
            lambda m: (
                f"该市场判断“{_translate_outcome(m.group(1))}”是否会在 "
                f"{m.group(2)}年{_translate_place(m.group(3))}参议院选举中赢得最多席位。"
            ),
        ),
        (
            r"^Will (.+?) win the most seats in the (\d{4}) (.+?) House of Representatives$",
            lambda m: (
                f"该市场判断“{_translate_outcome(m.group(1))}”是否会在 "
                f"{m.group(2)}年{_translate_place(m.group(3))}众议院选举中赢得最多席位。"
            ),
        ),
        (
            r"^Who will be the next prime minister of (.+)$",
            lambda m: f"该市场判断谁会成为{_translate_place(m.group(1))}下一任总理。",
        ),
        (
            r"^Who will win the (.+)$",
            lambda m: f"该市场关注谁将赢得{_normalize_title(m.group(1))}。",
        ),
        (
            r"^Will (.+?) win$",
            lambda m: f"该市场判断“{_translate_outcome(m.group(1))}”是否会获胜。",
        ),
        (
            r"^Will (.+?) visit China by (.+)$",
            lambda m: f"该市场判断“{_translate_outcome(m.group(1))}”是否会在{m.group(2)}前访问中国。",
        ),
    ]

    for pattern, builder in patterns:
        match = re.match(pattern, normalized, flags=re.IGNORECASE)
        if match:
            return builder(match)

    translated = _replace_from_map(normalized, PLACE_TRANSLATIONS)
    translated = _replace_from_map(translated, PHRASE_TRANSLATIONS)
    translated = _replace_from_map(translated, OUTCOME_TRANSLATIONS)
    translated = re.sub(r"\s+", " ", translated).strip()

    if translated == normalized:
        return f"该市场围绕“{title_zh}”展开，当前主导结果为“{outcome_zh}”。"
    return translated if translated.endswith("。") else f"{translated}。"


def _build_description(title_zh: str, question_zh: str, end_date: Optional[datetime]) -> str:
    if end_date is None:
        return f"{question_zh} 当前市场焦点为“{title_zh}”，结算时间待定。"
    end_label = end_date.astimezone(timezone.utc).strftime("%Y年%m月%d日 %H:%M UTC")
    return f"{question_zh} 该市场预计在 {end_label} 前后结算。"


def _pick_market_probability(market: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    valid_pairs = _extract_market_outcomes(market)
    if not valid_pairs:
        return None

    normalized_outcomes = [item["label"].strip().lower() for item in valid_pairs]
    if set(normalized_outcomes) == {"yes", "no"}:
        chosen = next(
            (pair for pair in valid_pairs if pair["label"].strip().lower() == "yes"),
            max(valid_pairs, key=lambda item: item["price"]),
        )
    else:
        chosen = max(valid_pairs, key=lambda item: item["price"])

    label = chosen["label"]
    price = chosen["price"]
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
        "label_zh": _translate_outcome(label),
        "price": price,
        "volume": volume,
        "liquidity": liquidity,
        "question": question,
        "market": market,
        "outcomes": valid_pairs,
    }


def _extract_market_outcomes(market: Dict[str, Any]) -> List[Dict[str, Any]]:
    outcomes = [str(item) for item in _coerce_list(market.get("outcomes"))]
    prices = [_coerce_float(item, default=-1.0) for item in _coerce_list(market.get("outcomePrices"))]

    pairs = [
        {
            "index": index,
            "label": outcomes[index] if index < len(outcomes) else f"Outcome {index + 1}",
            "label_zh": _translate_outcome(
                outcomes[index] if index < len(outcomes) else f"Outcome {index + 1}"
            ),
            "price": price,
        }
        for index, price in enumerate(prices)
        if price >= 0
    ]
    pairs.sort(key=lambda item: item["price"], reverse=True)
    return pairs


def _extract_binary_market_contender_label(market: Dict[str, Any]) -> str:
    text = str(market.get("groupItemTitle") or market.get("title") or market.get("question") or "").strip()
    if not text:
        return ""

    patterns = (
        r"^Will (.+?) win\b",
        r"^Will (.+?) be\b",
        r"^Will (.+?) visit\b",
        r"^Will (.+?) become\b",
        r"^Who will win the (.+)$",
    )
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return text if len(text) <= 80 else text[:80].strip()


def _infer_candidate_party_label(
    candidate_name: str,
    title: str,
    market: Optional[Dict[str, Any]] = None,
) -> str:
    source = " ".join(
        [
            title or "",
            str((market or {}).get("groupItemTitle") or ""),
            str((market or {}).get("question") or ""),
            candidate_name or "",
        ]
    ).lower()

    mapping = (
        ("republican", "共和党"),
        ("democratic", "民主党"),
        ("conservative", "保守派"),
        ("labour", "工党"),
        ("socialist", "社会党"),
        ("liberal", "自由派"),
        ("green", "绿党"),
        ("independent", "独立"),
        ("pcc", "保守党"),
        ("pp", "人民党"),
        ("psoe", "社工党"),
        ("vox", "VOX"),
        ("cd", "民主中心"),
        ("plc", "自由党"),
        ("ph", "历史协议"),
        ("kmt", "国民党"),
        ("dpp", "民进党"),
        ("ldp", "自民党"),
    )
    for token, label in mapping:
        if token in source:
            return label

    if "primary" in source and "senate" in source:
        return "党内初选"
    if "primary" in source:
        return "初选"
    if "president" in source:
        return "总统候选人"
    if "prime minister" in source:
        return "总理候选人"
    if "mayor" in source:
        return "市长候选人"
    if "parliament" in source or "assembly" in source:
        return "议会阵营"
    return "候选人"


def _build_candidate_board(
    markets: Iterable[Dict[str, Any]],
    primary_market: Optional[Dict[str, Any]],
    title: str,
) -> List[Dict[str, Any]]:
    if primary_market:
        primary_outcomes = _extract_market_outcomes(primary_market)
        normalized = {item["label"].strip().lower() for item in primary_outcomes}
        if primary_outcomes and normalized != {"yes", "no"}:
            return [
                {
                    "name": item["label"],
                    "name_zh": item["label_zh"],
                    "probability": round(item["price"] * 100, 1),
                    "party_label": _infer_candidate_party_label(
                        item["label"],
                        title,
                        primary_market,
                    ),
                    "image": primary_market.get("image")
                    or primary_market.get("icon")
                    or primary_market.get("twitterCardImage"),
                }
                for item in primary_outcomes[:8]
            ]

    contenders: List[Dict[str, Any]] = []
    for market in markets:
        market_outcomes = _extract_market_outcomes(market)
        normalized = {item["label"].strip().lower() for item in market_outcomes}
        if normalized != {"yes", "no"}:
            continue

        yes_outcome = next(
            (item for item in market_outcomes if item["label"].strip().lower() == "yes"),
            None,
        )
        contender_label = _extract_binary_market_contender_label(market)
        if yes_outcome is None or not contender_label:
            continue

        contenders.append(
            {
                "name": contender_label,
                "name_zh": _translate_outcome(contender_label),
                "probability": round(yes_outcome["price"] * 100, 1),
                "party_label": _infer_candidate_party_label(
                    contender_label,
                    title,
                    market,
                ),
                "image": market.get("image")
                or market.get("icon")
                or market.get("twitterCardImage"),
            }
        )

    deduped: Dict[str, Dict[str, Any]] = {}
    for contender in contenders:
        deduped[contender["name"].lower()] = contender

    ordered = sorted(
        deduped.values(),
        key=lambda item: item["probability"],
        reverse=True,
    )
    return ordered[:8]


def _select_focus_selection(
    selections: List[Dict[str, Any]],
    candidate_board: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if not selections:
        raise ValueError("selections must not be empty")

    default_primary = max(
        selections,
        key=lambda item: (
            item["volume"],
            item["liquidity"],
            item["price"],
        ),
    )
    if not candidate_board:
        return default_primary

    leader_name = str((candidate_board[0] or {}).get("name") or "").strip().lower()
    if not leader_name:
        return default_primary

    for selection in selections:
        market = selection.get("market") or {}
        outcomes = selection.get("outcomes") or []
        normalized_outcomes = {item["label"].strip().lower() for item in outcomes}
        if normalized_outcomes != {"yes", "no"}:
            continue
        contender = _extract_binary_market_contender_label(market).strip().lower()
        if contender and contender == leader_name:
            return selection

    for selection in selections:
        outcomes = selection.get("outcomes") or []
        top_label = str(selection.get("label") or "").strip().lower()
        if top_label == leader_name and len(outcomes) > 2:
            return selection

    return default_primary


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
    default_primary = max(
        selections,
        key=lambda item: (
            item["volume"],
            item["liquidity"],
            item["price"],
        ),
    )

    event_end = _parse_datetime(event.get("endDate") or event.get("end_date"))
    volume_24h = _coerce_float(
        event.get("volume24hr") or event.get("volume24Hr") or event.get("volume"),
    )
    liquidity = _coerce_float(event.get("liquidityNum") or event.get("liquidity"))
    title = event.get("title") or event.get("question") or "Untitled market"
    slug = event.get("slug") or ""

    title_zh = _normalize_title(title)
    candidate_board = _build_candidate_board(markets, default_primary.get("market"), title)
    primary = _select_focus_selection(selections, candidate_board)

    blended_probability = sum(item["price"] for item in selections) / len(selections)
    market_probability = primary["price"]
    divergence = blended_probability - market_probability
    comparison_candidate = ""
    primary_outcomes = primary.get("outcomes") or []
    primary_market = primary.get("market") or {}
    if {item["label"].strip().lower() for item in primary_outcomes} == {"yes", "no"}:
        comparison_candidate = _extract_binary_market_contender_label(primary_market)
    elif candidate_board:
        comparison_candidate = str((candidate_board[0] or {}).get("name") or "")

    outcome_label_zh = primary["label_zh"]
    market_question = primary["question"]
    market_question_zh = _normalize_question(market_question, title_zh, outcome_label_zh)
    description_zh = _build_description(title_zh, market_question_zh, event_end)

    return {
        "id": str(event.get("id") or slug or title),
        "slug": slug,
        "url": f"https://polymarket.com/event/{slug}" if slug else None,
        "title": title,
        "title_zh": title_zh,
        "description": event.get("description") or market_question or "",
        "description_zh": description_zh,
        "outcome_label": primary["label"],
        "outcome_label_zh": outcome_label_zh,
        "market_question": market_question,
        "market_question_zh": market_question_zh,
        "peb_prob": round(blended_probability * 100, 1),
        "market_blend_prob": round(blended_probability * 100, 1),
        "market_price": round(market_probability * 100, 1),
        "divergence": round(divergence * 100, 1),
        "peb_source": "market-blend",
        "poll_breakdown": [],
        "poll_source_count": 0,
        "has_markets": True,
        "market_count": len(selections),
        "candidate_board": candidate_board,
        "candidate_count": len(candidate_board),
        "comparison_candidate": comparison_candidate,
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
                f"{sorted_by_volume[0]['outcome_label_zh']} 当前领先，主市场概率 "
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
                f"融合概率 {sorted_by_divergence[0]['peb_prob']:.1f}%，"
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
                f"当前领先结果为 {earliest['outcome_label_zh']}，主市场概率 {earliest['market_price']:.1f}%。"
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

    sections = build_dashboard_sections(opportunities, now=now)
    return {
        "opportunities": opportunities,
        **sections,
        "source": "polymarket-gamma-api",
    }


def build_dashboard_sections(
    opportunities: List[Dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    pollster_names = {
        item.get("name")
        for opportunity in opportunities
        for item in (opportunity.get("poll_breakdown") or [])
        if isinstance(item, dict) and item.get("name")
    }
    stats = {
        "active_elections": len(opportunities),
        "poll_sources": len(pollster_names),
        "arbitrage_signals": sum(1 for item in opportunities if abs(item["divergence"]) >= 3.0),
        "last_updated": current.isoformat(),
    }
    return {
        "intelligence": _build_intelligence(opportunities, current),
        "stats": stats,
        "countdown": _build_countdown(opportunities, current),
    }
