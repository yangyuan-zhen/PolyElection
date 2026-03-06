import logging
import os
from typing import Any, Dict, Iterable, List, Optional

import httpx

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _as_float(value: Any) -> float:
    try:
        if value in (None, ""):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


class PolymarketClient:
    BASE_URL = "https://gamma-api.polymarket.com"
    SEARCH_TERMS = (
        "election",
        "president",
        "prime minister",
        "parliament",
        "senate",
        "governor",
        "mayor",
    )
    KEYWORDS = (
        "election",
        "president",
        "prime minister",
        "parliament",
        "senate",
        "governor",
        "mayor",
        "house",
        "assembly",
        "cabinet",
        "chancellor",
    )

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.base_url = os.getenv("POLYMARKET_GAMMA_API_BASE_URL", self.BASE_URL).rstrip("/")
        self.verify_ssl = _env_flag("POLYMARKET_VERIFY_SSL", default=False)
        self.trust_env = _env_flag("POLYMARKET_TRUST_ENV", default=False)
        self.default_headers = {
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            trust_env=self.trust_env,
            verify=self.verify_ssl,
            headers=self.default_headers,
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    def _iter_tags(self, event: Dict[str, Any]) -> Iterable[str]:
        for raw_tag in event.get("tags") or []:
            if isinstance(raw_tag, dict):
                for key in ("slug", "label", "name"):
                    value = raw_tag.get(key)
                    if value:
                        yield str(value).lower()
            elif raw_tag:
                yield str(raw_tag).lower()

    def _is_relevant_event(self, event: Dict[str, Any]) -> bool:
        haystack = " ".join(
            str(event.get(key, ""))
            for key in ("title", "description", "question", "slug", "seriesSlug")
        ).lower()
        haystack += " " + " ".join(self._iter_tags(event))
        return any(keyword in haystack for keyword in self.KEYWORDS)

    def _event_sort_key(self, event: Dict[str, Any]) -> Any:
        return (
            _as_float(event.get("volume24hr") or event.get("volume24Hr")),
            _as_float(event.get("liquidityNum") or event.get("liquidity")),
            _as_float(event.get("volume")),
        )

    async def get_election_events(self, search_term: str = "election") -> List[Dict[str, Any]]:
        params = {
            "active": "true",
            "closed": "false",
            "archived": "false",
            "limit": 50,
            "search": search_term,
            "order": "volume24hr",
            "ascending": "false",
        }
        try:
            events = await self._get("/events", params=params)
            return events if isinstance(events, list) else []
        except Exception as exc:
            logger.error("Error fetching election events for '%s': %s", search_term, exc)
            return []

    async def get_market_details(self, market_id: str) -> Dict[str, Any]:
        try:
            market = await self._get(f"/markets/{market_id}")
            return market if isinstance(market, dict) else {}
        except Exception as exc:
            logger.error("Error fetching market %s: %s", market_id, exc)
            return {}

    async def get_global_election_dashboard(self, limit: int = 24) -> List[Dict[str, Any]]:
        seen_ids = set()
        collected: List[Dict[str, Any]] = []

        for term in self.SEARCH_TERMS:
            events = await self.get_election_events(term)
            for event in events:
                event_id = str(event.get("id") or "")
                if not event_id or event_id in seen_ids:
                    continue
                if not self._is_relevant_event(event):
                    continue
                seen_ids.add(event_id)
                collected.append(event)

        collected.sort(key=self._event_sort_key, reverse=True)
        return collected[:limit]
