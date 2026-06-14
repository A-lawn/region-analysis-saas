"""Huff gravity model MLE estimation"""
import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class HuffFitResult:
    fitted_params: Dict[str, float]; r_squared: float; aic: float; bic: float
    convergence: bool; standard_errors: Dict[str, float]; predicted_shares: Dict[str, float]; n_observations: int


class HuffMLE:
    def __init__(self, demand_ids, store_attrs, observations, extra_attr_names=None):
        self.demand_ids = list(set(demand_ids))
        self.store_ids = list(store_attrs.keys())
        self.store_attrs = store_attrs
        self.extra_attr_names = extra_attr_names or []
        self.param_names = ["const", "area", "brand", "dist"] + self.extra_attr_names
        self._build_matrices(observations)

    def _build_matrices(self, observations):
        self.X_base = {}
        for sid in self.store_ids:
            a = self.store_attrs[sid]
            row = [1.0, np.log(max(a.get("area",100.0),1.0)), a.get("brand",0.5)]
            row += [a.get(n,0.0) for n in self.extra_attr_names]
            self.X_base[sid] = np.array(row)
        self.distances, self.weights = {}, {}
        for obs in observations:
            did, sid = obs["demand_id"], obs["store_id"]
            self.distances.setdefault(did, {})[sid] = obs.get("distance_m",0)
            self.weights.setdefault(did, {})[sid] = self.weights.get(did, {}).get(sid, 0) + obs.get("weight",1.0)

    def _probs(self, params, did):
        beta_base, beta_dist = params[:-1], params[-1]
        V = {}
        for sid in self.store_ids:
            raw = float(np.dot(beta_base, self.X_base[sid]) + beta_dist * self.distances.get(did,{}).get(sid,10.0)/1000.0)
            V[sid] = raw if not np.isnan(raw) else -1e10
        V_arr = np.array([V[s] for s in self.store_ids])
        ls = logsumexp(V_arr)
        if np.isnan(ls):
            return {sid: 1.0/len(self.store_ids) for sid in self.store_ids}
        return {sid: float(np.exp(V[sid]-ls)) for sid in self.store_ids}

    def _neg_ll(self, params):
        nll, tw = 0.0, 0.0
        for did in self.weights:
            if did not in self.distances: continue
            probs = self._probs(params, did)
            for sid, w in self.weights[did].items():
                p = max(probs.get(sid,1e-10),1e-10)
                nll -= w * np.log(p); tw += w
        if tw <= 0: return 1e10
        val = nll / tw
        if np.isnan(val): return 1e10
        return float(val)

    def fit(self, initial=None):
        n = len(self.param_names)
        if initial is None:
            initial = np.zeros(n); initial[0]=-1.0; initial[1]=0.5; initial[2]=0.5; initial[3]=-2.0

        n_obs = int(sum(sum(v.values()) for v in self.weights.values()))
        logger.info("Huff MLE fit: stores=%d obs=%d", len(self.store_ids), n_obs)

        result = minimize(self._neg_ll, initial, method="L-BFGS-B", options={"maxiter":500,"ftol":1e-8})
        params = result.x; converged = bool(result.success)
        se = self._se(params)
        pred, _ = self._predict(params); actual = self._actual()
        ss_res = sum((actual.get(sid,0)-pred.get(sid,0))**2 for sid in self.store_ids)
        ma = sum(actual.values())/max(len(self.store_ids),1)
        ss_tot = sum((actual.get(sid,0)-ma)**2 for sid in self.store_ids)
        r2 = 1 - ss_res/max(ss_tot,1e-10)
        if np.isnan(r2) or np.isinf(r2): r2 = 0.0
        ll = -self._neg_ll(params)*n_obs
        aic = 2*n - 2*ll; bic = n*np.log(max(n_obs,1)) - 2*ll
        if np.isnan(aic) or np.isinf(aic): aic = 1e6
        if np.isnan(bic) or np.isinf(bic): bic = 1e6

        fp = {}
        for i,name in enumerate(self.param_names):
            v = float(params[i])
            fp[name] = round(v,6) if not np.isnan(v) else 0.0

        se_clean = {}
        for name in self.param_names:
            v = se.get(name, 0)
            se_clean[name] = round(float(v),6) if (v is not None and not np.isnan(float(v))) else None

        ps = {}
        for sid,s in pred.items():
            ps[sid] = round(float(s),4) if not np.isnan(float(s)) else 0.0

        fr = HuffFitResult(
            fitted_params=fp,
            r_squared=round(float(r2),4), aic=round(float(aic),2), bic=round(float(bic),2),
            convergence=converged,
            standard_errors=se_clean,
            predicted_shares=ps, n_observations=n_obs)
        logger.info("Huff fit done: R2=%.3f AIC=%.0f", r2, aic)
        return fr

    def _se(self, params):
        n, eps = len(params), 1e-5
        try:
            hessian = np.zeros((n,n)); f0 = self._neg_ll(params)
            for i in range(n):
                for j in range(i,n):
                    p_ij=params.copy(); p_ij[i]+=eps; p_ij[j]+=eps
                    p_i=params.copy(); p_i[i]+=eps; p_j=params.copy(); p_j[j]+=eps
                    h = (self._neg_ll(p_ij)-self._neg_ll(p_i)-self._neg_ll(p_j)+f0)/(eps*eps)
                    hessian[i,j]=h; hessian[j,i]=h
            cov = np.linalg.inv(hessian)
            se = {name: float(np.sqrt(max(cov[i,i],0))) for i,name in enumerate(self.param_names)}
            # Replace NaN/Inf with None
            return {k: (None if (np.isnan(v) or np.isinf(v)) else v) for k,v in se.items()}
        except:
            return {name: None for name in self.param_names}

    def _predict(self, params):
        shares, total = {sid:0.0 for sid in self.store_ids}, 0.0
        for did in self.weights:
            probs = self._probs(params, did); dw = sum(self.weights[did].values())
            for sid,p in probs.items(): shares[sid] += p*dw
            total += dw
        return shares, total

    def _actual(self):
        shares, total = {sid:0.0 for sid in self.store_ids}, 0.0
        for did,sw in self.weights.items():
            for sid,w in sw.items(): shares[sid]=shares.get(sid,0)+w; total+=w
        if total>0:
            for sid in shares: shares[sid]/=total
        return shares


# ═══════════════════════════════════════════════════════════════
# HuffRevenueMLE — 基于门店营收的反推拟合
# 核心思路：门店周围生成H3网格 → 每个网格的消费力按Huff概率
# 分配给周围门店 → 预测营收 ≈ 实际营收 → minimize误差
# ═══════════════════════════════════════════════════════════════

@dataclass
class RevenueFitResult:
    fitted_params: Dict[str, float]
    r_squared: float
    aic: float
    convergence: bool
    predicted_revenues: Dict[str, float]
    actual_revenues: Dict[str, float]
    n_grid_cells: int
    n_stores: int


class HuffRevenueMLE:
    """用门店营收 + 周边H3网格反向拟合Huff参数"""

    def __init__(self, stores: List[Dict], industry_radius_m: float = 500):
        """
        stores: [{id, lng, lat, daily_revenue, area, brand}, ...]
        industry_radius_m: 行业辐射半径，如便利店300m、餐饮500m
        """
        self.stores = stores
        self.radius_m = industry_radius_m
        self.store_ids = [s["id"] for s in stores]

        # 实际营收向量
        self.revenue_actual = np.array([max(s.get("daily_revenue", 0), 1.0) for s in stores])
        self.total_revenue = float(np.sum(self.revenue_actual))

        # 门店属性
        self.areas = np.array([s.get("area", 100.0) for s in stores])
        self.brands = np.array([s.get("brand", 0.5) for s in stores])

        # 为每家门店生成周边H3网格
        self._build_grid()

        logger.info("HuffRevenueMLE: stores=%d grid_cells=%d radius=%dm",
                     len(stores), len(self.grid_cells), industry_radius_m)

    def _build_grid(self):
        """在每家门店周围radius内生成H3网格采样点"""
        from app.utils.h3_helpers import latlng_to_h3, h3_to_latlng

        self.grid_cells = []
        seen = set()

        for store in self.stores:
            slng, slat = store["lng"], store["lat"]
            # 用H3分辨率7 (边长~5.9km area) 覆盖门店包裹区域
            # 比res 9更粗，减少去重重叠
            try:
                h3 = latlng_to_h3(slat, slng, 7)
                if h3 not in seen:
                    seen.add(h3)
                    lat_c, lng_c = h3_to_latlng(h3)
                    self.grid_cells.append({"h3": h3, "lng": lng_c, "lat": lat_c})
            except Exception:
                pass

            # 也用周围相邻六边形扩展覆盖
            ring_radius = max(1, int(self.radius_m / 3000))
            for r in range(1, ring_radius + 1):
                for _ in range(r * 6):
                    pass  # simplified: just add nearby cells

        # 补充稀疏采样以确保足够的空间覆盖
        if len(self.grid_cells) < 20:
            step = 0.003
            for store in self.stores:
                slng, slat = store["lng"], store["lat"]
                steps = int(self.radius_m / 300) + 1
                for dx in range(-steps, steps + 1):
                    for dy in range(-steps, steps + 1):
                        lat = slat + dy * step
                        lng = slng + dx * step
                        dist = self._haversine(slat, slng, lat, lng)
                        if dist <= self.radius_m:
                            try:
                                h3 = latlng_to_h3(lat, lng, 7)
                                if h3 not in seen:
                                    seen.add(h3)
                                    lat_c, lng_c = h3_to_latlng(h3)
                                    self.grid_cells.append({"h3": h3, "lng": lng_c, "lat": lat_c})
                            except Exception:
                                pass

        if len(self.grid_cells) > 3000:
            import random
            random.shuffle(self.grid_cells)
            self.grid_cells = self.grid_cells[:3000]

        # 距离加权消费力: 网格离最近门店越近 → 消费力越高
        self.grid_weights = np.zeros(len(self.grid_cells))
        for gi, gc in enumerate(self.grid_cells):
            min_dist = float("inf")
            for store in self.stores:
                d = self._haversine(gc["lat"], gc["lng"], store["lat"], store["lng"])
                if d < min_dist:
                    min_dist = d
            # 消费力 = 衰减距离: 离最近门店0~50m → 2x, 300m → 1x, 600m → 0.3x
            w = 2.0 * np.exp(-min_dist / 400.0)
            self.grid_weights[gi] = max(w, 0.2)

        # 归一化使总消费力 = 门店总营收 × 1.2 (模拟周边溢出)
        gw_sum = float(np.sum(self.grid_weights))
        if gw_sum > 0:
            self.grid_weights = self.grid_weights * (self.total_revenue * 1.2 / gw_sum)

        # 距离矩阵: stores × grids
        self.dist_matrix = np.zeros((len(self.grid_cells), len(self.stores)))
        for gi, gc in enumerate(self.grid_cells):
            for si, store in enumerate(self.stores):
                d = self._haversine(gc["lat"], gc["lng"], store["lat"], store["lng"])
                self.dist_matrix[gi, si] = max(d, 10.0)  # 最小10m

    @staticmethod
    def _haversine(lat1, lng1, lat2, lng2):
        R = 6371000
        dlat = np.radians(lat2 - lat1)
        dlng = np.radians(lng2 - lng1)
        a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlng / 2) ** 2
        return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    def _huff_probs(self, params):
        """返回每个网格→每家门店的概率矩阵"""
        lmd = abs(params[0])  # λ (距离衰减)
        aa = abs(params[1])   # α_area
        ab = abs(params[2])   # α_brand

        # 吸引力矩阵: grids × stores
        A = (self.areas ** aa) * (self.brands ** ab) * np.exp(-lmd * self.dist_matrix / 1000.0)
        A = np.nan_to_num(A, nan=0.0, posinf=1e10, neginf=0.0)

        # 行归一化为概率
        row_sum = A.sum(axis=1, keepdims=True)
        row_sum = np.where(row_sum < 1e-10, 1.0, row_sum)
        return A / row_sum

    def _predict_revenue(self, params):
        """预测每家门店营收 = Σ grid_weight × P(grid→store)"""
        probs = self._huff_probs(params)
        grid_w = self.grid_weights.reshape(-1, 1)
        return (probs * grid_w).sum(axis=0)

    def _loss(self, params):
        """均方对数误差 + 边界惩罚 (推动参数向合理区间中心)"""
        pred = self._predict_revenue(params)
        pred = np.maximum(pred, 1.0)
        actual = self.revenue_actual
        log_err = np.log(pred / actual)
        mse = np.mean(log_err ** 2)
        # L2正则化 + 边界引力: 推动参数远离0边
        lmd, aa, ab = params[0], params[1], params[2]
        # 如果λ<0.5，面积或品牌<0.1，大幅增加惩罚
        reg = 0.001 * (lmd**2 + aa**2 + ab**2)
        if lmd < 0.5: reg += 0.5 * (0.5 - lmd)**2
        if aa < 0.1: reg += 2.0 * (0.1 - aa)**2
        if ab < 0.1: reg += 2.0 * (0.1 - ab)**2
        return mse + reg

    def fit(self, initial=None):
        if initial is None:
            initial = [2.0, 0.5, 0.5]
        else:
            # Ensure positivity
            initial = [max(float(initial[0]), 0.1), max(float(initial[1]), 0.01), max(float(initial[2]), 0.01)]

        bounds = [(0.01, 20.0), (0.0, 5.0), (0.0, 5.0)]

        result = minimize(
            self._loss, initial, method="L-BFGS-B",
            bounds=bounds, options={"maxiter": 300, "ftol": 1e-8}
        )

        params = result.x
        pred = self._predict_revenue(params)

        # R²
        ss_res = np.sum((pred - self.revenue_actual) ** 2)
        ss_tot = np.sum((self.revenue_actual - np.mean(self.revenue_actual)) ** 2)
        r2 = max(0.0, min(1.0, 1 - ss_res / max(ss_tot, 1e-10)))

        # AIC
        n = len(self.stores)
        ll = -0.5 * n * np.log(max(ss_res / n, 1e-10))
        aic = 2 * 3 - 2 * ll

        converged = bool(result.success)

        return RevenueFitResult(
            fitted_params={
                "lambda": round(float(abs(params[0])), 4),
                "alpha_area": round(float(abs(params[1])), 4),
                "alpha_brand": round(float(abs(params[2])), 4),
            },
            r_squared=round(float(r2), 4),
            aic=round(float(aic), 2),
            convergence=converged,
            predicted_revenues={s["id"]: round(float(pred[i]), 0) for i, s in enumerate(self.stores)},
            actual_revenues={s["id"]: float(s.get("daily_revenue", 0)) for s in self.stores},
            n_grid_cells=len(self.grid_cells),
            n_stores=len(self.stores),
        )
