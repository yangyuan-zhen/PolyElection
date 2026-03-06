import httpx
import json
import asyncio

async def fetch_election_markets():
    base_url = "https://gamma-api.polymarket.com"
    # We search for "election" in events
    params = {
        "active": "true",
        "closed": "false",
        "limit": 20,
        "offset": 0,
        "search": "election"
    }
    
    async with httpx.AsyncClient() as client:
        # Search for markets/events
        response = await client.get(f"{base_url}/events", params=params)
        if response.status_code == 200:
            data = response.json()
            print(f"Found {len(data)} election events.")
            for event in data:
                print(f"Event: {event.get('title')} (ID: {event.get('id')})")
                # Look at markets in this event
                markets = event.get('markets', [])
                for m in markets:
                    print(f"  - Market: {m.get('question')} (ID: {m.get('id')})")
                    print(f"    Outcomes: {m.get('outcomes')}")
                    print(f"    Outcome Prices: {m.get('outcomePrices')}")
        else:
            print(f"Error: {response.status_code}")
            print(response.text)

if __name__ == "__main__":
    asyncio.run(fetch_election_markets())
