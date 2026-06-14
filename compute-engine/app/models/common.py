"""通用数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ComputeResponse(BaseModel):
    """统一响应格式"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, str]] = None
    meta: Optional[Dict[str, Any]] = None


class SitePoint(BaseModel):
    """空间点位"""
    id: str
    lng: float
    lat: float
    name: str = ""
    area: float = 100.0
    brand: float = 0.5
    daily_revenue: float = 0.0
    extras: Dict[str, float] = Field(default_factory=dict)


class DemandCell(BaseModel):
    """需求网格"""
    h3: str
    lng: float
    lat: float
    population: float
    consumption: float = 35.0


class GeoJSON(BaseModel):
    """GeoJSON (原始dict)"""
    type: str = "FeatureCollection"
    features: List[Dict[str, Any]] = Field(default_factory=list)
