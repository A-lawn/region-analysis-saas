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
