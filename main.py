from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from src.data_collection.polymarket_client import PolymarketClient
from src.analysis.peb_algorithm import PEBAlgorithm
from src.data_collection.poll_scraper import PollScraper
from src.models.db_manager import DatabaseManager
import uvicorn

app = FastAPI(title="PolyElection API")

# Enable CORS for decoupled frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production should be more restrictive
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = PolymarketClient()
scraper = PollScraper()
db_manager = DatabaseManager()

@app.on_event("startup")
async def startup_event():
    await db_manager.init_db()

@app.get("/api/v1/opportunities")
async def get_opportunities():
    """Returns election events with PEB divergence analysis as JSON."""
    events = await client.get_global_election_dashboard()
    
    if not events:
        events = [
            {
                "id": "mock_usa",
                "title": "2026 美国参议院控制权",
                "description": "共和党还是民主党将在 2026 年中期选举后控制参议院？",
                "markets": [{"outcomePrices": ["0.47", "0.53"]}]
            },
            {
                "id": "mock_germany",
                "title": "2025 德国联邦大选",
                "description": "谁将成为下一任德国总理？",
                "markets": [{"outcomePrices": ["0.32", "0.68"]}]
            }
        ]
    
    processed_events = []
    for event in events:
        polls = await scraper.get_mock_polls(event.get('id'))
        peb_prob = PEBAlgorithm.calculate_weighted_probability(polls)
        
        market_price = 0.0
        markets = event.get('markets', [])
        if markets:
            prices = markets[0].get('outcomePrices', ["0.0"])
            try:
                market_price = float(prices[1]) if len(prices) > 1 else float(prices[0])
            except:
                market_price = 0.0
        
        divergence = PEBAlgorithm.calculate_divergence(peb_prob, market_price)
        
        processed_events.append({
            "id": event.get('id'),
            "title": event.get('title'),
            "description": event.get('description', ''),
            "peb_prob": round(peb_prob * 100, 1),
            "market_price": round(market_price * 100, 1),
            "divergence": round(divergence * 100, 1),
            "has_markets": len(markets) > 0
        })
    
    return {"status": "success", "data": processed_events}

@app.get("/api/v1/intelligence")
async def get_intelligence():
    """Returns political intelligence feed as JSON."""
    news_feed = [
        {"tag": "政策冲击", "title": "德国通胀数据超预期", "impact": "利空现任联合政府", "time": "15分钟前"},
        {"tag": "突发新闻", "title": "关键候选人宣布退选", "impact": "引发市场赔率震荡", "time": "1小时前"},
        {"tag": "民调更新", "title": "最新摇摆州民调发布", "impact": "选情陷入胶着", "time": "2小时前"}
    ]
    return {"status": "success", "data": news_feed}

@app.get("/api/v1/stats")
async def get_general_stats():
    """Returns general dashboard stats."""
    return {
        "active_elections": 12,
        "poll_sources": 15,
        "arbitrage_signals": 8
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
