-- 2024-06-12: Refactor site_optimization_models weights to algorithm + kpi_mapping
-- Also add supermarket and auto4s industry presets

UPDATE site_optimization_models SET weights = '{
  "algorithm": "weighted_sum",
  "kpi_mapping": {
    "walkableRatio": 0.40,
    "competitorAvoidance": 0.25,
    "poiDensity": 0.20,
    "rentFactor": 0.15
  }
}'::jsonb WHERE industry = 'convenience';

UPDATE site_optimization_models SET weights = '{
  "algorithm": "weighted_sum",
  "kpi_mapping": {
    "footTraffic": 0.35,
    "visibility": 0.25,
    "competitionDensity": 0.20,
    "deliveryCoverage": 0.20
  }
}'::jsonb WHERE industry = 'restaurant';

UPDATE site_optimization_models SET weights = '{
  "algorithm": "weighted_sum",
  "kpi_mapping": {
    "populationStructure": 0.30,
    "medicalCoverage": 0.25,
    "competitorDistance": 0.20,
    "transportConvenience": 0.15,
    "policyCompliance": 0.10
  }
}'::jsonb WHERE industry = 'pharmacy';

-- New: supermarket (商超)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters)
VALUES ('supermarket', '商超', '{
  "algorithm": "weighted_sum",
  "kpi_mapping": {
    "populationDensity": 0.30,
    "trafficAccessibility": 0.25,
    "competitorDistance": 0.20,
    "parkingAvailability": 0.15,
    "rentLevel": 0.10
  }
}'::jsonb, '商超选址：人口密度与交通可达性优先，回避竞品，关注停车位与租金', true, 3000)
ON CONFLICT (industry) DO UPDATE SET
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters;

-- New: auto4s (汽车4S店)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters)
VALUES ('auto4s', '汽车4S店', '{
  "algorithm": "weighted_sum",
  "kpi_mapping": {
    "roadFrontage": 0.25,
    "landAvailability": 0.25,
    "competitorClustering": 0.20,
    "regionalCarOwnership": 0.20,
    "zoningCompliance": 0.10
  }
}'::jsonb, '汽车4S店选址：临路面宽与地块面积优先，产业集群效应明显，关注区域保有量', true, 10000)
ON CONFLICT (industry) DO UPDATE SET
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters;

-- Also update existing radius_meters
UPDATE site_optimization_models SET radius_meters = 300 WHERE industry = 'convenience';
UPDATE site_optimization_models SET radius_meters = 500 WHERE industry = 'restaurant';
UPDATE site_optimization_models SET radius_meters = 800 WHERE industry = 'pharmacy';
