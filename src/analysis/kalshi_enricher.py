import re
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Set


STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "will",
    "next",
    "most",
    "seats",
    "winner",
    "election",
    "presidential",
    "president",
    "primary",
    "nominee",
    "senate",
    "house",
    "representatives",
    "parliament",
    "minister",
    "prime",
    "of",
    "in",
    "by",
    "to",
    "on",
}

SEMANTIC_GROUPS = {
    "position": ("1st place", "2nd place", "3rd place", "finish", "first round", "second round"),
    "runoff": ("runoff",),
    "turnout": ("turnout",),
    "margin": ("margin", "mov"),
    "matchup": ("matchup", "versus", " vs ", "facing"),
    "combo": ("combo", "ballot"),
}

EXACT_EVENT_TICKER_HINTS = [
    (r"Texas Republican Senate Primary Winner", "KXSENATETXR-26"),
]


def _normalize_text(value: str) -> str:
    lowered = value.lower()
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def _tokenize(value: str) -> Set[str]:
    return {
        token
        for token in _normalize_text(value).split()
        if len(token) > 2 and token not in STOP_WORDS and not token.isdigit()
    }


def _ratio(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, _normalize_text(left), _normalize_text(right)).ratio()


def _jaccard(left: Iterable[str], right: Iterable[str]) -> float:
    left_set = set(left)
    right_set = set(right)
    if not left_set or not right_set:
        return 0.0
    union = left_set | right_set
    if not union:
        return 0.0
    return len(left_set & right_set) / len(union)


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_probability(market: Dict[str, Any]) -> Optional[float]:
    for key in ("last_price_dollars", "yes_price_dollars"):
        value = _safe_float(market.get(key))
        if value is not None:
            if value <= 1:
                return round(value * 100, 1)
            return round(value, 1)

    yes_bid = _safe_float(market.get("yes_bid_dollars"))
    yes_ask = _safe_float(market.get("yes_ask_dollars"))
    if yes_bid is not None and yes_ask is not None:
        midpoint = (yes_bid + yes_ask) / 2
        if midpoint <= 1:
            return round(midpoint * 100, 1)
        return round(midpoint, 1)

    return None


def _iter_market_titles(market: Dict[str, Any]) -> List[str]:
    titles = []
    for key in ("title", "subtitle", "yes_sub_title", "no_sub_title"):
        value = market.get(key)
        if value:
            titles.append(str(value))
    return titles


def _contains_semantic_group(text: str, terms: Iterable[str]) -> bool:
    return any(term in text for term in terms)


def _semantic_conflict(
    opportunity_title: str,
    opportunity_question: str,
    market_titles: List[str],
) -> bool:
    opportunity_text = _normalize_text(" ".join([opportunity_title, opportunity_question]))
    market_text = _normalize_text(" ".join(market_titles))

    for terms in SEMANTIC_GROUPS.values():
        if _contains_semantic_group(market_text, terms) and not _contains_semantic_group(
            opportunity_text,
            terms,
        ):
            return True
    return False


def _candidate_name_matches(target_label: str, market_titles: List[str]) -> bool:
    target_tokens = [token for token in _normalize_text(target_label).split() if len(token) > 2]
    if not target_tokens:
        return True
    market_text = _normalize_text(" ".join(market_titles))
    if len(target_tokens) >= 2:
        surname = target_tokens[-1]
        return surname in market_text
    return any(token in market_text for token in target_tokens)


def _hinted_event_ticker(opportunity_title: str) -> Optional[str]:
    for pattern, ticker in EXACT_EVENT_TICKER_HINTS:
        if re.search(pattern, opportunity_title, flags=re.IGNORECASE):
            return ticker
    return None


def collect_hint_event_tickers(opportunities: List[Dict[str, Any]]) -> List[str]:
    tickers: List[str] = []
    seen = set()
    for opportunity in opportunities:
        title = str(opportunity.get("title") or "")
        ticker = _hinted_event_ticker(title)
        if not ticker:
            continue
        upper = ticker.upper()
        if upper in seen:
            continue
        seen.add(upper)
        tickers.append(ticker)
    return tickers


def _merge_events(*event_groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen = set()
    for group in event_groups:
        for event in group or []:
            if not isinstance(event, dict):
                continue
            ticker = str(event.get("event_ticker") or "").upper()
            if not ticker or ticker in seen:
                continue
            seen.add(ticker)
            merged.append(event)
    return merged


def merge_kalshi_events(
    kalshi_events: List[Dict[str, Any]],
    exact_events: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return _merge_events(exact_events, kalshi_events)


def _score_event(opportunity_title: str, event: Dict[str, Any]) -> float:
    event_title = str(event.get("title") or "")
    opportunity_tokens = _tokenize(opportunity_title)
    event_tokens = _tokenize(event_title)
    base_score = (_ratio(opportunity_title, event_title) * 0.7) + (
        _jaccard(opportunity_tokens, event_tokens) * 0.3
    )

    hinted_ticker = _hinted_event_ticker(opportunity_title)
    event_ticker = str(event.get("event_ticker") or "")
    if hinted_ticker and event_ticker.upper() == hinted_ticker.upper():
        return max(base_score, 0.98)
    return base_score


def _score_market(
    *,
    opportunity_title: str,
    opportunity_question: str,
    target_label: str,
    market: Dict[str, Any],
    event_score: float,
) -> float:
    titles = _iter_market_titles(market)
    if not titles:
        return event_score
    if _semantic_conflict(opportunity_title, opportunity_question, titles):
        return 0.0
    if target_label and not _candidate_name_matches(target_label, titles):
        return 0.0

    market_ratio = max(_ratio(opportunity_title, title) for title in titles)
    target_ratio = max(_ratio(target_label, title) for title in titles) if target_label else 0.0
    target_tokens = _tokenize(target_label)
    title_tokens = set().union(*(_tokenize(title) for title in titles))
    target_overlap = _jaccard(target_tokens, title_tokens)
    nominee_bonus = 0.06 if any(
        any(token in _normalize_text(title) for token in ("nominee", "winner", "win"))
        for title in titles
    ) else 0.0

    return min(
        1.0,
        (event_score * 0.35)
        + (market_ratio * 0.25)
        + (target_ratio * 0.25)
        + (target_overlap * 0.15)
        + nominee_bonus,
    )


def _target_label(opportunity: Dict[str, Any]) -> str:
    comparison_candidate = str(opportunity.get("comparison_candidate") or "").strip()
    if comparison_candidate:
        return comparison_candidate
    candidate_board = opportunity.get("candidate_board") or []
    if isinstance(candidate_board, list) and candidate_board:
        first = candidate_board[0] or {}
        return str(first.get("name") or first.get("name_zh") or "")
    return str(opportunity.get("outcome_label") or opportunity.get("outcome_label_zh") or "")


def enrich_opportunities_with_kalshi(
    opportunities: List[Dict[str, Any]],
    kalshi_events: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    for opportunity in opportunities:
        title = str(opportunity.get("title") or "")
        question = str(opportunity.get("market_question") or "")
        target_label = _target_label(opportunity)

        scored_events: List[tuple[float, Dict[str, Any]]] = []
        for event in kalshi_events:
            event_score = _score_event(title, event)
            if event_score >= 0.32:
                scored_events.append((event_score, event))

        scored_events.sort(key=lambda item: item[0], reverse=True)
        best_match: Optional[Dict[str, Any]] = None
        best_event: Optional[Dict[str, Any]] = None
        best_score = 0.0

        for event_score, event in scored_events[:5]:
            for market in event.get("markets") or []:
                if not isinstance(market, dict):
                    continue
                probability = _extract_probability(market)
                if probability is None:
                    continue
                score = _score_market(
                    opportunity_title=title,
                    opportunity_question=question,
                    target_label=target_label,
                    market=market,
                    event_score=event_score,
                )
                if score > best_score:
                    best_score = score
                    best_match = market
                    best_event = event

        opportunity["kalshi_prob"] = None
        opportunity["kalshi_market_title"] = None
        opportunity["kalshi_market_ticker"] = None
        opportunity["kalshi_event_title"] = None
        opportunity["kalshi_event_ticker"] = None
        opportunity["kalshi_match_score"] = None

        if best_match is None or best_event is None or best_score < 0.42:
            continue

        opportunity["kalshi_prob"] = _extract_probability(best_match)
        opportunity["kalshi_market_title"] = (
            best_match.get("title")
            or best_match.get("subtitle")
            or best_match.get("yes_sub_title")
            or best_event.get("title")
        )
        opportunity["kalshi_market_ticker"] = best_match.get("ticker")
        opportunity["kalshi_event_title"] = best_event.get("title")
        opportunity["kalshi_event_ticker"] = best_event.get("event_ticker")
        opportunity["kalshi_match_score"] = round(best_score, 3)

    return opportunities
