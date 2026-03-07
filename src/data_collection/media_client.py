import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


POSITIVE_KEYWORDS = {
    "lead": 1.2,
    "leads": 1.2,
    "ahead": 1.1,
    "surge": 1.0,
    "boost": 0.9,
    "gain": 0.7,
    "wins": 1.2,
    "win": 1.0,
    "momentum": 0.8,
    "support": 0.4,
    "endorsement": 0.6,
    "dominates": 1.2,
}

NEGATIVE_KEYWORDS = {
    "trails": -1.1,
    "behind": -1.0,
    "drops": -0.9,
    "drop": -0.8,
    "slump": -1.1,
    "scandal": -1.5,
    "attack": -0.5,
    "weakens": -1.0,
    "loses": -1.2,
    "loss": -1.0,
    "criticized": -0.7,
    "criticism": -0.7,
}


class MediaClient:
    DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

    def __init__(self, timeout: int = 12):
        self.timeout = timeout
        self.verify_ssl = _env_flag("MEDIA_VERIFY_SSL", default=False)
        self.trust_env = _env_flag("MEDIA_TRUST_ENV", default=False)
        self.proxy_url = os.getenv("MEDIA_PROXY_URL") or os.getenv("POLYMARKET_PROXY_URL")
        self.headers = {
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def search_articles(self, query: str, *, max_records: int = 10) -> List[Dict[str, Any]]:
        params = {
            "query": query,
            "mode": "ArtList",
            "format": "json",
            "maxrecords": max_records,
            "sort": "DateDesc",
        }
        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            trust_env=self.trust_env,
            verify=self.verify_ssl,
            proxy=self.proxy_url,
            headers=self.headers,
        ) as client:
            response = await client.get(self.DOC_API_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        articles = payload.get("articles") or []
        return [item for item in articles if isinstance(item, dict)]

    def build_queries(self, opportunity: Dict[str, Any]) -> List[str]:
        title = str(opportunity.get("title") or "").strip()
        title_zh = str(opportunity.get("title_zh") or "").strip()
        candidate = str(opportunity.get("comparison_candidate") or "").strip()
        question = str(opportunity.get("market_question") or "").strip()

        base_queries = []
        if candidate and title:
            base_queries.append(f'"{candidate}" AND "{title}"')
        if candidate and question:
            base_queries.append(f'"{candidate}" AND "{question}"')
        if title:
            base_queries.append(f'"{title}"')
        if title_zh:
            base_queries.append(f'"{title_zh}"')

        deduped: List[str] = []
        seen = set()
        for query in base_queries:
            normalized = query.lower().strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(query)
        return deduped[:4]

    def score_article_sentiment(self, article: Dict[str, Any], opportunity: Dict[str, Any]) -> Dict[str, Any]:
        title = str(article.get("title") or "").strip()
        summary = str(article.get("seendate") or "").strip()
        text = f"{title} {summary}".lower()
        score = 0.0
        for token, weight in POSITIVE_KEYWORDS.items():
            if token in text:
                score += weight
        for token, weight in NEGATIVE_KEYWORDS.items():
            if token in text:
                score += weight

        candidate = str(opportunity.get("comparison_candidate") or "").strip().lower()
        if candidate:
            surname = candidate.split()[-1]
            if surname and surname in text:
                score *= 1.15

        label = "neutral"
        if score >= 0.8:
            label = "bullish"
        elif score <= -0.8:
            label = "bearish"

        domain = str(article.get("domain") or article.get("sourcecountry") or "").strip()
        url = str(article.get("url") or "").strip()
        published_at = self._normalize_timestamp(article.get("seendate"))
        impact = self._build_impact(label, opportunity, title)
        return {
            "source": domain or "GDELT",
            "title": title or "Untitled coverage",
            "url": url or None,
            "published_at": published_at,
            "sentiment": label,
            "sentiment_score": round(score, 2),
            "summary": impact,
            "domain": domain,
            "impact": impact,
        }

    def _build_impact(self, label: str, opportunity: Dict[str, Any], title: str) -> str:
        leader = str(opportunity.get("comparison_candidate") or opportunity.get("outcome_label_zh") or "该候选人")
        if label == "bullish":
            return f"利好：最新报道对 {leader} 更友好，短线情绪偏正面。"
        if label == "bearish":
            return f"利空：最新报道可能压制 {leader} 的短线情绪表现。"
        return f"中性：该报道更像背景信息，暂未明显改变 {leader} 的交易叙事。"

    def aggregate_sentiment(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not items:
            return {
                "score": 0.0,
                "label": "neutral",
                "label_zh": "中性",
                "article_count": 0,
            }

        score = sum(float(item.get("sentiment_score") or 0.0) for item in items) / len(items)
        label = "neutral"
        label_zh = "中性"
        if score >= 0.8:
            label = "bullish"
            label_zh = "偏多"
        elif score <= -0.8:
            label = "bearish"
            label_zh = "偏空"

        return {
            "score": round(score, 2),
            "label": label,
            "label_zh": label_zh,
            "article_count": len(items),
        }

    def _normalize_timestamp(self, value: Any) -> Optional[str]:
        if not value:
            return None
        text = str(value).strip()
        match = re.match(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$", text)
        if not match:
            return text
        year, month, day, hour, minute, second = map(int, match.groups())
        return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc).isoformat()
