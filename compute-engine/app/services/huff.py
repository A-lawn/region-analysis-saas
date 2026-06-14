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
            V[sid] = float(np.dot(beta_base, self.X_base[sid]) + beta_dist * self.distances.get(did,{}).get(sid,10.0)/1000.0)
        V_arr = np.array([V[s] for s in self.store_ids])
        ls = logsumexp(V_arr)
        return {sid: float(np.exp(V[sid]-ls)) for sid in self.store_ids}

    def _neg_ll(self, params):
        nll, tw = 0.0, 0.0
        for did in self.weights:
            if did not in self.distances: continue
            probs = self._probs(params, did)
            for sid, w in self.weights[did].items():
                nll -= w * np.log(max(probs.get(sid,1e-10),1e-10)); tw += w
        return nll/max(tw,1.0)

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
        ll = -self._neg_ll(params)*n_obs
        aic = 2*n - 2*ll; bic = n*np.log(max(n_obs,1)) - 2*ll

        fr = HuffFitResult(
            fitted_params={name:round(float(params[i]),6) for i,name in enumerate(self.param_names)},
            r_squared=round(r2,4), aic=round(aic,2), bic=round(bic,2), convergence=converged,
            standard_errors={name:round(float(se.get(name,0)),6) for name in self.param_names},
            predicted_shares={sid:round(s,4) for sid,s in pred.items()}, n_observations=n_obs)
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
            return {name: float(np.sqrt(max(cov[i,i],0))) for i,name in enumerate(self.param_names)}
        except: return {name: float("nan") for name in self.param_names}

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
