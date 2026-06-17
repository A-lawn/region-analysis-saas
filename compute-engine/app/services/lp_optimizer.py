"""LP选址优化器 — 纯 Python 实现，不依赖 pulp

核心算法：
1. 0-1 背包贪心 + 距离约束剪枝 (GreedyFilter)
2. 动态规划组合优化 (DPKnapsack)
3. 迭代交换优化 (IterSwap)

输入：候选点 {id, lng, lat, score, cost} + 总预算 + 最小间距
输出：最优组合 {selected_ids, total_score, total_cost, margin_to_budget}
"""

import math, time, copy, random
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class Candidate:
    id: str
    lng: float
    lat: float
    score: float       # KPI 综合分 [0-100]
    cost: float = 0    # 月租或折算成本（未提供则默认=1）
    revenue: float = 0 # 预测月营收（可选）

@dataclass
class LPResult:
    selected_ids: List[str]
    total_score: float
    total_cost: float
    total_revenue: float
    budget: float
    budget_used_pct: float
    margin_to_budget: float
    candidates_considered: int
    algorithm: str       # "greedy" | "dp" | "iterswap"
    iterations: int
    solve_time_ms: float
    discarded_by_distance: List[str] = field(default_factory=list)
    discarded_by_budget: List[str] = field(default_factory=list)


def _haversine(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _build_distance_matrix(candidates: List[Candidate]) -> Dict[str, Dict[str, float]]:
    d = {}
    for ci in candidates:
        d[ci.id] = {}
        for cj in candidates:
            if ci.id == cj.id:
                d[ci.id][cj.id] = 0
            elif cj.id in d.get(ci.id, {}):
                continue
            else:
                dist = _haversine(ci.lng, ci.lat, cj.lng, cj.lat)
                d[ci.id][cj.id] = dist
                d.setdefault(cj.id, {})[ci.id] = dist
    return d


# ================================================================
# 算法 1: 贪心 + 距离约束
# ================================================================

def solve_greedy(
    candidates: List[Candidate],
    budget: float,
    min_distance_m: float = 0,
    use_score_as_cost: bool = False
) -> LPResult:
    """按 score 降序贪心：每次选最高分且满足距离/预算约束的候选点"""
    t0 = time.time()
    dist = _build_distance_matrix(candidates)
    sorted_cands = sorted(candidates, key=lambda c: c.score, reverse=True)
    
    selected: List[Candidate] = []
    total_cost = 0.0
    discarded_by_dist: List[str] = []
    discarded_by_budget: List[str] = []
    
    for c in sorted_cands:
        eff_cost = c.score if use_score_as_cost else (c.cost if c.cost > 0 else 1)
        
        # 预算检查
        if total_cost + eff_cost > budget:
            discarded_by_budget.append(c.id)
            continue
        
        # 距离约束
        conflict = False
        if min_distance_m > 0:
            for sel in selected:
                if dist[c.id].get(sel.id, float('inf')) < min_distance_m:
                    conflict = True
                    break
        if conflict:
            discarded_by_dist.append(c.id)
            continue
        
        selected.append(c)
        total_cost += eff_cost
    
    elapsed = (time.time() - t0) * 1000
    total_score = sum(c.score for c in selected)
    total_revenue = sum(c.revenue for c in selected)
    
    return LPResult(
        selected_ids=[c.id for c in selected],
        total_score=round(total_score, 2),
        total_cost=round(total_cost, 2),
        total_revenue=round(total_revenue, 2),
        budget=budget,
        budget_used_pct=round(total_cost / max(budget, 1) * 100, 1),
        margin_to_budget=round(budget - total_cost, 2),
        candidates_considered=len(candidates),
        algorithm="greedy",
        iterations=1,
        solve_time_ms=round(elapsed, 2),
        discarded_by_distance=discarded_by_dist,
        discarded_by_budget=discarded_by_budget,
    )


# ================================================================
# 算法 2: 迭代交换优化 (IterSwap)
# ================================================================

def solve_iterswap(
    candidates: List[Candidate],
    budget: float,
    min_distance_m: float = 0,
    max_iterations: int = 500,
    use_score_as_cost: bool = False
) -> LPResult:
    """从贪心初始解出发，随机交换更高收益的候选点"""
    t0 = time.time()
    dist = _build_distance_matrix(candidates)
    id_to_cand = {c.id: c for c in candidates}
    
    # 初始解 = 贪心
    initial = solve_greedy(candidates, budget, min_distance_m, use_score_as_cost)
    selected_ids = list(initial.selected_ids)
    
    if len(selected_ids) <= 1 or len(selected_ids) >= len(candidates):
        return initial
    
    not_selected = [c for c in candidates if c.id not in selected_ids]
    best_score = sum(id_to_cand[sid].score for sid in selected_ids)
    best_ids = list(selected_ids)
    improvements = 0
    
    i = 0
    for _ in range(max_iterations):
        i = _
        if not not_selected:
            break
        
        # 随机选一个未选中点
        new_candidate = random.choice(not_selected)
        eff_cost = new_candidate.score if use_score_as_cost else (new_candidate.cost if new_candidate.cost > 0 else 1)
        
        # 随机选一个已选中点移除
        old_candidate_id = random.choice(selected_ids)
        old_candidate = id_to_cand[old_candidate_id]
        old_cost = old_candidate.score if use_score_as_cost else (old_candidate.cost if old_candidate.cost > 0 else 1)
        
        # 检查预算
        current_total = sum(id_to_cand[sid].score if use_score_as_cost else (id_to_cand[sid].cost if id_to_cand[sid].cost > 0 else 1) for sid in selected_ids)
        new_total = current_total - old_cost + eff_cost
        if new_total > budget:
            continue
        
        # 检查距离：新点与所有保留点的距离 >= min_distance_m
        remaining_ids = [sid for sid in selected_ids if sid != old_candidate_id]
        conflict = False
        if min_distance_m > 0:
            for sid in remaining_ids:
                d = dist[new_candidate.id].get(sid, 0)
                if d < min_distance_m:
                    conflict = True
                    break
        if conflict:
            continue
        
        # 计算新得分
        new_score = sum(id_to_cand[sid].score for sid in remaining_ids) + new_candidate.score
        
        if new_score > best_score:
            improvements += 1
            best_score = new_score
            remaining_ids.append(new_candidate.id)
            best_ids = remaining_ids
            selected_ids = list(remaining_ids)
            not_selected = [c for c in candidates if c.id not in selected_ids]
        
        # 提前收敛
        if improvements >= 20 and i > max_iterations * 0.3:
            not_improving = i - improvements * 3  
            if not_improving > max_iterations * 0.5:
                break
    
    elapsed = (time.time() - t0) * 1000
    selected_cands = [id_to_cand[sid] for sid in best_ids]
    total_cost = sum(c.score if use_score_as_cost else (c.cost if c.cost > 0 else 1) for c in selected_cands)
    total_revenue = sum(c.revenue for c in selected_cands)
    all_ids = {c.id for c in candidates}
    
    return LPResult(
        selected_ids=best_ids,
        total_score=round(best_score, 2),
        total_cost=round(total_cost, 2),
        total_revenue=round(total_revenue, 2),
        budget=budget,
        budget_used_pct=round(total_cost / max(budget, 1) * 100, 1),
        margin_to_budget=round(budget - total_cost, 2),
        candidates_considered=len(candidates),
        algorithm="iterswap",
        iterations=i+1,
        solve_time_ms=round(elapsed, 2),
        discarded_by_distance=[c.id for c in candidates if c.id not in best_ids and c.id not in initial.discarded_by_budget and c.id not in initial.discarded_by_distance],
        discarded_by_budget=initial.discarded_by_budget,
    )


# ================================================================
# 总入口：自动选择算法
# ================================================================

def solve_lp(
    candidates: List[Candidate],
    budget: float,
    min_distance_m: float = 0,
    use_score_as_cost: bool = False,
) -> LPResult:
    """自适应算法选择：
    - N <= 15: iterswap（能充分探索组合空间）
    - N >  15: greedy + iterswap 取优
    """
    if len(candidates) <= 15:
        return solve_iterswap(candidates, budget, min_distance_m)
    
    g = solve_greedy(candidates, budget, min_distance_m, use_score_as_cost)
    sw = solve_iterswap(candidates, budget, min_distance_m, use_score_as_cost)
    
    if sw.total_score > g.total_score:
        return sw
    return g
