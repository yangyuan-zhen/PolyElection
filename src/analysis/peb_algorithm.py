import math
from collections import defaultdict
from typing import Dict, List, Any

class PEBAlgorithm:
    """
    PEB (Poll Ensemble Blending) Algorithm.
    Successor to DEB (Dynamic Ensemble Blending) for elections.
    """
    
    @staticmethod
    def calculate_weighted_probability(polls: List[Dict[str, Any]], weights: Dict[str, float] = None) -> float:
        """
        Calculate blended probability from multiple polls.
        polls: List of dicts like {'pollster': 'YouGov', 'support': 0.48}
        weights: Map of pollster name to historical accuracy weight.
        """
        if not polls:
            return 0.0
            
        values = []
        final_weights = []
        
        for poll in polls:
            pollster = poll.get('pollster', 'Unknown')
            support = poll.get('support', 0.0)
            
            # Prefer row-level weight when present, otherwise use pollster weight map.
            if poll.get("weight") is not None:
                w = float(poll.get("weight", 1.0))
            else:
                w = weights.get(pollster, 1.0) if weights else 1.0
            
            values.append(support)
            final_weights.append(w)
            
        # Normalize weights
        total_w = sum(final_weights)
        if total_w == 0:
            return sum(values) / len(values)
            
        normalized_weights = [w / total_w for w in final_weights]
        weighted_avg = sum(v * w for v, w in zip(values, normalized_weights))
        
        return weighted_avg

    @staticmethod
    def calculate_candidate_support(
        polls: List[Dict[str, Any]],
        target_candidate: str,
    ) -> float:
        target = (target_candidate or "").strip().lower()
        if not target:
            return 0.0
        target_rows = [
            poll for poll in polls
            if str(poll.get("candidate") or "").strip().lower() == target
        ]
        return PEBAlgorithm.calculate_weighted_probability(target_rows)

    @staticmethod
    def estimate_win_probability(
        polls: List[Dict[str, Any]],
        target_candidate: str,
    ) -> float:
        target = (target_candidate or "").strip().lower()
        if not target:
            return 0.0

        support_by_candidate: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for poll in polls:
            candidate = str(poll.get("candidate") or "").strip()
            if candidate:
                support_by_candidate[candidate].append(poll)

        if not support_by_candidate:
            return 0.0

        weighted_supports = {
            candidate: PEBAlgorithm.calculate_weighted_probability(candidate_polls)
            for candidate, candidate_polls in support_by_candidate.items()
        }
        matching_name = next(
            (
                candidate
                for candidate in weighted_supports
                if candidate.strip().lower() == target
            ),
            None,
        )
        if matching_name is None:
            return 0.0

        target_support = weighted_supports[matching_name]
        competitor_supports = sorted(
            (
                support
                for candidate, support in weighted_supports.items()
                if candidate != matching_name
            ),
            reverse=True,
        )
        if not competitor_supports:
            return target_support

        runner_up_support = competitor_supports[0]
        margin = target_support - runner_up_support
        margin_probability = 100.0 / (1.0 + math.exp(-(margin / 4.5)))
        top_two_total = max(target_support + runner_up_support, 1.0)
        share_probability = 100.0 * (target_support / top_two_total)

        if margin >= 0:
            blended = (margin_probability * 0.7) + (share_probability * 0.3)
        else:
            blended = (margin_probability * 0.4) + (share_probability * 0.6)

        return max(0.0, min(99.0, blended))

    @staticmethod
    def calculate_divergence(peb_prob: float, market_price: float) -> float:
        """
        Calculate divergence between PEB prediction and market price.
        """
        return peb_prob - market_price
