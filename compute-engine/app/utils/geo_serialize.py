"""GeoJSON序列化工具"""
import json
from typing import List, Dict, Any


def points_to_geojson(points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """点集 → GeoJSON FeatureCollection"""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [p["lng"], p["lat"]],
                },
                "properties": {k: v for k, v in p.items() if k not in ("lng", "lat")},
            }
            for p in points
        ],
    }


def h3_grid_to_geojson(h3_indices: List[str], properties_fn=None) -> Dict[str, Any]:
    """H3网格 → GeoJSON FeatureCollection (六边形)"""
    import h3
    features = []
    for idx in h3_indices:
        boundary = h3.cell_to_boundary(idx)
        # 转换为 [[lng,lat], ...] 格式
        coords = [[c[1], c[0]] for c in boundary]
        coords.append(coords[0])  # 闭合
        props = properties_fn(idx) if properties_fn else {}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {"h3": idx, **props},
        })
    return {"type": "FeatureCollection", "features": features}


def serialize_geojson(obj: Any) -> str:
    """安全序列化GeoJSON"""
    return json.dumps(obj, ensure_ascii=False, default=str)
