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


def _score_event(opportunity_title: str, event: Dict[str, Any]) -> float:
    event_title = str(event.get("title") or "")
    opportunity_tokens = _tokenize(opportunity_title)
    event_tokens = _tokenize(event_title)
    return (_ratio(opportunity_title, event_title) * 0.7) + (
        _jaccard(opportunity_tokens, event_tokens) * 0.3
    )


def _score_market(
    *,
    opportunity_title: str,
    target_label: str,
    market: Dict[str, Any],
    event_score: float,
) -> float:
    titles = _iter_market_titles(market)
    if not titles:
        return event_score

    market_ratio = max(_ratio(opportunity_title, title) for title in titles)
    target_ratio = max(_ratio(target_label, title) for title in titles) if target_label else 0.0
    target_tokens = _tokenize(target_label)
    title_tokens = set().union(*(_tokenize(title) for title in titles))
    target_overlap = _jaccard(target_tokens, title_tokens)

    return (event_score * 0.35) + (market_ratio * 0.25) + (target_ratio * 0.25) + (target_overlap * 0.15)


def _target_label(opportunity: Dict[str, Any]) -> str:
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
                    target_label=target_label,
                    market=market,
                    event_score=event_score,
                )
                if score > best_score:
                    best_score = score
                    best_match = market
                    best_event = event

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
