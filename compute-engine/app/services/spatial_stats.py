"""空间统计分析 — 自研实现，不依赖 esda/pointpats

1. Global Moran''s I（全局空间自相关）
2. LISA（局部空间自相关指标）
3. Ripley''s K 函数（多距离尺度聚集模式）
4. K→λ 推断：从 K 峰值推导 Huff λ

输入：门店坐标列表 [{lng, lat, weight?}]
输出：统计检验 + 可视化数据
"""

import math, time, random
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class SpatialPoint:
    id: str
    lng: float
    lat: float
    weight: float = 1.0

@dataclass
class MoransIResult:
    morans_i: float       # -1 ~ 1
    expected_i: float     # 随机分布期望 = -1/(n-1)
    z_score: float        # 标准正态 Z 值
    p_value: float        # 显著性
    significance: str     # "high" | "medium" | "low" | "not_significant"
    interpretation: str
    n_points: int
    n_permutations: int
    solve_time_ms: float

@dataclass
class LISAResult:
    morans_i: float
    clusters: List[Dict[str, Any]]  # [{id, type: "HH"|"LL"|"HL"|"LH", lisa_i, lng, lat}]
    n_hh: int      # 高-高热点
    n_ll: int      # 低-低冷点
    n_hl: int      # 高值被低值包围（异常）
    n_lh: int      # 低值被高值包围（潜力）
    n_ns: int      # 不显著
    solve_time_ms: float

@dataclass
class RipleysKResult:
    distances: List[float]          # r 值列表
    k_observed: List[float]         # 观测 K(r)
    k_expected: List[float]         # CSR 完全随机期望 π*r²
    k_diff: List[float]             # K(r) - K_expected
    l_function: List[float]         # L(r) = sqrt(K(r)/π) - r (Besag''s L)
    peak_distance_m: Optional[float] # 最大聚集距离
    inferred_lambda: Optional[float] # λ ≈ 1000 / peak_distance
    area_sqkm: float                # 分析区域面积
    n_points: int
    solve_time_ms: float


# ================================================================
# 工具函数
# ================================================================

def _haversine(lng1, lat1, lng2, lat2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) * math.sin(dlng/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def _build_distance_matrix(points):
    n = len(points)
    d = [[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(i+1, n):
            dist = _haversine(points[i].lng, points[i].lat,
                              points[j].lng, points[j].lat)
            d[i][j] = dist
            d[j][i] = dist
    return d

def _spatial_weights_matrix(points, dist_matrix, method="inverse"):
    """空间权重矩阵 W: inverse distance 或 binary (threshold)"""
    n = len(points)
    W = [[0.0]*n for _ in range(n)]
    if method == "inverse":
        for i in range(n):
            for j in range(n):
                if i != j and dist_matrix[i][j] > 1e-6:
                    W[i][j] = 1.0 / dist_matrix[i][j]
    elif method == "binary":
        # 使用中位距离作为阈值
        all_dists = []
        for i in range(n):
            for j in range(i+1, n):
                all_dists.append(dist_matrix[i][j])
        threshold = sorted(all_dists)[len(all_dists)//2] if all_dists else 1000
        for i in range(n):
            for j in range(n):
                if i != j and dist_matrix[i][j] <= threshold:
                    W[i][j] = 1.0
    # 行标准化
    for i in range(n):
        row_sum = sum(W[i])
        if row_sum > 0:
            W[i] = [w / row_sum for w in W[i]]
    return W


# ================================================================
# Global Moran''s I
# ================================================================

def compute_morans_i(
    points: List[SpatialPoint],
    n_permutations: int = 999
) -> MoransIResult:
    """全局 Moran''s I 空间自相关检验"""
    t0 = time.time()
    n = len(points)
    if n < 3:
        return MoransIResult(morans_i=0, expected_i=0, z_score=0, p_value=1.0,
                              significance="not_significant",
                              interpretation="点数不足（需 >=3）",
                              n_points=n, n_permutations=0, solve_time_ms=0)

    values = [p.weight for p in points]
    mean_val = sum(values) / n
    dist = _build_distance_matrix(points)
    W = _spatial_weights_matrix(points, dist, "inverse")

    # 分子: Σ_wij * (z_i - z̄) * (z_j - z̄)
    numerator = 0.0
    for i in range(n):
        for j in range(n):
            if i != j:
                numerator += W[i][j] * (values[i] - mean_val) * (values[j] - mean_val)

    # 分母: Σ (z_i - z̄)²
    denominator = sum((v - mean_val)**2 for v in values)

    if abs(denominator) < 1e-12:
        morans_i = 0.0
    else:
        S0 = sum(sum(row) for row in W)  # ΣΣ w_ij
        morans_i = (n / max(S0, 1e-10)) * numerator / denominator

    expected_i = -1.0 / (n - 1)

    # Permutation test
    permuted_is = []
    rng = random.Random(42)
    for _ in range(n_permutations):
        shuffled = values.copy()
        rng.shuffle(shuffled)
        perm_num = 0.0
        for i in range(n):
            for j in range(n):
                if i != j:
                    perm_num += W[i][j] * (shuffled[i] - mean_val) * (shuffled[j] - mean_val)
        if abs(denominator) < 1e-12:
            perm_i = 0
        else:
            perm_i = (n / max(S0, 1e-10)) * perm_num / denominator
        permuted_is.append(perm_i)

    # Z-score
    pm = sum(permuted_is) / len(permuted_is)
    pstd = 0
    if len(permuted_is) > 0:
        pv = sum((x - pm)**2 for x in permuted_is) / len(permuted_is)
        pstd = max(math.sqrt(pv), 1e-10)
    
    if pstd > 1e-10:
        z_score = (morans_i - pm) / pstd
    else:
        z_score = 0

    # p-value (双侧)
    extreme = sum(1 for v in permuted_is if abs(v - pm) >= abs(morans_i - pm))
    p_value = max((extreme + 1) / (n_permutations + 1), 1e-6)

    # 显著性判断
    if p_value < 0.01:
        sig = "high"
    elif p_value < 0.05:
        sig = "medium"
    elif p_value < 0.10:
        sig = "low"
    else:
        sig = "not_significant"

    # 解释
    if sig == "not_significant":
        interp = "门店空间分布未显著偏离随机模式"
    elif morans_i > expected_i:
        if sig == "high":
            interp = "门店呈显著空间聚集（p<0.01），高营收门店区域抱团"
        else:
            interp = "门店呈一定空间聚集趋势，建议进一步分析子区域差异"
    else:
        interp = "门店呈空间分散模式，可能过度分散导致服务效率不足"

    elapsed = (time.time() - t0) * 1000

    return MoransIResult(
        morans_i=round(morans_i, 4),
        expected_i=round(expected_i, 4),
        z_score=round(z_score, 3),
        p_value=round(p_value, 4),
        significance=sig,
        interpretation=interp,
        n_points=n,
        n_permutations=n_permutations,
        solve_time_ms=round(elapsed, 2),
    )


# ================================================================
# LISA (Local Indicators of Spatial Association)
# ================================================================

def compute_lisa(
    points: List[SpatialPoint],
    n_permutations: int = 99
) -> LISAResult:
    """LISA 局部空间自相关"""
    t0 = time.time()
    n = len(points)
    values = [p.weight for p in points]
    mean_val = sum(values) / n
    dist = _build_distance_matrix(points)
    W = _spatial_weights_matrix(points, dist, "inverse")

    # 先算全局 I
    global_i = compute_morans_i(points, n_permutations)

    clusters = []
    n_hh, n_ll, n_hl, n_lh, n_ns = 0, 0, 0, 0, 0

    # 对每个点计算 LISA
    for i in range(n):
        zi = values[i] - mean_val
        if abs(zi) < 1e-10:
            n_ns += 1
            continue

        # 空间滞后
        lag_i = sum(W[i][j] * (values[j] - mean_val) for j in range(n) if i != j)

        # LISA I_i
        lisa_i = zi * lag_i / max(sum((v - mean_val)**2 for v in values) / n, 1e-10)

        # 分类
        if zi > 0 and lag_i > 0:
            ctype = "HH"; n_hh += 1
        elif zi < 0 and lag_i < 0:
            ctype = "LL"; n_ll += 1
        elif zi > 0 and lag_i < 0:
            ctype = "HL"; n_hl += 1
        elif zi < 0 and lag_i > 0:
            ctype = "LH"; n_lh += 1
        else:
            ctype = "NS"; n_ns += 1

        clusters.append({
            "id": points[i].id,
            "type": ctype,
            "lisa_i": round(lisa_i, 4),
            "z_score": round(zi, 4),
            "spatial_lag": round(lag_i, 4),
            "lng": points[i].lng,
            "lat": points[i].lat,
            "weight": points[i].weight,
        })

    elapsed = (time.time() - t0) * 1000

    return LISAResult(
        morans_i=global_i.morans_i,
        clusters=clusters,
        n_hh=n_hh, n_ll=n_ll, n_hl=n_hl, n_lh=n_lh, n_ns=n_ns,
        solve_time_ms=round(elapsed, 2),
    )


# ================================================================
# Ripley''s K 函数
# ================================================================

def compute_ripleys_k(
    points: List[SpatialPoint],
    n_rings: int = 20,
    max_distance_m: Optional[float] = None
) -> RipleysKResult:
    """Ripley''s K 函数：多距离尺度聚集模式检测"""
    t0 = time.time()
    n = len(points)
    if n < 5:
        return RipleysKResult(
            distances=[], k_observed=[], k_expected=[], k_diff=[],
            l_function=[], peak_distance_m=None, inferred_lambda=None,
            area_sqkm=0, n_points=n, solve_time_ms=0)

    dist = _build_distance_matrix(points)

    # 区域面积：用 MBR
    lngs = [p.lng for p in points]
    lats = [p.lat for p in points]
    mbr_w = _haversine(min(lngs), sum(lats)/n, max(lngs), sum(lats)/n)
    mbr_h = _haversine(sum(lngs)/n, min(lats), sum(lngs)/n, max(lats))
    area_sqkm = (mbr_w * mbr_h) / 1_000_000

    if max_distance_m is None:
        max_distance_m = max(max(row) for row in dist) * 0.5

    distances = [max_distance_m * (i+1)/n_rings for i in range(n_rings)]
    k_obs = []
    k_exp = []
    k_diff = []
    l_func = []

    lamda = n / max(area_sqkm, 0.01)  # 密度 points/km²

    for r in distances:
        # 观测 K(r): 在距离 r 内的平均邻居数 / λ
        total_neighbors = 0
        for i in range(n):
            for j in range(n):
                if i != j and dist[i][j] <= r:
                    total_neighbors += 1
        k_obs_r = total_neighbors / max(n, 1) / lamda
        k_obs.append(k_obs_r)

        # 期望 K(r) = π * r² (CSR 完全随机)
        k_exp_r = math.pi * (r/1000)**2
        k_exp.append(k_exp_r)
        k_diff.append(k_obs_r - k_exp_r)

        # Besag''s L(r) = sqrt(K(r)/π) - r
        l_r = math.sqrt(max(k_obs_r, 0)/math.pi) * 1000 - r
        l_func.append(l_r)

    # 找 K 函数峰值距离（最大聚集）
    peak_dist = None
    inferred_lambda = None
    max_diff = max(k_diff) if k_diff else 0
    if max_diff > 0:
        peak_idx = k_diff.index(max_diff)
        peak_dist = distances[peak_idx]
        # λ ≈ 1000/peak_distance (距离衰减系数转换)
        inferred_lambda = round(max(0.05, min(20, 1000.0 / max(peak_dist, 50))), 2)

    elapsed = (time.time() - t0) * 1000

    logger.info("Ripley K done: n=%d rings=%d peak=%.0fm λ=%.2f time=%.0fms",
                n, n_rings, peak_dist or 0, inferred_lambda or 0, elapsed)

    return RipleysKResult(
        distances=[round(d, 1) for d in distances],
        k_observed=[round(v, 6) for v in k_obs],
        k_expected=[round(v, 6) for v in k_exp],
        k_diff=[round(v, 6) for v in k_diff],
        l_function=[round(v, 2) for v in l_func],
        peak_distance_m=round(peak_dist, 1) if peak_dist else None,
        inferred_lambda=inferred_lambda,
        area_sqkm=round(area_sqkm, 2),
        n_points=n,
        solve_time_ms=round(elapsed, 2),
    )


# ================================================================
# 综合入口：一次返回所有分析
# ================================================================

def spatial_stats_report(
    points: List[SpatialPoint]
) -> Dict[str, Any]:
    """返回 Moran''s I + LISA + Ripley''s K 完整报告"""
    if len(points) < 3:
        return {"error": "至少需要 3 个点进行空间分析", "n_points": len(points)}

    morans = compute_morans_i(points)

    lisa = None
    if len(points) >= 5:
        lisa = compute_lisa(points)

    ripley = compute_ripleys_k(points)

    return {
        "morans_i": {
            "value": morans.morans_i,
            "expected": morans.expected_i,
            "z_score": morans.z_score,
            "p_value": morans.p_value,
            "significance": morans.significance,
            "interpretation": morans.interpretation,
        },
        "lisa": {
            "n_hh": lisa.n_hh if lisa else 0,
            "n_ll": lisa.n_ll if lisa else 0,
            "n_hl": lisa.n_hl if lisa else 0,
            "n_lh": lisa.n_lh if lisa else 0,
            "clusters": (lisa.clusters if lisa else []),
        } if lisa else None,
        "ripleys_k": {
            "aggregation_radius_m": ripley.peak_distance_m,
            "inferred_huff_lambda": ripley.inferred_lambda,
            "area_sqkm": ripley.area_sqkm,
            "l_function": ripley.l_function,
            "distances": ripley.distances,
        },
        "n_points": len(points),
        "solve_time_ms": morans.solve_time_ms + (lisa.solve_time_ms if lisa else 0) + ripley.solve_time_ms,
    }
