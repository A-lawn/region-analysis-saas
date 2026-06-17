"""博弈选址数据模型"""
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from app.models.common import SitePoint, DemandCell


class GameSolveRequest(BaseModel):
    """博弈选址求解请求"""
    project_id: str
    industry: str = "convenience"
    leader_candidates: List[SitePoint]
    follower_candidates: List[SitePoint]
    leader_p: int = Field(ge=1, le=20)
    follower_q: int = Field(ge=0, le=20)
    h3_demand: List[DemandCell]
    huff_params: Dict[str, float] = Field(default_factory=dict)
    distance_matrix: Optional[Dict[str, Dict[str, float]]] = None
    iterations: int = Field(default=200, ge=50, le=2000)
    # P0: pre-filtering control
    enable_filtering: bool = True
    site_kpi_values: Optional[Dict[str, Dict[str, float]]] = None
    # P1: robust solve
    enable_robust: bool = False
    robust_runs: int = Field(default=5, ge=2, le=20)
    standard_errors: Optional[Dict[str, float]] = None


class GameSolveResponse(BaseModel):
    """博弈选址求解响应"""
    leader_sites: List[str]
    leader_revenue: float
    follower_sites: List[str]
    follower_revenue: float
    cannibalization_pct: float
    market_share: Dict[str, float]
    cannibalization_map: Optional[Dict[str, Any]] = None
    pareto_alternatives: List[Dict[str, Any]] = Field(default_factory=list)
    solver_stats: Dict[str, Any] = Field(default_factory=dict)
    # P0: filter report
    filter_report: Optional[Dict[str, Any]] = None
    # P1: robust analysis
    robust: Optional[Dict[str, Any]] = None


class ScenarioRequest(BaseModel):
    """情景模拟请求"""
    label: str
    type: str = "counter_attack"  # counter_attack | what_if_follower_exists
    follower_q_override: Optional[int] = None
    follower_fixed: Optional[List[str]] = None


class CompareRequest(BaseModel):
    """A/B选址对比请求"""
    plan_a_sites: List[str]
    plan_b_sites: List[str]


class HuffFitRequest(BaseModel):
    """Huff参数拟合请求"""
    project_id: str
    industry: Optional[str] = None
    store_attributes: Dict[str, Dict[str, float]]
    demand_points: List[str]
    observations: List[Dict[str, Any]]  # {demand_id, store_id, weight, distance_m}
    extra_attr_names: List[str] = Field(default_factory=list)


# ================================================================
# v2.1 新模型: LP 选址优化
# ================================================================

class LPCandidate(BaseModel):
    """LP 选址候选点"""
    id: str
    lng: float
    lat: float
    score: float = 50.0
    cost: float = 1.0
    revenue: float = 0.0


class LPOptimizeRequest(BaseModel):
    """LP 选址优化请求"""
    project_id: str = ""
    industry: str = "convenience"
    candidates: List[LPCandidate]
    budget: float = Field(ge=0, description="总预算（可以是实际金额或虚拟单位）")
    min_distance_m: float = Field(default=0, ge=0, le=100000, description="候选点最小间距约束(m)")
    use_score_as_cost: bool = Field(default=False, description="无成本数据时，用 score 作为虚拟成本")


# ================================================================
# v2.1 新模型: 空间统计分析
# ================================================================

class SpatialPointInput(BaseModel):
    """空间统计输入点"""
    id: str
    lng: float
    lat: float
    weight: float = 1.0


class SpatialStatsRequest(BaseModel):
    """空间统计请求"""
    project_id: str = ""
    points: List[SpatialPointInput] = Field(min_length=3)
    n_permutations: int = Field(default=999, ge=99, le=9999, description="Moran\'s I 置换检验次数")
    ripley_rings: int = Field(default=20, ge=5, le=100, description="Ripley\'s K 环数")
    ripley_max_distance_m: Optional[float] = Field(default=None, description="Ripley\'s K 最大距离(m)，None=自动")
