"""Stackelberg博弈选址求解器 — 模拟退火 + 贪心Follower"""
import numpy as np
import random
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
    id: str
    lng: float
    lat: float
    area: float = 100.0
    brand: float = 0.5
    extras: Dict[str, float] = field(default_factory=dict)


@dataclass
class DemandInfo:
    h3: str
    lng: float
    lat: float
    population: float
    consumption: float = 35.0


class StackelbergSolver:
    """
    Stackelberg竞争选址求解器
    Leader先选p个点，Follower观察后选q个点（最优反应）
    Leader在Follower最优反应下最大化自身营收
    """

    def __init__(
        self,
        leader_candidates: List[StoreInfo],
        follower_candidates: List[StoreInfo],
        demand_points: List[DemandInfo],
        huff_params: Dict[str, float],
        distance_fn=None,
    ):
        self.L_sites = leader_candidates
        self.F_sites = follower_candidates
        self.demand = demand_points
        self.lambda_ = huff_params.get("lambda", 2.0)
        self.alpha_area = huff_params.get("alpha_area", 1.0)
        self.alpha_brand = huff_params.get("alpha_brand", 0.8)

        # 预计算距离矩阵
        self._precompute_distances(distance_fn)

    def _precompute_distances(self, distance_fn):
        """预计算所有需求点到所有门店的距离"""
        self.dist = {}
        all_sites = {s.id: s for s in self.L_sites + self.F_sites}
        for d in self.demand:
            self.dist[d.h3] = {}
            for sid, s in all_sites.items():
                if distance_fn:
                    self.dist[d.h3][sid] = distance_fn(sid, d.h3)
                else:
                    self.dist[d.h3][sid] = self._haversine(s.lng, s.lat, d.lng, d.lat)

    @staticmethod
    def _haversine(lng1, lat1, lng2, lat2):
        import math
        R = 6371000
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def _attraction(self, site: StoreInfo) -> float:
        """门店吸引力 = area^α_area × brand^α_brand"""
        return (max(site.area, 1.0) ** self.alpha_area) * (max(site.brand, 0.1) ** self.alpha_brand)

    def _huff_probs(self, active_sites: List[StoreInfo]) -> Dict[str, Dict[str, float]]:
        """Huff概率: P_ij = A_j·exp(-λ·d_ij) / Σ A_k·exp(-λ·d_ik)"""
        attrs = {s.id: self._attraction(s) for s in active_sites}
        probs = {}
        for d in self.demand:
            numerators = {}
            denom = 0.0
            for s in active_sites:
                dist_km = self.dist[d.h3][s.id] / 1000.0
                num = attrs[s.id] * np.exp(-self.lambda_ * dist_km)
                numerators[s.id] = num
                denom += num
            if denom > 0:
                probs[d.h3] = {sid: num / denom for sid, num in numerators.items()}
            else:
                n = len(active_sites)
                probs[d.h3] = {sid: 1.0 / n for sid in numerators}
        return probs

    def _compute_revenues(self, active_sites: List[StoreInfo]) -> Dict[str, float]:
        """计算每个门店的预期营收"""
        probs = self._huff_probs(active_sites)
        revs = {s.id: 0.0 for s in active_sites}
        for d in self.demand:
            if d.h3 in probs:
                for sid, p in probs[d.h3].items():
                    revs[sid] += d.population * p * d.consumption
        return revs

    def solve_follower(self, leader_sites: List[StoreInfo], q: int) -> List[StoreInfo]:
        """Follower最优反应：贪心增量选q个点"""
        if q == 0:
            return []
        selected = []
        all_sites = list(leader_sites)

        for _ in range(q):
            best_site = None
            best_rev = -1.0
            candidates = [f for f in self.F_sites if f.id not in [s.id for s in selected]]

            for f in candidates:
                trial = all_sites + selected + [f]
                revs = self._compute_revenues(trial)
                f_rev = sum(revs.get(s.id, 0) for s in selected + [f])
                if f_rev > best_rev:
                    best_rev = f_rev
                    best_site = f

            if best_site:
                selected.append(best_site)
                all_sites.append(best_site)

        return selected

    def solve(self, leader_p: int, follower_q: int, iterations: int = 200) -> GameSolution:
        """领导者主问题：模拟退火"""
        import time
        t_start = time.time()

        # 随机初始化
        current_L = random.sample(self.L_sites, min(leader_p, len(self.L_sites)))
        current_F = self.solve_follower(current_L, follower_q)

        all_active = current_L + current_F
        revs = self._compute_revenues(all_active)
        current_value = sum(revs.get(s.id, 0) for s in current_L)

        # Leader单独时的营收（用于计算蚕食率）
        leader_alone_revs = self._compute_revenues(current_L)
        leader_alone_value = sum(leader_alone_revs.values())

        best_L, best_F, best_value = list(current_L), list(current_F), current_value

        T = 1.0
        T_min = 0.01
        alpha_cool = (T_min / T) ** (1.0 / iterations)
        no_improve = 0

        logger.info(
            f"博弈求解开始 p={leader_p} q={follower_q} iters={iterations}",
            extra={"module": "game-theory", "operation": "solve",
                   "meta": f"init_value={current_value:.0f} L={[s.id for s in current_L]}"},
        )

        for it in range(iterations):
            # 扰动：替换一个Leader点
            new_L = list(current_L)
            swap_idx = random.randrange(len(new_L))
            candidates = [l for l in self.L_sites if l.id not in [s.id for s in new_L]]
            if candidates:
                new_L[swap_idx] = random.choice(candidates)

            # Follower最优应对
            new_F = self.solve_follower(new_L, follower_q)

            # 评估
            all_active = new_L + new_F
            revs = self._compute_revenues(all_active)
            new_value = sum(revs.get(s.id, 0) for s in new_L)

            # Metropolis接受
            delta = new_value - current_value
            if delta > 0 or random.random() < np.exp(delta / max(T * abs(current_value) + 1, 1)):
                current_L, current_F, current_value = new_L, new_F, new_value
                no_improve = 0
                if current_value > best_value:
                    best_L, best_F, best_value = list(current_L), list(current_F), current_value
            else:
                no_improve += 1

            T *= alpha_cool
            if no_improve >= 30:
                break

        elapsed_ms = (time.time() - t_start) * 1000

        # 构建结果
        all_sites = best_L + best_F
        final_revs = self._compute_revenues(all_sites)
        probs = self._huff_probs(all_sites)

        leader_rev = sum(final_revs.get(s.id, 0) for s in best_L)
        follower_rev = sum(final_revs.get(s.id, 0) for s in best_F)

        total_rev = leader_rev + follower_rev
        leader_alone_final_revs = self._compute_revenues(best_L)
        leader_alone_final = sum(leader_alone_final_revs.values())

        cann_pct = ((leader_alone_final - leader_rev) / leader_alone_final * 100) if leader_alone_final > 0 else 0.0

        solution = GameSolution(
            leader_sites=[s.id for s in best_L],
            follower_sites=[s.id for s in best_F],
            leader_revenue=round(leader_rev),
            follower_revenue=round(follower_rev),
            cannibalization_pct=round(cann_pct, 1),
            market_share={
                "leader": round(leader_rev / total_rev, 3) if total_rev > 0 else 0,
                "follower": round(follower_rev / total_rev, 3) if total_rev > 0 else 0,
                "uncovered": round(1 - (leader_rev + follower_rev) / total_rev, 3) if total_rev > 0 else 1,
            },
            demand_allocation={
                d.h3: {sid: round(p, 4) for sid, p in probs.get(d.h3, {}).items()}
                for d in self.demand
            },
            solution_time_ms=round(elapsed_ms),
        )

        logger.info(
            f"博弈求解完成 leader_rev={leader_rev:.0f} follower_rev={follower_rev:.0f} cann={cann_pct:.1f}%",
            extra={"module": "game-theory", "operation": "solve",
                   "meta": f"L={solution.leader_sites} F={solution.follower_sites} time={elapsed_ms:.0f}ms"},
        )

        return solution

    def run_scenarios(
        self, leader_p: int, base_follower_q: int,
        scenarios: List[Dict], iterations: int = 200
    ) -> Dict:
        """运行多个情景并找稳健解"""
        results = []
        all_combos = {}

        for sc in scenarios:
            q = sc.get("follower_q_override", base_follower_q)
            sol = self.solve(leader_p, q, iterations)
            result = {
                "label": sc.get("label", f"q={q}"),
                "type": sc.get("type", "counter_attack"),
                "leader_sites": sol.leader_sites,
                "leader_revenue": sol.leader_revenue,
                "follower_sites": sol.follower_sites,
                "follower_revenue": sol.follower_revenue,
                "cannibalization_pct": sol.cannibalization_pct,
                "market_share": sol.market_share,
            }
            results.append(result)

            combo_key = tuple(sorted(sol.leader_sites))
            if combo_key not in all_combos:
                all_combos[combo_key] = []
            all_combos[combo_key].append(sol.leader_revenue)

        # 找稳健解：最差情景下最好
        best_min = -float("inf")
        robust_sites = results[0]["leader_sites"] if results else []
        for combo, revs in all_combos.items():
            min_rev = min(revs)
            if min_rev > best_min:
                best_min = min_rev
                robust_sites = list(combo)

        return {
            "scenarios": results,
            "robust_solution": {
                "sites": robust_sites,
                "min_revenue_across_scenarios": round(best_min),
            },
        }
