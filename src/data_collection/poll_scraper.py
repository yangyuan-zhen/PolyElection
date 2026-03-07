import logging
import math
import os
import re
from datetime import datetime, timezone
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pandas as pd
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


POLLSTER_ACCURACY = {
    "yougov": 0.87,
    "ipsos": 0.84,
    "morning consult": 0.75,
    "atlasintel": 0.76,
    "data for progress": 0.86,
    "siena": 0.89,
    "new york times": 0.89,
    "nyt": 0.89,
    "marist": 0.85,
    "quinnipiac": 0.82,
    "emerson": 0.80,
    "survation": 0.80,
    "opinium": 0.78,
    "rasmussen": 0.67,
}

PAGE_TITLE_MAP = [
    (r"Democratic Presidential Nominee 2028", ["2028 United States presidential election"]),
    (r"Republican Presidential Nominee 2028", ["2028 United States presidential election"]),
    (r"Presidential Election Winner 2028", ["2028 United States presidential election"]),
    (r"Texas Republican Senate Primary Winner", ["2026 United States Senate election in Texas"]),
    (r"Maine Democratic Senate Primary Winner", ["2026 United States Senate election in Maine"]),
    (r"Brazil Presidential Election", ["2026 Brazilian general election"]),
    (r"Colombia Senate Election Winner", ["2026 Colombian general election"]),
    (r"Colombia Chamber of Representatives Election Winner", ["2026 Colombian general election"]),
    (r"Colombia Presidential Election", ["2026 Colombian presidential election"]),
    (r"Next Prime Minister of Hungary", ["2026 Hungarian parliamentary election"]),
]

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


class PollScraper:
    API_URL = "https://en.wikipedia.org/w/api.php"
    SEARCH_LIMIT = 3

    def __init__(self, timeout: int = 12):
        self.timeout = timeout
        self.verify_ssl = _env_flag("WIKIPEDIA_VERIFY_SSL", default=False)
        self.trust_env = _env_flag("WIKIPEDIA_TRUST_ENV", default=False)
        self.proxy_url = os.getenv("WIKIPEDIA_PROXY_URL") or os.getenv("POLYMARKET_PROXY_URL")
        self.headers = {
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def _get(self, params: Dict[str, Any]) -> Any:
        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            trust_env=self.trust_env,
            verify=self.verify_ssl,
            proxy=self.proxy_url,
            headers=self.headers,
        ) as client:
            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()
            return response.json()

    async def search_pages(self, query: str, limit: int = SEARCH_LIMIT) -> List[str]:
        payload = await self._get(
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": limit,
                "format": "json",
                "utf8": 1,
            }
        )
        results = payload.get("query", {}).get("search", [])
        return [str(item.get("title")) for item in results if item.get("title")]

    async def get_page_html(self, title: str) -> str:
        payload = await self._get(
            {
                "action": "parse",
                "page": title,
                "prop": "text",
                "format": "json",
                "redirects": 1,
                "utf8": 1,
            }
        )
        return str(payload.get("parse", {}).get("text", {}).get("*", ""))

    async def fetch_polls_for_opportunity(self, opportunity: Dict[str, Any]) -> Dict[str, Any]:
        candidate_aliases = self._build_candidate_aliases(opportunity)
        if not candidate_aliases:
            return {}

        page_titles: List[str] = []
        seen = set()
        mapped_titles = self._mapped_page_titles(opportunity)
        for title in mapped_titles:
            lowered = title.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            page_titles.append(title)

        queries = self._build_search_queries(opportunity)
        for query in queries:
            try:
                titles = await self.search_pages(query)
            except Exception as exc:
                logger.warning("Wikipedia search failed for %s: %r", query, exc)
                continue

            for title in titles:
                lowered = title.lower()
                if lowered in seen:
                    continue
                seen.add(lowered)
                page_titles.append(title)

        best_result: Dict[str, Any] = {
            "queries": queries,
            "pages": page_titles[:6],
        }
        best_count = 0

        for title in page_titles[:6]:
            try:
                html = await self.get_page_html(title)
            except Exception as exc:
                logger.warning("Wikipedia page fetch failed for %s: %r", title, exc)
                continue

            result = self._extract_polls_from_html(
                html=html,
                page_title=title,
                candidate_aliases=candidate_aliases,
                target_candidate=self._target_candidate(opportunity),
            )
            if len(result.get("polls") or []) > best_count:
                best_result = {
                    **result,
                    "queries": queries,
                    "pages": page_titles[:6],
                }
                best_count = len(result.get("polls") or [])
            if best_count >= 4:
                break

        return best_result

    def _mapped_page_titles(self, opportunity: Dict[str, Any]) -> List[str]:
        title = str(opportunity.get("title") or "")
        matched: List[str] = []
        for pattern, pages in PAGE_TITLE_MAP:
            if re.search(pattern, title, flags=re.IGNORECASE):
                matched.extend(pages)
        return matched

    def _build_search_queries(self, opportunity: Dict[str, Any]) -> List[str]:
        title = str(opportunity.get("title") or "").strip()
        question = str(opportunity.get("market_question") or "").strip()
        candidate = self._target_candidate(opportunity)
        mapped_titles = self._mapped_page_titles(opportunity)
        simplified = re.sub(
            r"\b(Winner|Nominee|Next|Will|most seats|won|win)\b",
            " ",
            title,
            flags=re.IGNORECASE,
        )
        simplified = re.sub(r"\s+", " ", simplified).strip()

        queries = [
            f'"{title}" opinion polling',
            f"{title} polling",
            f"{simplified} opinion polling",
        ]
        if question:
            queries.append(f"{question} polling")
        if candidate and title:
            queries.append(f'"{candidate}" "{title}" poll')
        for mapped_title in mapped_titles:
            queries.append(f'"{mapped_title}" polling')
            queries.append(f'"{mapped_title}" opinion polling')

        deduped: List[str] = []
        seen = set()
        for query in queries:
            normalized = query.lower().strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(query)
        return deduped[:8]

    def _target_candidate(self, opportunity: Dict[str, Any]) -> str:
        comparison_candidate = str(opportunity.get("comparison_candidate") or "").strip()
        if comparison_candidate:
            return comparison_candidate
        candidate_board = opportunity.get("candidate_board") or []
        if isinstance(candidate_board, list) and candidate_board:
            first = candidate_board[0] or {}
            return str(first.get("name") or "")
        return str(opportunity.get("outcome_label") or "")

    def _build_candidate_aliases(self, opportunity: Dict[str, Any]) -> Dict[str, str]:
        aliases: Dict[str, str] = {}
        candidate_board = opportunity.get("candidate_board") or []

        def add_alias(alias: str, canonical: str) -> None:
            normalized = self._normalize_alias(alias)
            if normalized:
                aliases[normalized] = canonical

        for candidate in candidate_board:
            name = str(candidate.get("name") or "").strip()
            if not name:
                continue
            add_alias(name, name)
            parts = [part for part in re.split(r"\s+", name) if part]
            if len(parts) >= 2:
                add_alias(parts[-1], name)
                add_alias(" ".join(parts[-2:]), name)

        target = self._target_candidate(opportunity)
        if target:
            add_alias(target, target)

        return aliases

    def _normalize_alias(self, value: str) -> str:
        lowered = value.lower()
        lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
        return re.sub(r"\s+", " ", lowered).strip()

    def _extract_polls_from_html(
        self,
        *,
        html: str,
        page_title: str,
        candidate_aliases: Dict[str, str],
        target_candidate: str,
    ) -> Dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        best_rows: List[Dict[str, Any]] = []

        for table in soup.select("table.wikitable"):
            rows = self._parse_poll_table(
                table_html=str(table),
                candidate_aliases=candidate_aliases,
            )
            if len(rows) > len(best_rows):
                best_rows = rows

        if not best_rows:
            return {}

        return {
            "page_title": page_title,
            "polls": best_rows[:32],
            "source": "wikipedia",
        }

    def _parse_poll_table(
        self,
        *,
        table_html: str,
        candidate_aliases: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        try:
            dataframes = pd.read_html(StringIO(table_html))
        except ValueError:
            return []
        except Exception:
            return []

        if not dataframes:
            return []

        dataframe = dataframes[0]
        if dataframe.empty:
            return []

        columns = [self._flatten_column(column) for column in dataframe.columns]
        pollster_index = self._find_pollster_column(columns)
        date_index = self._find_date_column(columns)
        sample_index = self._find_sample_column(columns)
        candidate_columns = self._find_candidate_columns(columns, candidate_aliases)

        if pollster_index is None or date_index is None or not candidate_columns:
            return []

        parsed_rows: List[Dict[str, Any]] = []
        for _, row in dataframe.iterrows():
            pollster = self._clean_text(row.iloc[pollster_index])
            date_text = self._clean_text(row.iloc[date_index])
            if not pollster or not date_text:
                continue
            lowered_pollster = pollster.lower()
            if any(token in lowered_pollster for token in ("average", "lead", "result", "actual")):
                continue

            parsed_date = self._parse_date(date_text)
            sample = self._parse_sample(row.iloc[sample_index]) if sample_index is not None else None

            for column_index, candidate_name in candidate_columns:
                support = self._parse_percentage(row.iloc[column_index])
                if support is None:
                    continue
                accuracy = self._pollster_accuracy(pollster)
                parsed_rows.append(
                    {
                        "pollster": pollster,
                        "candidate": candidate_name,
                        "support": support,
                        "date": parsed_date.date().isoformat() if parsed_date else date_text,
                        "sample": sample or 1000,
                        "accuracy": round(accuracy * 100, 1),
                    }
                )

        return parsed_rows

    def _flatten_column(self, column: Any) -> str:
        if isinstance(column, tuple):
            parts = [self._clean_text(part) for part in column if self._clean_text(part)]
            return " ".join(parts)
        return self._clean_text(column)

    def _clean_text(self, value: Any) -> str:
        text = str(value if value is not None else "")
        text = re.sub(r"\[[^\]]+\]", " ", text)
        text = text.replace("\xa0", " ")
        return re.sub(r"\s+", " ", text).strip()

    def _find_pollster_column(self, columns: List[str]) -> Optional[int]:
        for index, column in enumerate(columns):
            lowered = column.lower()
            if any(token in lowered for token in ("pollster", "polling firm", "source", "firm", "organization")):
                return index
        return None

    def _find_date_column(self, columns: List[str]) -> Optional[int]:
        for index, column in enumerate(columns):
            lowered = column.lower()
            if any(token in lowered for token in ("date", "fieldwork", "conducted")):
                return index
        return None

    def _find_sample_column(self, columns: List[str]) -> Optional[int]:
        for index, column in enumerate(columns):
            lowered = column.lower()
            if "sample" in lowered:
                return index
        return None

    def _find_candidate_columns(
        self,
        columns: List[str],
        candidate_aliases: Dict[str, str],
    ) -> List[Tuple[int, str]]:
        matched: List[Tuple[int, str]] = []
        seen = set()
        for index, column in enumerate(columns):
            normalized_column = self._normalize_alias(column)
            for alias, canonical in candidate_aliases.items():
                if alias and alias in normalized_column and canonical not in seen:
                    matched.append((index, canonical))
                    seen.add(canonical)
                    break
        return matched

    def _parse_percentage(self, value: Any) -> Optional[float]:
        text = self._clean_text(value)
        match = re.search(r"(-?\d+(?:\.\d+)?)", text)
        if not match:
            return None
        try:
            return float(match.group(1))
        except ValueError:
            return None

    def _parse_sample(self, value: Any) -> Optional[int]:
        text = self._clean_text(value)
        match = re.search(r"(\d[\d,]*)", text)
        if not match:
            return None
        try:
            return int(match.group(1).replace(",", ""))
        except ValueError:
            return None

    def _parse_date(self, value: str) -> Optional[datetime]:
        text = self._clean_text(value).replace("–", "-")
        lowered = text.lower()
        for month_name, month_value in MONTHS.items():
            if month_name not in lowered:
                continue

            year_match = re.search(r"(20\d{2})", lowered)
            day_matches = re.findall(r"\b(\d{1,2})\b", lowered)
            if not year_match or not day_matches:
                continue
            try:
                day = int(day_matches[-1])
                year = int(year_match.group(1))
                return datetime(year, month_value, day, tzinfo=timezone.utc)
            except ValueError:
                return None
        return None

    def _pollster_accuracy(self, pollster: str) -> float:
        lowered = pollster.lower()
        for token, score in POLLSTER_ACCURACY.items():
            if token in lowered:
                return score
        return 0.74

    def compute_poll_weight(
        self,
        *,
        pollster: str,
        sample: int,
        date_text: str,
        now: Optional[datetime] = None,
    ) -> float:
        current = now or datetime.now(timezone.utc)
        accuracy = self._pollster_accuracy(pollster)
        sample_factor = min(max(sample, 400), 4000) / 4000
        parsed_date = self._parse_date(date_text)
        if parsed_date is None:
            recency_factor = 0.55
        else:
            days_ago = max((current - parsed_date).days, 0)
            recency_factor = 0.35 + 0.65 * math.exp(-days_ago / 45)
        return accuracy * (0.45 + 0.55 * sample_factor) * recency_factor



