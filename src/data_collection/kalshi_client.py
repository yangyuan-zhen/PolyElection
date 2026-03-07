import asyncio
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


class KalshiClient:
    BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"
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
        "nominee",
        "primary",
    )

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.base_url = os.getenv("KALSHI_API_BASE_URL", self.BASE_URL).rstrip("/")
        self.verify_ssl = _env_flag("KALSHI_VERIFY_SSL", default=False)
        self.trust_env = _env_flag("KALSHI_TRUST_ENV", default=False)
        self.proxy_url = os.getenv("KALSHI_PROXY_URL") or os.getenv("POLYMARKET_PROXY_URL")
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
            proxy=self.proxy_url,
            headers=self.default_headers,
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    def _iter_market_text(self, event: Dict[str, Any]) -> Iterable[str]:
        for market in event.get("markets") or []:
            for key in ("title", "subtitle", "yes_sub_title", "no_sub_title"):
                value = market.get(key)
                if value:
                    yield str(value).lower()

    def _is_relevant_event(self, event: Dict[str, Any]) -> bool:
        category = str(event.get("category") or "").lower()
        if "politic" in category:
            return True

        haystack = " ".join(
            [
                str(event.get("title") or ""),
                str(event.get("sub_title") or ""),
                *self._iter_market_text(event),
            ]
        ).lower()
        return any(keyword in haystack for keyword in self.KEYWORDS)

    async def get_events(
        self,
        *,
        limit: int = 200,
        cursor: Optional[str] = None,
        with_nested_markets: bool = True,
        status: str = "open",
        event_ticker: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "limit": limit,
            "with_nested_markets": str(with_nested_markets).lower(),
            "status": status,
        }
        if cursor:
            params["cursor"] = cursor
        if event_ticker:
            params["event_ticker"] = event_ticker
        payload = await self._get("/events", params=params)
        return payload if isinstance(payload, dict) else {}

    async def get_event(
        self,
        event_ticker: str,
        *,
        with_nested_markets: bool = True,
    ) -> Optional[Dict[str, Any]]:
        ticker = str(event_ticker or "").strip()
        if not ticker:
            return None

        try:
            payload = await self._get(
                f"/events/{ticker}",
                params={"with_nested_markets": str(with_nested_markets).lower()},
            )
            if isinstance(payload, dict):
                if isinstance(payload.get("event"), dict):
                    return payload["event"]
                if payload.get("event_ticker"):
                    return payload
        except Exception as exc:
            logger.debug("Kalshi direct event fetch failed for %s: %r", ticker, exc)

        try:
            payload = await self.get_events(
                limit=1,
                with_nested_markets=with_nested_markets,
                status="open",
                event_ticker=ticker,
            )
        except Exception as exc:
            logger.error("Kalshi filtered event fetch failed for %s: %r", ticker, exc)
            return None

        events = payload.get("events") or []
        for event in events:
            if not isinstance(event, dict):
                continue
            if str(event.get("event_ticker") or "").upper() == ticker.upper():
                return event
        return None

    async def get_events_by_tickers(self, event_tickers: List[str]) -> List[Dict[str, Any]]:
        tickers: List[str] = []
        seen = set()
        for event_ticker in event_tickers:
            ticker = str(event_ticker or "").strip()
            upper = ticker.upper()
            if not ticker or upper in seen:
                continue
            seen.add(upper)
            tickers.append(ticker)

        if not tickers:
            return []

        results = await asyncio.gather(
            *[self.get_event(ticker) for ticker in tickers],
            return_exceptions=True,
        )

        events: List[Dict[str, Any]] = []
        for ticker, result in zip(tickers, results):
            if isinstance(result, Exception):
                logger.error("Kalshi hinted event fetch failed for %s: %r", ticker, result)
                continue
            if isinstance(result, dict):
                events.append(result)
        return events

    async def get_open_election_events(self, max_pages: int = 3) -> List[Dict[str, Any]]:
        cursor: Optional[str] = None
        collected: List[Dict[str, Any]] = []
        seen_tickers = set()

        for _ in range(max_pages):
            try:
                payload = await self.get_events(cursor=cursor)
            except Exception as exc:
                logger.error("Error fetching Kalshi events: %r", exc)
                break

            events = payload.get("events") or []
            if not isinstance(events, list) or not events:
                break

            for event in events:
                if not isinstance(event, dict):
                    continue
                ticker = str(event.get("event_ticker") or "")
                if not ticker or ticker in seen_tickers:
                    continue
                seen_tickers.add(ticker)
                if self._is_relevant_event(event):
                    collected.append(event)

            cursor = str(payload.get("cursor") or "").strip() or None
            if not cursor:
                break

        return collected
