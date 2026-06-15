"""路由注册 — 所有计算端点的入口"""
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.db import get_db
from app.config import settings
from app.models.common import ComputeResponse
from app.models.site_optimization import (
    GameSolveRequest, ScenarioRequest, CompareRequest, HuffFitRequest,
    LPCandidate, LPOptimizeRequest,
    SpatialPointInput, SpatialStatsRequest,
)
from app.services.game_theory import StackelbergSolver, StoreInfo, DemandInfo
from app.services.huff import HuffMLE, HuffRevenueMLE
from app.services.data_loader import load_project_points, load_huff_observations
from app.services.lp_optimizer import solve_lp, Candidate as LPCand
from app.services.spatial_stats import (
    SpatialPoint as SPPoint,
    compute_morans_i, compute_lisa, compute_ripleys_k, spatial_stats_report,
)
from app.utils.logger import get_logger
import math

logger = get_logger(__name__)
router = APIRouter()


# ================================================================
# 内部辅助
# ================================================================

def _ok(data: dict, meta: dict = None) -> dict:
    return {"success": True, "data": data, "meta": meta or {}}


def _err(code: str, message: str) -> dict:
    return {"success": False, "error": {"code": code, "message": message}}


# ================================================================
# POST /compute/game/solve — Stackelberg博弈选址求解
# ================================================================

@router.post("/compute/game/solve")
async def game_solve(req: GameSolveRequest):
    t0 = time.time()

    try:
        # 构建站点
        leader_candidates = [
            StoreInfo(id=s.id, lng=s.lng, lat=s.lat, area=s.area, brand=s.brand, extras=s.extras)
            for s in req.leader_candidates
        ]
        follower_candidates = [
            StoreInfo(id=s.id, lng=s.lng, lat=s.lat, area=s.area, brand=s.brand, extras=s.extras)
            for s in req.follower_candidates
        ]
        demand_points = [
            DemandInfo(h3=d.h3, lng=d.lng, lat=d.lat, population=d.population, consumption=d.consumption)
            for d in req.h3_demand
        ]

        solver = StackelbergSolver(
            leader_candidates=leader_candidates,
            follower_candidates=follower_candidates,
            demand_points=demand_points,
            huff_params=req.huff_params,
        )

        # P0: Pre-filter candidates based on industry hard constraints
        filter_report = None
        if req.enable_filtering and req.industry:
            filtered_L, filtered_F, filter_report = solver.filter_candidates(
                req.industry, req.site_kpi_values
            )
            solver.L_sites = filtered_L
            solver.F_sites = filtered_F

            if not filtered_L:
                return _ok({
                    "leader_sites": [],
                    "leader_revenue": 0,
                    "follower_sites": [],
                    "follower_revenue": 0,
                    "cannibalization_pct": 0,
                    "market_share": {"leader": 0, "follower": 0, "uncovered": 1},
                    "solver_stats": {"iterations": req.iterations, "compute_time_ms": round((time.time() - t0) * 1000)},
                    "filter_report": filter_report,
                })

        # P1: Optional robust solve with parameter uncertainty
        robust_result = None
        if req.enable_robust:
            robust = solver.solve_robust(
                leader_p=req.leader_p,
                follower_q=req.follower_q,
                iterations=req.iterations,
                n_perturbations=req.robust_runs,
                standard_errors=req.standard_errors,
                industry=req.industry if req.enable_filtering else None,
                site_kpi_values=req.site_kpi_values if req.enable_filtering else None,
            )
            solution = robust.base_solution
            robust_result = {
                "stability_score": robust.stability_score,
                "selection_frequencies": robust.selection_frequencies,
                "sensitivity_warning": robust.sensitivity_warning,
                "perturbation_runs": robust.perturbation_runs,
            }
        else:
            solution = solver.solve(
                leader_p=req.leader_p,
                follower_q=req.follower_q,
                iterations=req.iterations,
            )

        elapsed = round((time.time() - t0) * 1000)

        resp_data = {
            "leader_sites": solution.leader_sites,
            "leader_revenue": solution.leader_revenue,
            "follower_sites": solution.follower_sites,
            "follower_revenue": solution.follower_revenue,
            "cannibalization_pct": solution.cannibalization_pct,
            "market_share": solution.market_share,
            "solver_stats": {
                "iterations": req.iterations,
                "compute_time_ms": elapsed,
            },
        }

        if filter_report is not None:
            resp_data["filter_report"] = filter_report
        if robust_result is not None:
            resp_data["robust"] = robust_result

        return _ok(resp_data)

    except Exception as e:
        logger.exception("博弈求解失败")
        return JSONResponse(_err("SOLVER_ERROR", str(e)), status_code=500)


# ================================================================
# POST /compute/game/scenarios — 多情景模拟
# ================================================================

@router.post("/compute/game/scenarios")
async def game_scenarios(request: Request):
    body = await request.json()
    t0 = time.time()

    try:
        # 解析请求
        leader_candidates = [
            StoreInfo(**s) for s in body.get("leader_candidates", [])
        ]
        follower_candidates = [
            StoreInfo(**s) for s in body.get("follower_candidates", [])
        ]
        demand_points = [
            DemandInfo(**d) for d in body.get("h3_demand", [])
        ]
        huff_params = body.get("huff_params", {})
        leader_p = body.get("leader_p", 3)
        base_follower_q = body.get("follower_q", 2)
        scenarios = body.get("scenarios", [])
        iterations = body.get("iterations", 200)
        industry = body.get("industry")
        enable_filtering = body.get("enable_filtering", False)
        site_kpi_values = body.get("site_kpi_values")

        solver = StackelbergSolver(
            leader_candidates=leader_candidates,
            follower_candidates=follower_candidates,
            demand_points=demand_points,
            huff_params=huff_params,
        )

        # P0: Pre-filter if requested
        filter_report = None
        if enable_filtering and industry:
            filtered_L, filtered_F, filter_report = solver.filter_candidates(
                industry, site_kpi_values
            )
            solver.L_sites = filtered_L
            solver.F_sites = filtered_F

        result = solver.run_scenarios(leader_p, base_follower_q, scenarios, iterations)

        if filter_report is not None:
            result["filter_report"] = filter_report

        elapsed = round((time.time() - t0) * 1000)
        return _ok(result, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("情景模拟失败")
        return JSONResponse(_err("SCENARIO_ERROR", str(e)), status_code=500)


# ================================================================
# POST /compute/game/compare — A/B选址对比
# ================================================================

@router.post("/compute/game/compare")
async def game_compare(request: Request):
    body = await request.json()
    t0 = time.time()

    try:
        leader_candidates = [
            StoreInfo(**s) for s in body.get("leader_candidates", [])
        ]
        follower_candidates = [
            StoreInfo(**s) for s in body.get("follower_candidates", [])
        ]
        demand_points = [
            DemandInfo(**d) for d in body.get("h3_demand", [])
        ]
        huff_params = body.get("huff_params", {})
        plan_a = body.get("plan_a_sites", [])
        plan_b = body.get("plan_b_sites", [])
        follower_q = body.get("follower_q", 2)

        solver = StackelbergSolver(
            leader_candidates=leader_candidates,
            follower_candidates=follower_candidates,
            demand_points=demand_points,
            huff_params=huff_params,
        )

        results = {}
        for plan_name, plan_sites in [("plan_a", plan_a), ("plan_b", plan_b)]:
            leader_stores = [s for s in solver.L_sites + solver.F_sites if s.id in plan_sites]
            follower_stores = solver.solve_follower(leader_stores, follower_q)

            all_active = leader_stores + follower_stores
            revs = solver._compute_revenues(all_active)
            leader_rev = sum(revs.get(s.id, 0) for s in leader_stores)
            follower_rev = sum(revs.get(s.id, 0) for s in follower_stores)

            # 蚕食率
            leader_alone_revs = solver._compute_revenues(leader_stores)
            leader_alone_val = sum(leader_alone_revs.values())
            cann = ((leader_alone_val - leader_rev) / leader_alone_val * 100) if leader_alone_val > 0 else 0

            # 覆盖人口 = Σ demand.population × P_i,leader
            probs = solver._huff_probs(leader_stores)
            covered_pop = 0
            for d in demand_points:
                if d.h3 in probs:
                    covered_pop += d.population * sum(probs[d.h3].values())

            results[plan_name] = {
                "leader_revenue": round(leader_rev),
                "follower_best_attack": {
                    "sites": [s.id for s in follower_stores],
                    "revenue": round(follower_rev),
                },
                "cannibalization_pct": round(cann, 1),
                "coverage_population": round(covered_pop),
            }

        # 推荐
        a_rev = results.get("plan_a", {}).get("leader_revenue", 0)
        b_rev = results.get("plan_b", {}).get("leader_revenue", 0)
        a_cann = results.get("plan_a", {}).get("cannibalization_pct", 100)
        b_cann = results.get("plan_b", {}).get("cannibalization_pct", 100)

        if a_rev > b_rev * 1.05 and a_cann <= b_cann:
            winner, reason = "plan_a", f"方案A营收高{(a_rev/b_rev-1)*100:.1f}%，且蚕食率不高于方案B"
        elif b_rev > a_rev * 1.05 and b_cann <= a_cann:
            winner, reason = "plan_b", f"方案B营收高{(b_rev/a_rev-1)*100:.1f}%，且蚕食率不高于方案A"
        elif a_cann < b_cann:
            winner, reason = "plan_a", f"方案A蚕食率低{abs(a_cann-b_cann):.1f}个百分点，抗攻击能力更强"
        else:
            winner, reason = "plan_b", f"方案B蚕食率低{abs(b_cann-a_cann):.1f}个百分点，抗攻击能力更强"

        elapsed = round((time.time() - t0) * 1000)

        return _ok({
            **results,
            "recommendation": {"winner": winner, "reason": reason},
        }, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("A/B对比失败")
        return JSONResponse(_err("COMPARE_ERROR", str(e)), status_code=500)


# ================================================================
# POST /model/huff-fit — Huff参数MLE拟合
# ================================================================

@router.post("/model/huff-fit")
async def huff_fit(req: HuffFitRequest):
    t0 = time.time()

    try:
        # 从请求中构建 MLE
        mle = HuffMLE(
            demand_ids=req.demand_points,
            store_attrs=req.store_attributes,
            observations=req.observations,
            extra_attr_names=req.extra_attr_names,
        )

        result = mle.fit()

        elapsed = round((time.time() - t0) * 1000)

        def _safe(v):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            return v

        return _ok({
            "fitted_params": {k: _safe(v) for k,v in result.fitted_params.items()},
            "r_squared": _safe(result.r_squared),
            "aic": _safe(result.aic),
            "bic": _safe(result.bic),
            "convergence": result.convergence,
            "standard_errors": {k: _safe(v) for k,v in result.standard_errors.items()},
            "predicted_shares": {k: _safe(v) for k,v in result.predicted_shares.items()},
            "n_observations": result.n_observations,
            "note": "λ = abs(dist参数), α_area = area参数, α_brand = brand参数",
        }, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("Huff拟合失败")
        return JSONResponse(_err("HUFF_ERROR", str(e)), status_code=500)


# ================================================================
# POST /model/huff-fit-v2 — 基于门店营收+H3网格反向拟合
# ================================================================

@router.post("/model/huff-fit-v2")
async def huff_fit_v2(request: Request):
    t0 = time.time()
    body = await request.json()

    stores = body.get("stores", [])
    industry = body.get("industry", "convenience")

    # 行业辐射半径
    radius_map = {
        "convenience": 300, "beverage": 400, "restaurant": 500,
        "pharmacy": 800, "fresh_grocery": 800, "supermarket": 3000,
        "hotel": 2000, "medical_aesthetics": 3000, "education": 1500,
        "pet_service": 2000, "auto4s": 10000, "logistics": 500,
    }
    radius = body.get("radius_m", radius_map.get(industry, 500))

    if len(stores) < 5:
        return JSONResponse(
            _err("TOO_FEW_STORES", f"至少需要5家门店，当前{len(stores)}家"),
            status_code=400,
        )

    try:
        mle = HuffRevenueMLE(stores=stores, industry_radius_m=radius)
        result = mle.fit()

        elapsed = round((time.time() - t0) * 1000)

        def _safe(v):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            return v

        return _ok({
            "fitted_params": {k: _safe(v) for k,v in result.fitted_params.items()},
            "r_squared": _safe(result.r_squared),
            "aic": _safe(result.aic),
            "convergence": result.convergence,
            "predicted_revenues": {k: _safe(v) for k,v in result.predicted_revenues.items()},
            "actual_revenues": {k: _safe(v) for k,v in result.actual_revenues.items()},
            "n_grid_cells": result.n_grid_cells,
            "n_stores": result.n_stores,
            "note": "基于门店营收+H3网格+行业半径反向拟合Huff参数",
        }, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("HuffRevenueMLE拟合失败")
        return JSONResponse(_err("HUFF_V2_ERROR", str(e)), status_code=500)


# ================================================================
# POST /compute/data/prepare — 准备项目博弈数据
# ================================================================

@router.post("/compute/data/prepare")
async def prepare_game_data(request: Request):
    """从DB加载项目数据，为博弈选址做准备"""
    body = await request.json()
    project_id = body.get("project_id", "")
    industry = body.get("industry")

    try:
        pool = await get_db()
        data = await load_project_points(pool, project_id, industry)

        # 同时检查是否有Huff观测数据
        huff_obs = await load_huff_observations(pool, project_id)

        return _ok({
            "owners": data["owners"],
            "competitors": data["competitors"],
            "h3_demand": data["h3_demand"],
            "source_crs": data["source_crs"],
            "has_huff_observations": huff_obs is not None and len(huff_obs) >= 5,
            "n_observations": len(huff_obs) if huff_obs else 0,
        })

    except Exception as e:
        logger.exception("数据准备失败")
        return JSONResponse(_err("DATA_ERROR", str(e)), status_code=500)


# ================================================================
# v2.1: POST /compute/lp/optimize — LP选址优化
# ================================================================

@router.post("/compute/lp/optimize")
async def lp_optimize(req: LPOptimizeRequest):
    t0 = time.time()

    try:
        candidates = [
            LPCand(id=c.id, lng=c.lng, lat=c.lat, score=c.score, cost=c.cost, revenue=c.revenue)
            for c in req.candidates
        ]

        result = solve_lp(
            candidates=candidates,
            budget=req.budget,
            min_distance_m=req.min_distance_m,
            use_score_as_cost=req.use_score_as_cost,
        )

        elapsed = round((time.time() - t0) * 1000)

        return _ok({
            "selected_ids": result.selected_ids,
            "total_score": result.total_score,
            "total_cost": result.total_cost,
            "total_revenue": result.total_revenue,
            "budget": result.budget,
            "budget_used_pct": result.budget_used_pct,
            "margin_to_budget": result.margin_to_budget,
            "candidates_considered": result.candidates_considered,
            "algorithm": result.algorithm,
            "iterations": result.iterations,
            "discarded": {
                "by_distance": result.discarded_by_distance,
                "by_budget": result.discarded_by_budget,
            },
        }, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("LP优化失败")
        return JSONResponse(_err("LP_ERROR", str(e)), status_code=500)


# ================================================================
# v2.1: POST /compute/spatial/stats — 空间统计分析 (Moran's I + LISA + Ripley's K)
# ================================================================

@router.post("/compute/spatial/stats")
async def spatial_stats(req: SpatialStatsRequest):
    t0 = time.time()

    try:
        points = [
            SPPoint(id=p.id, lng=p.lng, lat=p.lat, weight=p.weight)
            for p in req.points
        ]

        report = spatial_stats_report(points)

        # 如果从 compute_morans_i 调用需要自定义 permutation 数
        if req.n_permutations != 999:
            morans_result = compute_morans_i(points, n_permutations=req.n_permutations)
            report["morans_i"]["value"] = morans_result.morans_i
            report["morans_i"]["z_score"] = morans_result.z_score
            report["morans_i"]["p_value"] = morans_result.p_value
            report["morans_i"]["significance"] = morans_result.significance

        elapsed = round((time.time() - t0) * 1000)
        report["solve_time_ms"] = elapsed

        return _ok(report, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("空间统计分析失败")
        return JSONResponse(_err("SPATIAL_STATS_ERROR", str(e)), status_code=500)


# ================================================================
# v2.1: POST /compute/spatial/ripley-lambda — Ripley's K → Huff λ 推断
# ================================================================

@router.post("/compute/spatial/ripley-lambda")
async def ripley_lambda(request: Request):
    """只用 Ripley's K 推断 Huff λ（轻量端点，不需要全部统计）"""
    t0 = time.time()
    body = await request.json()

    try:
        points_data = body.get("points", [])
        if len(points_data) < 5:
            return JSONResponse(
                _err("TOO_FEW_POINTS", f"至少需要5个点，当前{len(points_data)}个"),
                status_code=400,
            )

        points = [
            SPPoint(id=p.get("id", f"p{i}"), lng=p["lng"], lat=p["lat"], weight=p.get("weight", 1.0))
            for i, p in enumerate(points_data)
        ]

        ripley = compute_ripleys_k(
            points,
            n_rings=body.get("n_rings", 20),
            max_distance_m=body.get("max_distance_m"),
        )

        elapsed = round((time.time() - t0) * 1000)

        return _ok({
            "peak_aggregation_radius_m": ripley.peak_distance_m,
            "inferred_huff_lambda": ripley.inferred_lambda,
            "area_sqkm": ripley.area_sqkm,
            "l_function": ripley.l_function,
            "distances": ripley.distances,
            "k_diff": ripley.k_diff,
            "n_points": ripley.n_points,
            "note": "当项目无营收数据时，可用此 λ 替代 Huff MLE 拟合值。λ = 1000 / peak_aggregation_radius_m",
        }, {"compute_time_ms": elapsed})

    except Exception as e:
        logger.exception("Ripley K推断失败")
        return JSONResponse(_err("RIPLEY_ERROR", str(e)), status_code=500)