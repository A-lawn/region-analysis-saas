"""Stackelberg game theory solver -- simulated annealing + greedy follower
Optimised: incremental probability updates, caching, early-convergence, multi-start
"""
import numpy as np, random, time, math
from dataclasses import dataclass, field
from collections import Counter
from typing import List, Dict, Tuple, Optional, Any
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
class RobustGameSolution:
    """Robust solution with uncertainty-aware stability analysis"""
    base_solution: GameSolution
    stability_score: float
    selection_frequencies: Dict[str, int]
    sensitivity_warning: Optional[str]
    perturbation_runs: int
    perturbed_solutions: List[Dict[str, Any]]

@dataclass
class StoreInfo:
    id: str; lng: float; lat: float; area: float = 100.0; brand: float = 0.5
    extras: Dict[str, float] = field(default_factory=dict)


@dataclass
class DemandInfo:
    h3: str; lng: float; lat: float; population: float; consumption: float = 35.0


class StackelbergSolver:

    # Industry hard constraints from KPI spec
    INDUSTRY_HARD_CONSTRAINTS: Dict[str, Dict[str, Any]] = {
        "pharmacy": {
            "filter_type": "competitor_distance_hard",
            "competitor_distance_hard_threshold_m": 350,
            "competitor_distance_hard_direction": "lt",
            "description": "competitor < 350m -> candidate eliminated",
        },
        "auto4s": {
            "filter_type": "land_cap",
            "land_not_commercial_industrial_cap": 0.3,
            "description": "non-commercial/industrial land -> score capped at 0.3",
        },
    }
    def __init__(self, leader_candidates, follower_candidates, demand_points, huff_params, distance_fn=None):
        self.L_sites = leader_candidates
        self.F_sites = follower_candidates
        self.demand = demand_points
        self.lambda_ = huff_params.get("lambda", 2.0)
        self.alpha_area = huff_params.get("alpha_area", 1.0)
        self.alpha_brand = huff_params.get("alpha_brand", 0.8)
        self._base_attr = {}
        for s in leader_candidates + follower_candidates:
            self._base_attr[s.id] = self._attraction(s)
        self._precompute_distances(distance_fn)
        self._raw_num = {}
        for d in self.demand:
            inner = {}
            for sid in self._base_attr:
                inner[sid] = self._base_attr[sid] * np.exp(
                    -self.lambda_ * self.dist[d.h3][sid] / 1000.0
                )
            self._raw_num[d.h3] = inner

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
    # NumPy-vectorized helpers
    # ------------------------------------------------------------------

    def _init_denom_probs(self, site_ids):
        n_d = len(self.demand)
        site_index = {sid: i for i, sid in enumerate(site_ids)}
        denom = np.zeros(n_d, dtype=np.float64)
        probs = np.zeros((n_d, len(site_ids)), dtype=np.float64)
        for di, d in enumerate(self.demand):
            total = 0.0
            raw = self._raw_num[d.h3]
            for si, sid in enumerate(site_ids):
                n = raw[sid]
                probs[di, si] = n
                total += n
            if total > 0:
                probs[di, :] /= total
            else:
                n_s = max(len(site_ids), 1)
                probs[di, :] = 1.0 / n_s
            denom[di] = total
        return denom, probs, site_index

    def _huff_probs(self, active_sites):
        sids = [s.id for s in active_sites]
        _, probs, _ = self._init_denom_probs(sids)
        result = {}
        for di, d in enumerate(self.demand):
            result[d.h3] = {sid: float(probs[di, si]) for si, sid in enumerate(sids)}
        return result

    def _compute_revenues(self, active_sites):
        sids = [s.id for s in active_sites]
        _, probs, _ = self._init_denom_probs(sids)
        return self._probs_to_revs_vec(sids, probs)

    @property
    def _pop_consumption(self):
        if not hasattr(self, "_pop_cons"):
            self._pop_cons = np.array([d.population * d.consumption for d in self.demand], dtype=np.float64)
        return self._pop_cons

    def _probs_to_revs_vec(self, sids, probs):
        revs = {}
        for si, sid in enumerate(sids):
            revs[sid] = float(np.sum(self._pop_consumption * probs[:, si]))
        return revs

    # ------------------------------------------------------------------
    # Fast greedy follower
    # ------------------------------------------------------------------

    def solve_follower(self, leader_sites, q):
        if q == 0:
            return []
        leader_sids = [s.id for s in leader_sites]
        selected_sids = []
        f_ids = [f.id for f in self.F_sites if f.id not in leader_sids]
        if not f_ids:
            return []
        cur_denom = np.array([sum(self._raw_num[d.h3].get(sid, 0) for sid in leader_sids) for d in self.demand], dtype=np.float64)
        for _ in range(q):
            remaining = [fid for fid in f_ids if fid not in selected_sids]
            if not remaining:
                break
            best_fid, best_rev = None, -1.0
            for fid in remaining:
                raw_col = np.array([self._raw_num[d.h3][fid] for d in self.demand], dtype=np.float64)
                new_denom = np.where(cur_denom > 0, cur_denom + raw_col, raw_col)
                fid_prob = np.where(new_denom > 0, raw_col / new_denom, 0.0)
                fid_rev = float(np.sum(self._pop_consumption * fid_prob))
                if fid_rev > best_rev:
                    best_rev = fid_rev
                    best_fid = fid
            if best_fid:
                selected_sids.append(best_fid)
                raw_col = np.array([self._raw_num[d.h3][best_fid] for d in self.demand], dtype=np.float64)
                cur_denom = np.where(cur_denom > 0, cur_denom + raw_col, raw_col)
        selected = [next(s for s in self.F_sites if s.id == sid) for sid in selected_sids]
        return selected

    # ------------------------------------------------------------------
    # KL-divergence helpers
    # ------------------------------------------------------------------

    def _kl_divergence(self, probs_a, probs_b):
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

    def _kl_divergence_vec(self, probs_a, probs_b, sids_a, sids_b):
        all_sids = list(dict.fromkeys(sids_a + sids_b))
        idx_a = {sid: i for i, sid in enumerate(sids_a)}
        idx_b = {sid: i for i, sid in enumerate(sids_b)}
        n_d = len(self.demand)
        pa = np.zeros((n_d, len(all_sids)), dtype=np.float64)
        pb = np.zeros((n_d, len(all_sids)), dtype=np.float64)
        for i, sid in enumerate(all_sids):
            if sid in idx_a:
                pa[:, i] = probs_a[:, idx_a[sid]]
            if sid in idx_b:
                pb[:, i] = probs_b[:, idx_b[sid]]
        pa = np.maximum(pa, 1e-12)
        pb = np.maximum(pb, 1e-12)
        kl_per_demand = np.sum(pa * np.log(pa / pb), axis=1)
        return float(np.mean(kl_per_demand))

    # ------------------------------------------------------------------
    # Main solver with multi-start and early convergence
    # ------------------------------------------------------------------

    def solve(self, leader_p, follower_q, iterations=200, num_starts=3):
        best_L, best_F, best_value = None, None, -float("inf")
        results_log = []
        for start_idx in range(num_starts):
            L, F, value, elapsed = self._solve_single_start(leader_p, follower_q, iterations, start_idx)
            results_log.append({
                "start": start_idx,
                "leader_sites": [s.id for s in L],
                "follower_sites": [s.id for s in F],
                "leader_value": round(value),
                "elapsed_ms": round(elapsed),
            })
            logger.info("Multi-start %d/%d: value=%.0f L=%s F=%s time=%.0fms",
                        start_idx + 1, num_starts, value, [s.id for s in L], [s.id for s in F], elapsed)
            if value > best_value:
                best_value = value
                best_L, best_F = list(L), list(F)
        t0 = time.time()
        all_sites = best_L + best_F
        all_sids = [s.id for s in all_sites]
        _, probs, _ = self._init_denom_probs(all_sids)
        final_revs = self._probs_to_revs_vec(all_sids, probs)
        leader_rev = sum(final_revs.get(s.id, 0) for s in best_L)
        follower_rev = sum(final_revs.get(s.id, 0) for s in best_F)
        total = leader_rev + follower_rev
        _, alone_probs, _ = self._init_denom_probs([s.id for s in best_L])
        alone = sum(self._probs_to_revs_vec([s.id for s in best_L], alone_probs).values())
        cann = ((alone - leader_rev) / alone * 100) if alone > 0 else 0
        elapsed_ms = (time.time() - t0) * 1000 + sum(r["elapsed_ms"] for r in results_log)
        logger.info("Game solved: L_rev=%.0f F_rev=%.0f cann=%.1f%% time=%.0fms starts=%d",
                    leader_rev, follower_rev, cann, elapsed_ms, num_starts)
        demand_alloc = {}
        for di, d in enumerate(self.demand):
            demand_alloc[d.h3] = {sid: round(float(probs[di, si]), 4) for si, sid in enumerate(all_sids)}
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
            demand_allocation=demand_alloc,
            solution_time_ms=round(elapsed_ms),
        )

    def _solve_single_start(self, leader_p, follower_q, iterations, start_index):
        t0 = time.time()
        current_L = random.sample(self.L_sites, min(leader_p, len(self.L_sites)))
        current_F = self.solve_follower(current_L, follower_q)
        current_sids = [s.id for s in current_L] + [s.id for s in current_F]
        current_denom, current_probs, current_idx = self._init_denom_probs(current_sids)
        current_revs = self._probs_to_revs_vec(current_sids, current_probs)
        current_value = sum(current_revs.get(s.id, 0) for s in current_L)
        best_L, best_F, best_value = list(current_L), list(current_F), current_value
        T, T_min = 1.0, 0.01
        alpha_cool = (T_min / T) ** (1.0 / iterations)
        no_improve = 0
        kl_stable = 0
        prev_probs = None
        for it in range(iterations):
            new_L = list(current_L)
            idx = random.randrange(len(new_L))
            cands = [l for l in self.L_sites if l.id not in [s.id for s in new_L]]
            if not cands:
                continue
            new_L[idx] = random.choice(cands)
            new_F = self.solve_follower(new_L, follower_q)
            new_sids = [s.id for s in new_L] + [s.id for s in new_F]
            new_denom, new_probs, new_idx = self._init_denom_probs(new_sids)
            new_revs = self._probs_to_revs_vec(new_sids, new_probs)
            new_value = sum(new_revs.get(s.id, 0) for s in new_L)
            delta = new_value - current_value
            if delta > 0 or random.random() < np.exp(delta / max(T * abs(current_value) + 1, 1)):
                current_L, current_F, current_value = new_L, new_F, new_value
                current_denom, current_probs, current_idx = new_denom, new_probs, new_idx
                current_sids = new_sids
                no_improve = 0
                if current_value > best_value:
                    best_L, best_F, best_value = list(current_L), list(current_F), current_value
            else:
                no_improve += 1
            T *= alpha_cool
            if prev_probs is not None:
                kl = self._kl_divergence_vec(current_probs, prev_probs, current_sids, prev_sids)
                if kl < 0.001:
                    kl_stable += 1
                else:
                    kl_stable = 0
            prev_probs = current_probs.copy()
            prev_sids = list(current_sids)
            if kl_stable >= 5:
                logger.info("Early convergence at iteration %d (KL stable < 0.001 for 5 iters)", it + 1)
                break
            if no_improve >= 30:
                break
        elapsed_ms = (time.time() - t0) * 1000
        return best_L, best_F, best_value, elapsed_ms

    # ------------------------------------------------------------------
    # Scenario runner
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


    # ------------------------------------------------------------------
    # P0: Hard constraint filtering
    # ------------------------------------------------------------------

    def filter_candidates(self, industry, site_kpi_values=None):
        """Filter leader/follower candidates based on industry hard constraints."""
        report = {"industry": industry, "before_L": len(self.L_sites), "before_F": len(self.F_sites),
                   "eliminated_L": [], "eliminated_F": [], "capped": []}
        constraint = self.INDUSTRY_HARD_CONSTRAINTS.get(industry, {})
        if not constraint:
            report["action"] = "no_constraints"
            return self.L_sites, self.F_sites, report

        filter_type = constraint.get("filter_type", "")
        if filter_type == "competitor_distance_hard":
            fl, report = self._filter_competitor_distance(self.L_sites, constraint, report, "L")
            ff, report = self._filter_competitor_distance(self.F_sites, constraint, report, "F")
            report["after_L"] = len(fl); report["after_F"] = len(ff)
            report["action"] = "competitor_distance_hard"
            return fl, ff, report
        elif filter_type == "land_cap":
            fl, report = self._filter_land_cap(self.L_sites, constraint, report, "L")
            ff, report = self._filter_land_cap(self.F_sites, constraint, report, "F")
            report["after_L"] = len(fl); report["after_F"] = len(ff)
            report["action"] = "land_cap"
            return fl, ff, report
        else:
            return self._filter_generic_hard(industry, site_kpi_values, constraint)

    def _filter_competitor_distance(self, sites, constraint, report, tag):
        threshold = constraint["competitor_distance_hard_threshold_m"]
        direction = constraint.get("competitor_distance_hard_direction", "lt")
        kept = []
        for s in sites:
            dist = s.extras.get("competitor_distance", self._min_competitor_distance(s))
            fail = (direction == "lt" and dist < threshold) or (direction == "gt" and dist > threshold)
            if fail:
                report[f"eliminated_{tag}"].append({"id": s.id, "distance_m": round(dist, 1), "threshold_m": threshold})
            else:
                kept.append(s)
        return kept, report

    def _filter_land_cap(self, sites, constraint, report, tag):
        cap = constraint["land_not_commercial_industrial_cap"]
        kept = []
        for s in sites:
            land_type = s.extras.get("land_type", "")
            if land_type not in ("commercial", "industrial"):
                report["capped"].append({"id": s.id, "land_type": land_type, "cap": cap})
            kept.append(s)
        return kept, report

    def _filter_generic_hard(self, industry, site_kpi_values, constraint):
        report = {"industry": industry, "before_L": len(self.L_sites), "before_F": len(self.F_sites),
                   "action": "generic_hard", "eliminated_L": [], "eliminated_F": []}
        if not site_kpi_values:
            return self.L_sites, self.F_sites, report
        fl, ff = list(self.L_sites), list(self.F_sites)
        for tag, sites in [("L", fl), ("F", ff)]:
            kept = []
            for s in sites:
                kpis = site_kpi_values.get(s.id, {})
                if self._check_hard_filters(kpis, constraint.get("hardFilter_kpis", [])):
                    kept.append(s)
                else:
                    report[f"eliminated_{tag}"].append({"id": s.id})
            if tag == "L": fl = kept
            else: ff = kept
        report["after_L"] = len(fl); report["after_F"] = len(ff)
        return fl, ff, report

    @staticmethod
    def _check_hard_filters(kpis, hard_filters):
        for rule in hard_filters:
            field = rule.get("field", "")
            op = rule.get("op", "lt")
            val = rule.get("value", 0)
            actual = kpis.get(field)
            if actual is None:
                continue
            if (op == "lt" and actual < val) or (op == "gt" and actual > val) or (op == "lte" and actual <= val) or (op == "gte" and actual >= val):
                return False
        return True

    def _min_competitor_distance(self, site):
        min_d = float("inf")
        for other in self.L_sites + self.F_sites:
            if other.id == site.id:
                continue
            d = self._haversine(site.lng, site.lat, other.lng, other.lat)
            if d < min_d:
                min_d = d
        return min_d

    # ------------------------------------------------------------------
    # P1: Robust solve with parameter uncertainty
    # ------------------------------------------------------------------

    def solve_robust(self, leader_p, follower_q, iterations=200, n_perturbations=5,
                     standard_errors=None, industry=None, site_kpi_values=None):
        """Run solver N times with perturbed Huff params, compute stability."""
        t0 = time.time()
        orig_lambda, orig_alpha_area, orig_alpha_brand = self.lambda_, self.alpha_area, self.alpha_brand
        selection_counts: Dict[str, int] = {}
        solutions = []
        winning_sets = []

        perturbations = self._generate_perturbations(n_perturbations, standard_errors)

        try:
            for run_idx, perturbed in enumerate(perturbations):
                self.lambda_ = perturbed["lambda"]
                self.alpha_area = perturbed["alpha_area"]
                self.alpha_brand = perturbed["alpha_brand"]

                if industry and site_kpi_values:
                    saved_L, saved_F = self.L_sites, self.F_sites
                    fl, ff, _ = self.filter_candidates(industry, site_kpi_values)
                    self.L_sites, self.F_sites = fl, ff
                    if not fl:
                        self.L_sites, self.F_sites = saved_L, saved_F
                        continue

                sol = self.solve(leader_p, follower_q, iterations)
                solutions.append({
                    "run": run_idx,
                    "params": perturbed,
                    "leader_sites": sol.leader_sites,
                    "leader_revenue": sol.leader_revenue,
                })

                for sid in sol.leader_sites:
                    selection_counts[sid] = selection_counts.get(sid, 0) + 1
                winning_sets.append(tuple(sorted(sol.leader_sites)))

                if industry and site_kpi_values:
                    self.L_sites, self.F_sites = saved_L, saved_F

        finally:
            self.lambda_, self.alpha_area, self.alpha_brand = orig_lambda, orig_alpha_area, orig_alpha_brand

        set_counts = Counter(winning_sets)
        most_common_set, most_common_count = set_counts.most_common(1)[0] if set_counts else ((), 0)
        stability = most_common_count / len(solutions) if solutions else 0.0

        sensitivity_warning = None
        if stability < 0.6:
            sensitivity_warning = (
                f"Low stability ({stability:.1%}): site selection varies significantly under parameter perturbation. "
                "Recommend collecting more data or using the robust solution."
            )

        base_sol = self.solve(leader_p, follower_q, iterations)
        elapsed_ms = (time.time() - t0) * 1000

        logger.info(
            "solve_robust done: stability=%.2f runs=%d elapsed=%.0fms warning=%s",
            stability, len(solutions), elapsed_ms, sensitivity_warning is not None,
        )

        return RobustGameSolution(
            base_solution=base_sol,
            stability_score=round(stability, 4),
            selection_frequencies=selection_counts,
            sensitivity_warning=sensitivity_warning,
            perturbation_runs=len(solutions),
            perturbed_solutions=solutions,
        )

    def _generate_perturbations(self, n, standard_errors):
        """Generate N perturbed parameter sets from standard errors."""
        import math
        base = {
            "lambda": self.lambda_,
            "alpha_area": self.alpha_area,
            "alpha_brand": self.alpha_brand,
        }

        if standard_errors and any(
            standard_errors.get(k) is not None and not math.isnan(standard_errors.get(k, float("nan")))
            for k in ["const", "area", "brand", "dist"]
        ):
            se_lambda = standard_errors.get("dist", 0)
            se_area = standard_errors.get("area", 0)
            se_brand = standard_errors.get("brand", 0)

            if all(v == 0 or math.isnan(v) for v in [se_lambda, se_area, se_brand]):
                return self._default_perturbations(n, base)

            perturbed = []
            for _ in range(n):
                p = {
                    "lambda": base["lambda"] + random.uniform(-2, 2) * max(se_lambda, abs(base["lambda"]) * 0.05),
                    "alpha_area": base["alpha_area"] + random.uniform(-2, 2) * max(se_area, abs(base["alpha_area"]) * 0.05),
                    "alpha_brand": base["alpha_brand"] + random.uniform(-2, 2) * max(se_brand, abs(base["alpha_brand"]) * 0.05),
                }
                p["lambda"] = max(0.1, min(10.0, p["lambda"]))
                p["alpha_area"] = max(0.1, min(5.0, p["alpha_area"]))
                p["alpha_brand"] = max(0.0, min(5.0, p["alpha_brand"]))
                perturbed.append(p)
            return perturbed
        else:
            return self._default_perturbations(n, base)

    def _default_perturbations(self, n, base):
        """Default +-20% uniform random perturbation."""
        perturbed = []
        for _ in range(n):
            p = {
                "lambda": base["lambda"] * random.uniform(0.8, 1.2),
                "alpha_area": base["alpha_area"] * random.uniform(0.8, 1.2),
                "alpha_brand": base["alpha_brand"] * random.uniform(0.8, 1.2),
            }
            p["lambda"] = max(0.1, min(10.0, p["lambda"]))
            p["alpha_area"] = max(0.1, min(5.0, p["alpha_area"]))
            p["alpha_brand"] = max(0.0, min(5.0, p["alpha_brand"]))
            perturbed.append(p)
        return perturbed

