"""Huff引力模型 MLE参数估计"""
import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class HuffFitResult:
    fitted_params: Dict[str, float]
    r_squared: float
    aic: float
    bic: float
    convergence: bool
    standard_errors: Dict[str, float]
    predicted_shares: Dict[str, float]
    n_observations: int


class HuffMLE:
    """
    Huff引力模型 MLE 估计器
    模型: P_ij = exp(V_ij) / Σ_k exp(V_ik)
      V_ij = β_const + β_area·ln(area_j) + β_brand·brand_j + β_dist·d_ij(km)
    """

    def __init__(
        self,
        demand_ids: List[str],
        store_attrs: Dict[str, Dict[str, float]],  # {store_id: {area, brand, ...}}
        observations: List[Dict],  # [{demand_id, store_id, weight, distance_m}]
        extra_attr_names: List[str] = None,
    ):
        self.demand_ids = list(set(demand_ids))
        self.store_ids = list(store_attrs.keys())
        self.store_attrs = store_attrs
        self.extra_attr_names = extra_attr_names or []
        self.param_names = ["const", "area", "brand", "dist"] + self.extra_attr_names

        self._build_matrices(observations)

    def _build_matrices(self, observations: List[Dict]):
        """构建设计矩阵和观测矩阵"""
        # X_base[store_id] = [1, ln(area), brand]
        self.X_base = {}
        for sid in self.store_ids:
            attrs = self.store_attrs[sid]
            row = [
                1.0,
                np.log(max(attrs.get("area", 100.0), 1.0)),
                attrs.get("brand", 0.5),
            ]
            for aname in self.extra_attr_names:
                row.append(attrs.get(aname, 0.0))
            self.X_base[sid] = np.array(row)

        # 距离和权重聚合
        self.distances = {}  # distances[did][sid]
        self.weights = {}    # weights[did][sid]
        for obs in observations:
            did = obs["demand_id"]
            sid = obs["store_id"]
            if did not in self.distances:
                self.distances[did] = {}
                self.weights[did] = {}
            w = obs.get("weight", 1.0)
            self.weights[did][sid] = self.weights[did].get(sid, 0) + w
            d = obs.get("distance_m", 0)
            if sid in self.distances[did]:
                self.distances[did][sid] = min(self.distances[did][sid], d)
            else:
                self.distances[did][sid] = d

    def _probs(self, params: np.ndarray, did: str) -> Dict[str, float]:
        """计算需求点did对所有门店的选择概率"""
        V = {}
        beta_base = params[:-1]
        beta_dist = params[-1]

        for sid in self.store_ids:
            base_V = np.dot(beta_base, self.X_base[sid])
            dist_km = self.distances.get(did, {}).get(sid, 10.0) / 1000.0
            V[sid] = base_V + beta_dist * dist_km

        V_arr = np.array([V[s] for s in self.store_ids])
        logsum = logsumexp(V_arr)
        return {sid: float(np.exp(V[sid] - logsum)) for sid in self.store_ids}

    def _neg_ll(self, params: np.ndarray) -> float:
        """负对数似然"""
        nll = 0.0
        total_w = 0.0
        for did in self.weights:
            if did not in self.distances:
                continue
            probs = self._probs(params, did)
            for sid, w in self.weights[did].items():
                p = max(probs.get(sid, 1e-10), 1e-10)
                nll -= w * np.log(p)
                total_w += w
        return nll / max(total_w, 1.0)

    def fit(self, initial: np.ndarray = None) -> HuffFitResult:
        """MLE拟合"""
        n = len(self.param_names)
        if initial is None:
            initial = np.zeros(n)
            initial[0] = -1.0
            initial[1] = 0.5
            initial[2] = 0.5
            initial[3] = -2.0

        logger.info(
            "开始Huff MLE拟合",
            extra={"module": "huff", "operation": "fit", "meta": f"stores={len(self.store_ids)}, obs={sum(len(v) for v in self.weights.values())}"},
        )

        result = minimize(self._neg_ll, initial, method="L-BFGS-B", options={"maxiter": 500, "ftol": 1e-8})

        params = result.x
        converged = bool(result.success)

        # 标准误 (数值Hessian)
        std_errs = self._compute_std_errors(params)

        # 预测市场份额
        pred_shares, _ = self._predict(params)
        actual_shares = self._actual_shares()

        # R²
        ss_res, ss_tot = 0.0, 0.0
        mean_act = sum(actual_shares.values()) / max(len(self.store_ids), 1)
        for sid in self.store_ids:
            a = actual_shares.get(sid, 0)
            p = pred_shares.get(sid, 0)
            ss_res += (a - p) ** 2
            ss_tot += (a - mean_act) ** 2
        r2 = 1 - ss_res / max(ss_tot, 1e-10)

        n_obs = int(sum(sum(v.values()) for v in self.weights.values()))
        ll = -self._neg_ll(params) * n_obs
        aic = 2 * n - 2 * ll
        bic = n * np.log(max(n_obs, 1)) - 2 * ll

        fit_result = HuffFitResult(
            fitted_params={name: round(float(params[i]), 6) for i, name in enumerate(self.param_names)},
            r_squared=round(r2, 4),
            aic=round(aic, 2),
            bic=round(bic, 2),
            convergence=converged,
            standard_errors={name: round(float(std_errs.get(name, 0)), 6) for name in self.param_names},
            predicted_shares={sid: round(s, 4) for sid, s in pred_shares.items()},
            n_observations=n_obs,
        )

        logger.info(
            f"Huff拟合完成 R²={r2:.3f} AIC={aic:.0f}",
            extra={"module": "huff", "operation": "fit", "meta": str(fit_result.fitted_params)},
        )

        return fit_result

    def _compute_std_errors(self, params: np.ndarray) -> Dict[str, float]:
        """数值Hessian → 标准误"""
        n = len(params)
        eps = 1e-5
        try:
            hessian = np.zeros((n, n))
            f0 = self._neg_ll(params)
            for i in range(n):
                for j in range(i, n):
                    p_ij = params.copy(); p_ij[i] += eps; p_ij[j] += eps
                    p_i = params.copy(); p_i[i] += eps
                    p_j = params.copy(); p_j[j] += eps
                    f_ij = self._neg_ll(p_ij); f_i = self._neg_ll(p_i); f_j = self._neg_ll(p_j)
                    h = (f_ij - f_i - f_j + f0) / (eps * eps)
                    hessian[i, j] = h; hessian[j, i] = h
            cov = np.linalg.inv(hessian)
            return {name: float(np.sqrt(max(cov[i, i], 0))) for i, name in enumerate(self.param_names)}
        except Exception:
            return {name: float("nan") for name in self.param_names}

    def _predict(self, params: np.ndarray):
        """预测每个门店的总份额"""
        shares = {sid: 0.0 for sid in self.store_ids}
        total = 0.0
        for did in self.weights:
            probs = self._probs(params, did)
            dw = sum(self.weights[did].values())
            for sid, p in probs.items():
                shares[sid] += p * dw
            total += dw
        return shares, total

    def _actual_shares(self) -> Dict[str, float]:
        shares = {sid: 0.0 for sid in self.store_ids}
        total = 0.0
        for did, sw in self.weights.items():
            for sid, w in sw.items():
                shares[sid] = shares.get(sid, 0) + w
                total += w
        if total > 0:
            for sid in shares:
                shares[sid] /= total
        return shares
