import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from src.data_collection.media_client import MediaClient

logger = logging.getLogger(__name__)

DEFAULT_MEDIA_CONCURRENCY = int(os.getenv("MEDIA_ENRICH_CONCURRENCY", "3"))
DEFAULT_MEDIA_FETCH_TIMEOUT_SECONDS = float(os.getenv("MEDIA_FETCH_TIMEOUT_SECONDS", "8"))
DEFAULT_MEDIA_ENRICH_LIMIT = int(os.getenv("MEDIA_ENRICH_LIMIT", "8"))


def _apply_media_fallback(opportunity: Dict[str, Any]) -> None:
    opportunity["media_sentiment"] = "neutral"
    opportunity["media_sentiment_label"] = "中性"
    opportunity["media_sentiment_score"] = 0.0
    opportunity["media_source"] = None
    opportunity["media_items"] = []
    opportunity["media_article_count"] = 0
    opportunity["media_status"] = "unavailable"
    opportunity["media_status_zh"] = "暂无可用媒体情绪数据"


async def _enrich_single_opportunity(
    opportunity: Dict[str, Any],
    client: MediaClient,
    semaphore: asyncio.Semaphore,
    db_manager: Optional[Any],
    fetch_timeout_seconds: float,
) -> None:
    try:
        cached_items: List[Dict[str, Any]] = []
        if db_manager is not None:
            cached_items = await db_manager.get_media_observations(opportunity["id"])

        if cached_items:
            normalized_items = [
                {
                    "source": str(item.get("source") or "GDELT"),
                    "title": str(item.get("title") or ""),
                    "url": str(item.get("url") or "") or None,
                    "published_at": item.get("published_at"),
                    "sentiment": str(item.get("sentiment_label") or "neutral"),
                    "sentiment_score": float(item.get("sentiment_score") or 0.0),
                    "impact": str(item.get("summary") or ""),
                    "summary": str(item.get("summary") or ""),
                    "domain": str(item.get("domain") or ""),
                }
                for item in cached_items
                if item.get("title")
            ]
            sentiment = client.aggregate_sentiment(normalized_items)
            opportunity["media_sentiment"] = sentiment["label"]
            opportunity["media_sentiment_label"] = sentiment["label_zh"]
            opportunity["media_sentiment_score"] = sentiment["score"]
            opportunity["media_source"] = "gdelt-cache"
            opportunity["media_items"] = normalized_items[:6]
            opportunity["media_article_count"] = sentiment["article_count"]
            opportunity["media_status"] = "live"
            opportunity["media_status_zh"] = "已加载真实媒体报道"
            return

        queries = client.build_queries(opportunity)
        if not queries:
            _apply_media_fallback(opportunity)
            return

        seen_urls = set()
        collected: List[Dict[str, Any]] = []
        for query in queries:
            async with semaphore:
                articles = await asyncio.wait_for(
                    client.search_articles(query, max_records=6),
                    timeout=fetch_timeout_seconds,
                )
            for article in articles:
                item = client.score_article_sentiment(article, opportunity)
                url = str(item.get("url") or "").strip()
                dedupe_key = url or str(item.get("title") or "")
                if not dedupe_key or dedupe_key in seen_urls:
                    continue
                seen_urls.add(dedupe_key)
                collected.append(item)
            if len(collected) >= 6:
                break

        if not collected:
            _apply_media_fallback(opportunity)
            return

        collected = collected[:6]
        if db_manager is not None:
            await db_manager.replace_media_observations(opportunity["id"], collected)

        sentiment = client.aggregate_sentiment(collected)
        opportunity["media_sentiment"] = sentiment["label"]
        opportunity["media_sentiment_label"] = sentiment["label_zh"]
        opportunity["media_sentiment_score"] = sentiment["score"]
        opportunity["media_source"] = "gdelt-doc-api"
        opportunity["media_items"] = collected
        opportunity["media_article_count"] = sentiment["article_count"]
        opportunity["media_status"] = "live"
        opportunity["media_status_zh"] = "已加载真实媒体报道"
    except asyncio.TimeoutError:
        logger.warning("Media enrichment timed out for %s", opportunity.get("title"))
        _apply_media_fallback(opportunity)
    except Exception as exc:
        logger.warning("Media enrichment failed for %s: %r", opportunity.get("title"), exc)
        _apply_media_fallback(opportunity)


async def enrich_opportunities_with_media(
    opportunities: List[Dict[str, Any]],
    client: Optional[MediaClient] = None,
    db_manager: Optional[Any] = None,
    concurrency: int = DEFAULT_MEDIA_CONCURRENCY,
    fetch_timeout_seconds: float = DEFAULT_MEDIA_FETCH_TIMEOUT_SECONDS,
    enrich_limit: int = DEFAULT_MEDIA_ENRICH_LIMIT,
) -> List[Dict[str, Any]]:
    media_client = client or MediaClient()
    semaphore = asyncio.Semaphore(concurrency)
    ranked = sorted(
        opportunities,
        key=lambda item: float(item.get("volume_24h") or 0.0),
        reverse=True,
    )
    to_enrich = ranked[: max(enrich_limit, 0)]
    skipped = ranked[max(enrich_limit, 0) :]

    for opportunity in skipped:
        _apply_media_fallback(opportunity)

    await asyncio.gather(
        *[
            _enrich_single_opportunity(
                opportunity,
                media_client,
                semaphore,
                db_manager,
                fetch_timeout_seconds,
            )
            for opportunity in to_enrich
        ],
        return_exceptions=True,
    )
    return opportunities
