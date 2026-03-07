from typing import Any, Dict, List, Optional


PREDICTION_CONFIDENCE_LABELS = {
    "very_high": "极高把握",
    "high": "高把握",
    "medium": "中等把握",
    "low": "低把握",
}

PRICING_REGIME_LABELS = {
    "market_undervalued": "市场低估",
    "market_overvalued": "市场高估",
    "cross_exchange_gap": "跨所价差",
    "fair_value": "定价接近公允",
}

TRADE_ACTION_LABELS = {
    "buy": "做多",
    "trim": "减仓",
    "monitor": "跟踪",
    "watch": "观望",
}

TRADE_REASON_LABELS = {
    "model_edge_confirmed": "真实模型和交易所价格共同确认存在正向边际",
    "market_overpriced_vs_model": "市场价格显著高于模型估值",
    "edge_exists_but_needs_confirmation": "有边际，但还需要更多确认",
    "no_clear_edge": "暂时没有足够明确的错价",
    "cross_exchange_gap_without_model": "跨交易所存在价差，但缺少真实模型确认",
    "no_verified_edge": "缺少真实模型或明确错价，先不下交易指令",
}


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _leader_gap(opportunity: Dict[str, Any]) -> float:
    board = opportunity.get("candidate_board") or []
    if not isinstance(board, list) or not board:
        return 0.0
    leader = _to_float((board[0] or {}).get("probability"))
    runner_up = _to_float((board[1] or {}).get("probability")) if len(board) > 1 else 0.0
    return round(max(leader - runner_up, 0.0), 1)


def _leader_name(opportunity: Dict[str, Any]) -> str:
    board = opportunity.get("candidate_board") or []
    if not isinstance(board, list) or not board:
        return str(opportunity.get("outcome_label_zh") or opportunity.get("outcome_label") or "当前主导结果")
    leader = board[0] or {}
    return str(leader.get("name_zh") or leader.get("name") or "当前主导结果")


def _prediction_confidence(market_price: float, leader_gap: float) -> str:
    if market_price >= 85 or leader_gap >= 25:
        return "very_high"
    if market_price >= 70 or leader_gap >= 12:
        return "high"
    if market_price >= 55 or leader_gap >= 5:
        return "medium"
    return "low"


def _pricing_regime(
    divergence: float,
    kalshi_gap: Optional[float],
    has_real_model: bool,
) -> str:
    if has_real_model and divergence >= 7:
        return "market_undervalued"
    if has_real_model and divergence <= -7:
        return "market_overvalued"
    if kalshi_gap is not None and abs(kalshi_gap) >= 6:
        return "cross_exchange_gap"
    return "fair_value"


def _trade_signal(
    *,
    divergence: float,
    kalshi_gap: Optional[float],
    has_real_model: bool,
    days_left: Optional[int],
) -> Dict[str, str]:
    safe_days_left = days_left if isinstance(days_left, int) else None

    if has_real_model:
        if divergence >= 7 and (kalshi_gap is None or kalshi_gap >= -1) and (safe_days_left is None or safe_days_left > 2):
            return {
                "trade_action": "buy",
                "trade_reason": "model_edge_confirmed",
            }
        if divergence <= -7 and (kalshi_gap is None or kalshi_gap <= 1):
            return {
                "trade_action": "trim",
                "trade_reason": "market_overpriced_vs_model",
            }
        if abs(divergence) >= 4 or (kalshi_gap is not None and abs(kalshi_gap) >= 4):
            return {
                "trade_action": "monitor",
                "trade_reason": "edge_exists_but_needs_confirmation",
            }
        return {
            "trade_action": "watch",
            "trade_reason": "no_clear_edge",
        }

    if kalshi_gap is not None and abs(kalshi_gap) >= 6:
        return {
            "trade_action": "monitor",
            "trade_reason": "cross_exchange_gap_without_model",
        }
    return {
        "trade_action": "watch",
        "trade_reason": "no_verified_edge",
    }


def _prediction_summary(
    leader_name: str,
    confidence: str,
    market_price: float,
    leader_gap: float,
) -> str:
    if confidence == "very_high":
        return f"{leader_name} 当前胜面很高，主市场概率 {market_price:.1f}%，与第二名拉开 {leader_gap:.1f}pt。"
    if confidence == "high":
        return f"{leader_name} 仍然明显领先，主市场概率 {market_price:.1f}%，领先差 {leader_gap:.1f}pt。"
    if confidence == "medium":
        return f"{leader_name} 保持领先，但市场仍有一定波动空间，当前概率 {market_price:.1f}%。"
    return f"当前领先优势有限，{leader_name} 的主市场概率为 {market_price:.1f}%。"


def _trade_summary(
    trade_action: str,
    trade_reason: str,
    pricing_regime: str,
    divergence: float,
    kalshi_gap: Optional[float],
    has_real_model: bool,
) -> str:
    if trade_action == "buy":
        return f"真实模型相对盘口存在 {divergence:+.1f}pt 正向边际，且跨所价格未明显反向，适合做多。"
    if trade_action == "trim":
        return f"真实模型相对盘口存在 {divergence:+.1f}pt 负向边际，当前更适合减仓而不是追价。"
    if trade_action == "monitor" and pricing_regime == "cross_exchange_gap" and kalshi_gap is not None:
        return f"Polymarket 与 Kalshi 存在 {kalshi_gap:+.1f}pt 价差，但还缺少足够模型确认，先跟踪。"
    if trade_action == "monitor":
        return f"当前有初步价差信号，但证据还不够一致，先跟踪验证。"
    if not has_real_model:
        return "当前没有可验证的真实民调模型支撑，虽然谁更可能赢比较清楚，但还不足以下交易指令。"
    return "盘口与模型整体接近，当前更像高确定性低边际的盘面，适合观望。"


def enrich_opportunities_with_signals(
    opportunities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    for opportunity in opportunities:
        market_price = _to_float(opportunity.get("market_price"))
        peb_prob = _to_float(opportunity.get("peb_prob"), market_price)
        kalshi_prob_raw = opportunity.get("kalshi_prob")
        kalshi_prob = _to_float(kalshi_prob_raw) if kalshi_prob_raw is not None else None
        divergence = round(peb_prob - market_price, 1)
        kalshi_gap = None if kalshi_prob is None else round(kalshi_prob - market_price, 1)
        model_source = str(opportunity.get("peb_source") or "market-blend")
        has_real_model = model_source == "real-polls"
        leader_gap = _leader_gap(opportunity)
        leader_name = _leader_name(opportunity)
        days_left = opportunity.get("days_left")

        trade_signal = _trade_signal(
            divergence=divergence,
            kalshi_gap=kalshi_gap,
            has_real_model=has_real_model,
            days_left=days_left if isinstance(days_left, int) else None,
        )

        consensus_inputs = [market_price, peb_prob]
        if kalshi_prob is not None:
            consensus_inputs.append(kalshi_prob)
        consensus_price = round(sum(consensus_inputs) / len(consensus_inputs), 1)

        confidence = _prediction_confidence(market_price, leader_gap)
        pricing_regime = _pricing_regime(divergence, kalshi_gap, has_real_model)
        trade_action = trade_signal["trade_action"]
        trade_reason = trade_signal["trade_reason"]

        opportunity["divergence"] = divergence
        opportunity["market_kalshi_gap"] = kalshi_gap
        opportunity["consensus_price"] = consensus_price
        opportunity["leader_gap"] = leader_gap
        opportunity["prediction_confidence"] = confidence
        opportunity["prediction_confidence_label"] = PREDICTION_CONFIDENCE_LABELS[confidence]
        opportunity["pricing_regime"] = pricing_regime
        opportunity["pricing_regime_label"] = PRICING_REGIME_LABELS[pricing_regime]
        opportunity["trade_action"] = trade_action
        opportunity["trade_action_label"] = TRADE_ACTION_LABELS[trade_action]
        opportunity["trade_reason"] = trade_reason
        opportunity["trade_reason_label"] = TRADE_REASON_LABELS[trade_reason]
        opportunity["has_real_model"] = has_real_model
        opportunity["winner_view"] = "leader_likely" if confidence in {"very_high", "high"} else "competitive"
        opportunity["winner_view_label"] = (
            "领跑者大概率胜出" if confidence in {"very_high", "high"} else "竞争仍未结束"
        )
        opportunity["prediction_summary_zh"] = _prediction_summary(
            leader_name,
            confidence,
            market_price,
            leader_gap,
        )
        opportunity["trade_summary_zh"] = _trade_summary(
            trade_action,
            trade_reason,
            pricing_regime,
            divergence,
            kalshi_gap,
            has_real_model,
        )

    return opportunities
