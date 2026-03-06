import httpx
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class PolymarketClient:
    """
    Client for interacting with Polymarket Gamma API.
    Ref: https://gamma-api.polymarket.com
    """
    BASE_URL = "https://gamma-api.polymarket.com"

    def __init__(self, timeout: int = 30):
        self.timeout = timeout

    async def get_election_events(self, search_term: str = "election") -> List[Dict[str, Any]]:
        """
        Fetch active election-related events.
        """
        params = {
            "active": "true",
            "closed": "false",
            "limit": 50,
            "search": search_term
        }
        url = f"{self.BASE_URL}/events"
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Error fetching election events: {e}")
                return []

    async def get_market_details(self, market_id: str) -> Dict[str, Any]:
        """
        Fetch detailed info for a specific market.
        """
        url = f"{self.BASE_URL}/markets/{market_id}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Error fetching market {market_id}: {e}")
                return {}

    async def get_global_election_dashboard(self) -> List[Dict[str, Any]]:
        """
        Specific fetch for the 'Global Elections' dashboard equivalent.
        Usually filtered by a specific tag or category.
        """
        # Based on research, we find events with specific tags
        # Election tag_id often varies, but we can search for them.
        return await self.get_election_events("election")
