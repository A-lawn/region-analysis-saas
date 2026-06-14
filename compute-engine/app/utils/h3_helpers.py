"""H3 网格工具"""
import h3
import math
from typing import List, Tuple


def latlng_to_h3(lat: float, lng: float, resolution: int = 9) -> str:
    """经纬度 → H3索引"""
    return h3.latlng_to_cell(lat, lng, resolution)


def h3_ring(h3_index: str, ring_size: int = 1) -> List[str]:
    """H3环邻居"""
    return list(h3.grid_ring(h3_index, ring_size))


def h3_to_latlng(h3_index: str) -> Tuple[float, float]:
    """H3 → 中心经纬度"""
    lat, lng = h3.cell_to_latlng(h3_index)
    return lat, lng


def haversine_distance(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """直线距离 (米)"""
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
