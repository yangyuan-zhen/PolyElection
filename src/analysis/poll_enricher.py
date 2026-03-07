import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from src.analysis.peb_algorithm import PEBAlgorithm
from src.data_collection.poll_scraper import PollScraper

logger = logging.getLogger(__name__)

DEFAULT_CONCURRENCY = int(os.getenv("POLL_ENRICH_CONCURRENCY", "3"))
DEFAULT_FETCH_TIMEOUT_SECONDS = float(os.getenv("POLL_FETCH_TIMEOUT_SECONDS", "10"))
DEFAULT_ENRICH_LIMIT = int(os.getenv("POLL_ENRICH_LIMIT", "6"))


POLL_STATUS_LABELS = {
    "live": "已加载真实外部民调",
    "cached": "已加载缓存的真实外部民调",
    "no_target_candidate": "未识别到可用于民调匹配的候选人",
    "no_real_polls": "暂无外部民调数据源可用",
    "timeout": "外部民调抓取超时，已回退到市场价格",
    "error": "外部民调抓取失败，已回退到市场价格",
    "no_target_rows": "找到了民调页面，但未匹配到目标候选人的民调行",
}


def _weighted_average_accuracy(polls: List[Dict[str, Any]]) -> float:
    total_weight = sum(float(item.get("weight", 0.0)) for item in polls)
    if total_weight <= 0:
        return 74.0
    return sum(
        float(item.get("weight", 0.0)) * float(item.get("accuracy", 74.0))
        for item in polls
    ) / total_weight


def _target_candidate(opportunity: Dict[str, Any]) -> str:
    comparison_candidate = str(opportunity.get("comparison_candidate") or "").strip()
    if comparison_candidate:
        return comparison_candidate
    candidate_board = opportunity.get("candidate_board") or []
    if isinstance(candidate_board, list) and candidate_board:
        first = candidate_board[0] or {}
        return str(first.get("name") or "")
    return str(opportunity.get("outcome_label") or "")


def _apply_market_blend_fallback(opportunity: Dict[str, Any], reason: str = "no_real_polls") -> None:
    market_price = float(opportunity.get("market_price") or 0.0)
    opportunity["peb_prob"] = market_price
    opportunity["market_blend_prob"] = market_price
    opportunity["divergence"] = 0.0
    opportunity["peb_source"] = "market-blend"
    opportunity["poll_source_count"] = 0
    opportunity["poll_breakdown"] = []
    opportunity["poll_candidate"] = None
    opportunity["poll_page_title"] = None
    opportunity["poll_source"] = None
    opportunity["poll_accuracy_avg"] = None
    opportunity["peb_support_prob"] = None
    opportunity["poll_status"] = reason
    opportunity["poll_status_zh"] = POLL_STATUS_LABELS.get(reason, POLL_STATUS_LABELS["no_real_polls"])
    opportunity.setdefault("poll_search_debug", [])


async def _enrich_single_opportunity(
    opportunity: Dict[str, Any],
    scraper: PollScraper,
    semaphore: asyncio.Semaphore,
    db_manager: Optional[Any],
    fetch_timeout_seconds: float,
) -> None:
    target_candidate = _target_candidate(opportunity)
    if not target_candidate:
        _apply_market_blend_fallback(opportunity, "no_target_candidate")
        return

    try:
        cached_polls: List[Dict[str, Any]] = []
        if db_manager is not None:
            cached_polls = await db_manager.get_poll_observations(opportunity["id"])
            distinct_candidates = {
                str(item.get("candidate") or "").strip().lower()
                for item in cached_polls
                if item.get("candidate")
            }
            candidate_count = int(opportunity.get("candidate_count") or 0)
            if candidate_count > 2 and len(distinct_candidates) <= 1:
                cached_polls = []

        if cached_polls:
            result = {
                "page_title": cached_polls[0].get("page_title") or "",
                "polls": cached_polls,
                "source": cached_polls[0].get("source") or "wikipedia-cache",
                "queries": [],
            }
            cache_hit = True
        else:
            async with semaphore:
                result = await asyncio.wait_for(
                    scraper.fetch_polls_for_opportunity(opportunity),
                    timeout=fetch_timeout_seconds,
                )
            cache_hit = False

        opportunity["poll_search_debug"] = result.get("queries") or result.get("pages") or []
        polls = result.get("polls") or []
        if not polls:
            _apply_market_blend_fallback(opportunity, "no_real_polls")
            return

        weighted_polls: List[Dict[str, Any]] = []
        for poll in polls:
            weight = scraper.compute_poll_weight(
                pollster=str(poll.get("pollster") or ""),
                sample=int(poll.get("sample") or 1000),
                date_text=str(poll.get("date") or ""),
            )
            weighted_polls.append({**poll, "weight": weight})

        weighted_target_polls = [
            poll
            for poll in weighted_polls
            if str(poll.get("candidate") or "").strip().lower() == target_candidate.lower()
        ]
        if not weighted_target_polls:
            _apply_market_blend_fallback(opportunity, "no_target_rows")
            return

        if not cache_hit and db_manager is not None:
            await db_manager.replace_poll_observations(
                opportunity["id"],
                weighted_polls,
                source=str(result.get("source") or "wikipedia"),
                page_title=str(result.get("page_title") or ""),
            )

        candidate_support = PEBAlgorithm.calculate_candidate_support(weighted_polls, target_candidate)
        peb_probability = candidate_support
        if int(opportunity.get("candidate_count") or 0) > 2:
            peb_probability = PEBAlgorithm.estimate_win_probability(weighted_polls, target_candidate)
        market_blend_prob = float(opportunity.get("market_blend_prob") or opportunity.get("market_price") or 0.0)
        market_price = float(opportunity.get("market_price") or 0.0)

        total_weight = sum(float(item.get("weight", 0.0)) for item in weighted_target_polls) or 1.0
        breakdown = [
            {
                "name": poll["pollster"],
                "support": round(float(poll["support"]), 1),
                "sample": int(poll.get("sample") or 1000),
                "accuracy": round(float(poll.get("accuracy") or 74.0), 1),
                "weight": round(float(poll["weight"]) / total_weight, 4),
                "date": poll.get("date"),
                "candidate": poll.get("candidate"),
            }
            for poll in weighted_target_polls[:8]
        ]

        opportunity["market_blend_prob"] = round(market_blend_prob, 1)
        opportunity["peb_prob"] = round(peb_probability, 1)
        opportunity["divergence"] = round(peb_probability - market_price, 1)
        opportunity["peb_source"] = "real-polls"
        opportunity["peb_support_prob"] = round(candidate_support, 1)
        opportunity["poll_source"] = str(result.get("source") or "wikipedia")
        opportunity["poll_page_title"] = result.get("page_title")
        opportunity["poll_source_count"] = len({item["name"] for item in breakdown})
        opportunity["poll_breakdown"] = breakdown
        opportunity["poll_accuracy_avg"] = round(_weighted_average_accuracy(weighted_target_polls), 1)
        opportunity["poll_candidate"] = target_candidate
        opportunity["poll_status"] = "cached" if cache_hit else "live"
        opportunity["poll_status_zh"] = POLL_STATUS_LABELS[opportunity["poll_status"]]
    except asyncio.TimeoutError:
        logger.warning(
            "Poll enrichment timed out for %s after %.1fs",
            opportunity.get("title"),
            fetch_timeout_seconds,
        )
        _apply_market_blend_fallback(opportunity, "timeout")
    except Exception as exc:
        logger.warning("Poll enrichment failed for %s: %r", opportunity.get("title"), exc)
        _apply_market_blend_fallback(opportunity, "error")


async def enrich_opportunities_with_polls(
    opportunities: List[Dict[str, Any]],
    scraper: Optional[PollScraper] = None,
    db_manager: Optional[Any] = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    fetch_timeout_seconds: float = DEFAULT_FETCH_TIMEOUT_SECONDS,
    enrich_limit: int = DEFAULT_ENRICH_LIMIT,
) -> List[Dict[str, Any]]:
    poll_scraper = scraper or PollScraper()
    semaphore = asyncio.Semaphore(concurrency)
    ranked_opportunities = sorted(
        opportunities,
        key=lambda item: float(item.get("volume_24h") or 0.0),
        reverse=True,
    )
    to_enrich = ranked_opportunities[: max(enrich_limit, 0)]
    skipped = ranked_opportunities[max(enrich_limit, 0) :]

    for opportunity in skipped:
        _apply_market_blend_fallback(opportunity, "no_real_polls")

    await asyncio.gather(
        *[
            _enrich_single_opportunity(
                opportunity,
                poll_scraper,
                semaphore,
                db_manager,
                fetch_timeout_seconds,
            )
            for opportunity in to_enrich
        ],
        return_exceptions=True,
    )
    return opportunities
