import numpy as np
import pandas as pd
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
            
            # Use provided weight or default to 1.0
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
    def calculate_divergence(peb_prob: float, market_price: float) -> float:
        """
        Calculate divergence between PEB prediction and market price.
        """
        return peb_prob - market_price
