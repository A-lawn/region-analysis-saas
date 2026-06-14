"""Stackelberg game theory solver -- simulated annealing + greedy follower"""
import numpy as np, random, time
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class GameSolution:
    leader_sites: List[str]
    follower_sites: List[str]
    leader_revenue: float
    follower_revenue: float
    cannibalization_pct: float
    market_share: Dict[str, float]
    demand_allocation: Dict[str, Dict[str, float]]
    solution_time_ms: float


@dataclass
class StoreInfo:
    id: str; lng: float; lat: float; area: float = 100.0; brand: float = 0.5
    extras: Dict[str, float] = field(default_factory=dict)


@dataclass
class DemandInfo:
    h3: str; lng: float; lat: float; population: float; consumption: float = 35.0


class StackelbergSolver:
    def __init__(self, leader_candidates, follower_candidates, demand_points, huff_params, distance_fn=None):
        self.L_sites = leader_candidates
        self.F_sites = follower_candidates
        self.demand = demand_points
        self.lambda_ = huff_params.get("lambda", 2.0)
        self.alpha_area = huff_params.get("alpha_area", 1.0)
        self.alpha_brand = huff_params.get("alpha_brand", 0.8)
        self._precompute_distances(distance_fn)

    def _precompute_distances(self, distance_fn):
        self.dist = {}
        all_sites = {s.id: s for s in self.L_sites + self.F_sites}
        for d in self.demand:
            self.dist[d.h3] = {}
            for sid, s in all_sites.items():
                self.dist[d.h3][sid] = distance_fn(sid, d.h3) if distance_fn else self._haversine(s.lng, s.lat, d.lng, d.lat)

    @staticmethod
    def _haversine(lng1, lat1, lng2, lat2):
        import math
        R = 6371000
        dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def _attraction(self, site): return (max(site.area,1.0)**self.alpha_area)*(max(site.brand,0.1)**self.alpha_brand)

    def _huff_probs(self, active_sites):
        attrs = {s.id: self._attraction(s) for s in active_sites}
        probs = {}
        for d in self.demand:
            nums, denom = {}, 0.0
            for s in active_sites:
                n = attrs[s.id] * np.exp(-self.lambda_ * self.dist[d.h3][s.id] / 1000.0)
                nums[s.id] = n; denom += n
            probs[d.h3] = {sid: n/denom for sid, n in nums.items()} if denom > 0 else {sid: 1.0/len(active_sites) for sid in nums}
        return probs

    def _compute_revenues(self, active_sites):
        probs = self._huff_probs(active_sites)
        revs = {s.id: 0.0 for s in active_sites}
        for d in self.demand:
            if d.h3 in probs:
                for sid, p in probs[d.h3].items(): revs[sid] += d.population * p * d.consumption
        return revs

    def solve_follower(self, leader_sites, q):
        if q == 0: return []
        selected, all_sites = [], list(leader_sites)
        for _ in range(q):
            best_site, best_rev = None, -1.0
            for f in [x for x in self.F_sites if x.id not in [s.id for s in selected]]:
                trial = all_sites + selected + [f]
                revs = self._compute_revenues(trial)
                fr = sum(revs.get(s.id,0) for s in selected+[f])
                if fr > best_rev: best_rev, best_site = fr, f
            if best_site: selected.append(best_site); all_sites.append(best_site)
        return selected

    def solve(self, leader_p, follower_q, iterations=200):
        t0 = time.time()
        current_L = random.sample(self.L_sites, min(leader_p, len(self.L_sites)))
        current_F = self.solve_follower(current_L, follower_q)
        revs = self._compute_revenues(current_L + current_F)
        current_value = sum(revs.get(s.id,0) for s in current_L)
        best_L, best_F, best_value = list(current_L), list(current_F), current_value
        T, T_min = 1.0, 0.01
        alpha_cool = (T_min/T)**(1.0/iterations)
        no_improve = 0

        logger.info("Game solver start: p=%d q=%d iters=%d init=%.0f", leader_p, follower_q, iterations, current_value)

        for it in range(iterations):
            new_L = list(current_L)
            idx = random.randrange(len(new_L))
            cands = [l for l in self.L_sites if l.id not in [s.id for s in new_L]]
            if cands: new_L[idx] = random.choice(cands)
            new_F = self.solve_follower(new_L, follower_q)
            revs = self._compute_revenues(new_L + new_F)
            new_value = sum(revs.get(s.id,0) for s in new_L)
            delta = new_value - current_value
            if delta > 0 or random.random() < np.exp(delta/max(T*abs(current_value)+1,1)):
                current_L, current_F, current_value = new_L, new_F, new_value
                no_improve = 0
                if current_value > best_value: best_L, best_F, best_value = list(current_L), list(current_F), current_value
            else: no_improve += 1
            T *= alpha_cool
            if no_improve >= 30: break

        elapsed_ms = (time.time()-t0)*1000
        all_sites = best_L + best_F
        final_revs = self._compute_revenues(all_sites)
        leader_rev = sum(final_revs.get(s.id,0) for s in best_L)
        follower_rev = sum(final_revs.get(s.id,0) for s in best_F)
        total = leader_rev + follower_rev
        alone = sum(self._compute_revenues(best_L).values())
        cann = ((alone-leader_rev)/alone*100) if alone>0 else 0
        probs = self._huff_probs(all_sites)

        logger.info("Game solved: L_rev=%.0f F_rev=%.0f cann=%.1f%% time=%.0fms", leader_rev, follower_rev, cann, elapsed_ms)

        return GameSolution(
            leader_sites=[s.id for s in best_L], follower_sites=[s.id for s in best_F],
            leader_revenue=round(leader_rev), follower_revenue=round(follower_rev),
            cannibalization_pct=round(cann,1),
            market_share={"leader": round(leader_rev/total,3) if total>0 else 0,
                          "follower": round(follower_rev/total,3) if total>0 else 0,
                          "uncovered": round(1-(leader_rev+follower_rev)/total,3) if total>0 else 1},
            demand_allocation={d.h3: {sid: round(p,4) for sid,p in probs.get(d.h3,{}).items()} for d in self.demand},
            solution_time_ms=round(elapsed_ms))

    def run_scenarios(self, leader_p, base_q, scenarios, iterations=200):
        results, all_combos = [], {}
        for sc in scenarios:
            q = sc.get("follower_q_override", base_q)
            sol = self.solve(leader_p, q, iterations)
            results.append({"label": sc.get("label", f"q={q}"), "type": sc.get("type","counter_attack"),
                            "leader_sites": sol.leader_sites, "leader_revenue": sol.leader_revenue,
                            "follower_sites": sol.follower_sites, "follower_revenue": sol.follower_revenue,
                            "cannibalization_pct": sol.cannibalization_pct, "market_share": sol.market_share})
            k = tuple(sorted(sol.leader_sites))
            all_combos.setdefault(k, []).append(sol.leader_revenue)
        best_min, robust = -float("inf"), results[0]["leader_sites"] if results else []
        for combo, revs in all_combos.items():
            mr = min(revs)
            if mr > best_min: best_min, robust = mr, list(combo)
        return {"scenarios": results, "robust_solution": {"sites": robust, "min_revenue_across_scenarios": round(best_min)}}
