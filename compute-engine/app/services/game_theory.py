"""Stackelberg game theory solver -- simulated annealing + greedy follower
Optimised: incremental probability updates, caching, early-convergence, multi-start
"""
import numpy as np, random, time, math
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
        # Pre-compute base attraction for ALL sites (leader + follower)
        self._base_attr = {}
        for s in leader_candidates + follower_candidates:
            self._base_attr[s.id] = self._attraction(s)
        self._precompute_distances(distance_fn)
        # Cached raw numerators (attraction × exp(-λ*dist/1000)) keyed by (demand_h3, site_id)
        self._raw_num = {}
        for d in self.demand:
            for sid in self._base_attr:
                self._raw_num[(d.h3, sid)] = self._base_attr[sid] * np.exp(
                    -self.lambda_ * self.dist[d.h3][sid] / 1000.0
                )

    def _precompute_distances(self, distance_fn):
        self.dist = {}
        all_sites = {s.id: s for s in self.L_sites + self.F_sites}
        for d in self.demand:
            self.dist[d.h3] = {}
            for sid, s in all_sites.items():
                self.dist[d.h3][sid] = distance_fn(sid, d.h3) if distance_fn else self._haversine(s.lng, s.lat, d.lng, d.lat)

    @staticmethod
    def _haversine(lng1, lat1, lng2, lat2):
        R = 6371000
        dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def _attraction(self, site): return (max(site.area,1.0)**self.alpha_area)*(max(site.brand,0.1)**self.alpha_brand)

    # ------------------------------------------------------------------
    # Incremental probability helpers
    # ------------------------------------------------------------------

    def _init_state(self, site_ids):
        """Build the mutable state for a set of active site ids.
        Returns (probs, denominators) where:
          probs[d.h3] = dict site_id -> probability
          denom[d.h3] = float sum of raw numerators
        """
        probs = {}
        denom = {}
        for d in self.demand:
            nums = {}
            total = 0.0
            for sid in site_ids:
                n = self._raw_num[(d.h3, sid)]
                nums[sid] = n
                total += n
            if total > 0:
                probs[d.h3] = {sid: n / total for sid, n in nums.items()}
            else:
                n_sites = max(len(site_ids), 1)
                probs[d.h3] = {sid: 1.0 / n_sites for sid in nums}
                total = 0.0
            denom[d.h3] = total
        return probs, denom

    def _add_site(self, probs, denom, new_site_id):
        """Incrementally add a single site. O(n_demand)"""
        for d in self.demand:
            n = self._raw_num[(d.h3, new_site_id)]
            old_denom = denom[d.h3]
            if old_denom > 0:
                new_denom = old_denom + n
                scale = old_denom / new_denom
                for sid in probs[d.h3]:
                    probs[d.h3][sid] *= scale
                probs[d.h3][new_site_id] = n / new_denom
                denom[d.h3] = new_denom
            else:
                # Previously empty set — initialise with this single site
                probs[d.h3] = {new_site_id: 1.0}
                denom[d.h3] = n

    def _remove_site(self, probs, denom, old_site_id):
        """Incrementally remove a single site. O(n_demand)"""
        for d in self.demand:
            if old_site_id not in probs.get(d.h3, {}):
                continue
            old_p = probs[d.h3][old_site_id]
            del probs[d.h3][old_site_id]
            remaining = 1.0 - old_p
            if remaining > 0 and probs[d.h3]:
                scale = 1.0 / remaining
                for sid in probs[d.h3]:
                    probs[d.h3][sid] *= scale
            elif not probs[d.h3]:
                # All sites removed
                probs[d.h3] = {}
            denom[d.h3] -= self._raw_num[(d.h3, old_site_id)]

    def _probs_to_revs(self, probs, site_ids):
        """Sum demand-weighted probabilities into per-site revenue."""
        revs = {sid: 0.0 for sid in site_ids}
        for d in self.demand:
            pd = probs.get(d.h3, {})
            for sid in site_ids:
                revs[sid] += d.population * pd.get(sid, 0.0) * d.consumption
        return revs

    # ------------------------------------------------------------------
    # Public method – kept for backward compatibility
    # ------------------------------------------------------------------

    def _huff_probs(self, active_sites):
        probs, _ = self._init_state([s.id for s in active_sites])
        return probs

    def _compute_revenues(self, active_sites):
        sids = [s.id for s in active_sites]
        probs, _ = self._init_state(sids)
        return self._probs_to_revs(probs, sids)

    # ------------------------------------------------------------------
    # Greedy follower with caching
    # ------------------------------------------------------------------

    def solve_follower(self, leader_sites, q):
        if q == 0:
            return []
        # Seed state with leader sites
        base_sids = [s.id for s in leader_sites]
        base_probs, base_denom = self._init_state(base_sids)
        base_revs = self._probs_to_revs(base_probs, base_sids)

        selected = []
        # Pre‑compute base-attraction scores for every Follower candidate
        f_candidates = {f.id: f for f in self.F_sites}
        state_probs = {(): (base_probs, base_denom, base_revs)}

        for step in range(q):
            best_sid, best_rev = None, -1.0
            current_key = tuple(s.id for s in selected)
            cur_probs, cur_denom, cur_revs = state_probs[current_key]

            for f in self.F_sites:
                if f.id in base_sids or f.id in [s.id for s in selected]:
                    continue
                # Incrementally add candidate
                cand_probs = {d.h3: dict(cur_probs[d.h3]) for d in self.demand}
                cand_denom = dict(cur_denom)
                self._add_site(cand_probs, cand_denom, f.id)
                cand_revs = self._probs_to_revs(cand_probs, base_sids + [s.id for s in selected] + [f.id])
                fr = sum(cand_revs.get(f.id, 0) for f in selected + [f])
                if fr > best_rev:
                    best_rev, best_sid = fr, f.id

            if best_sid:
                selected_f = next(s for s in self.F_sites if s.id == best_sid)
                selected.append(selected_f)
                # Update persistent state for the new selection
                new_probs = {d.h3: dict(base_probs[d.h3]) for d in self.demand}
                new_denom = dict(base_denom)
                for prev in selected:
                    self._add_site(new_probs, new_denom, prev.id)
                new_revs = self._probs_to_revs(new_probs, base_sids + [s.id for s in selected])
                new_key = tuple(s.id for s in selected)
                state_probs[new_key] = (new_probs, new_denom, new_revs)

        return selected

    # ------------------------------------------------------------------
    # KL-divergence early-convergence helper
    # ------------------------------------------------------------------

    def _kl_divergence(self, probs_a, probs_b):
        """Average KL divergence across all demand points."""
        total_kl = 0.0
        count = 0
        for d in self.demand:
            pa = probs_a.get(d.h3, {})
            pb = probs_b.get(d.h3, {})
            all_sids = set(pa.keys()) | set(pb.keys())
            if not all_sids:
                continue
            kl = 0.0
            for sid in all_sids:
                p = max(pa.get(sid, 0.0), 1e-12)
                q = max(pb.get(sid, 0.0), 1e-12)
                kl += p * math.log(p / q)
            total_kl += kl
            count += 1
        return total_kl / max(count, 1)

    # ------------------------------------------------------------------
    # Main solver with multi‑start and early convergence
    # ------------------------------------------------------------------

    def solve(self, leader_p, follower_q, iterations=200, num_starts=3):
        best_L, best_F, best_value = None, None, -float("inf")
        best_result = None
        results_log = []

        for start_idx in range(num_starts):
            L, F, value, elapsed = self._solve_single_start(
                leader_p, follower_q, iterations, start_idx
            )
            results_log.append({
                "start": start_idx,
                "leader_sites": [s.id for s in L],
                "follower_sites": [s.id for s in F],
                "leader_value": round(value),
                "elapsed_ms": round(elapsed),
            })
            logger.info(
                "Multi-start %d/%d: value=%.0f L=%s F=%s time=%.0fms",
                start_idx + 1,
                num_starts,
                value,
                [s.id for s in L],
                [s.id for s in F],
                elapsed,
            )
            if value > best_value:
                best_value = value
                best_L, best_F = list(L), list(F)

        t0 = time.time()
        all_sites = best_L + best_F
        sids = [s.id for s in all_sites]
        probs, _ = self._init_state(sids)
        final_revs = self._probs_to_revs(probs, sids)
        leader_rev = sum(final_revs.get(s.id, 0) for s in best_L)
        follower_rev = sum(final_revs.get(s.id, 0) for s in best_F)
        total = leader_rev + follower_rev
        alone_probs, _ = self._init_state([s.id for s in best_L])
        alone = sum(self._probs_to_revs(alone_probs, [s.id for s in best_L]).values())
        cann = ((alone - leader_rev) / alone * 100) if alone > 0 else 0

        elapsed_ms = (time.time() - t0) * 1000 + sum(r["elapsed_ms"] for r in results_log)

        logger.info(
            "Game solved: L_rev=%.0f F_rev=%.0f cann=%.1f%% time=%.0fms starts=%d",
            leader_rev, follower_rev, cann, elapsed_ms, num_starts,
        )

        return GameSolution(
            leader_sites=[s.id for s in best_L],
            follower_sites=[s.id for s in best_F],
            leader_revenue=round(leader_rev),
            follower_revenue=round(follower_rev),
            cannibalization_pct=round(cann, 1),
            market_share={
                "leader": round(leader_rev / total, 3) if total > 0 else 0,
                "follower": round(follower_rev / total, 3) if total > 0 else 0,
                "uncovered": round(1 - (leader_rev + follower_rev) / total, 3) if total > 0 else 1,
            },
            demand_allocation={
                d.h3: {sid: round(p, 4) for sid, p in probs.get(d.h3, {}).items()}
                for d in self.demand
            },
            solution_time_ms=round(elapsed_ms),
        )

    def _solve_single_start(self, leader_p, follower_q, iterations, start_index):
        """Single simulated‑annealing run with early-convergence detection."""
        t0 = time.time()
        current_L = random.sample(self.L_sites, min(leader_p, len(self.L_sites)))
        current_F = self.solve_follower(current_L, follower_q)
        current_sids = [s.id for s in current_L] + [s.id for s in current_F]
        current_probs, current_denom = self._init_state(current_sids)
        current_revs = self._probs_to_revs(current_probs, current_sids)
        current_value = sum(current_revs.get(s.id, 0) for s in current_L)

        best_L, best_F, best_value = list(current_L), list(current_F), current_value
        best_probs = {d.h3: dict(current_probs[d.h3]) for d in self.demand}

        T, T_min = 1.0, 0.01
        alpha_cool = (T_min / T) ** (1.0 / iterations)
        no_improve = 0
        kl_stable = 0
        prev_probs = None

        for it in range(iterations):
            # --- propose a new leader configuration ---
            new_L = list(current_L)
            idx = random.randrange(len(new_L))
            cands = [l for l in self.L_sites if l.id not in [s.id for s in new_L]]
            if not cands:
                continue
            new_L[idx] = random.choice(cands)

            # --- compute new follower ---
            new_F = self.solve_follower(new_L, follower_q)

            # Build probabilities incrementally:
            # 1. Remove the site that was swapped out, add the new one
            removed_id = current_L[idx].id
            added_site = new_L[idx]

            new_sids = [s.id for s in new_L] + [s.id for s in new_F]
            new_probs = {d.h3: dict(current_probs[d.h3]) for d in self.demand}
            new_denom = dict(current_denom)

            # Adjust for leader swap + follower changes
            # Full rebuild is simplest and correct for now (dominated by solve_follower cost)
            new_probs, new_denom = self._init_state(new_sids)

            new_revs = self._probs_to_revs(new_probs, new_sids)
            new_value = sum(new_revs.get(s.id, 0) for s in new_L)

            # --- SA acceptance ---
            delta = new_value - current_value
            if delta > 0 or random.random() < np.exp(delta / max(T * abs(current_value) + 1, 1)):
                current_L, current_F, current_value = new_L, new_F, new_value
                current_probs = new_probs
                current_denom = new_denom
                no_improve = 0
                if current_value > best_value:
                    best_L, best_F, best_value = list(current_L), list(current_F), current_value
                    best_probs = {d.h3: dict(current_probs[d.h3]) for d in self.demand}
            else:
                no_improve += 1

            T *= alpha_cool

            # --- KL early-convergence ---
            if prev_probs is not None:
                kl = self._kl_divergence(current_probs, prev_probs)
                if kl < 0.001:
                    kl_stable += 1
                else:
                    kl_stable = 0
            prev_probs = {d.h3: dict(current_probs[d.h3]) for d in self.demand}
            if kl_stable >= 5:
                logger.info(
                    "Early convergence at iteration %d (KL stable < 0.001 for 5 iters)",
                    it + 1,
                )
                break

            if no_improve >= 30:
                break

        elapsed_ms = (time.time() - t0) * 1000
        return best_L, best_F, best_value, elapsed_ms

    # ------------------------------------------------------------------
    # Scenario runner (unchanged public API)
    # ------------------------------------------------------------------

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
