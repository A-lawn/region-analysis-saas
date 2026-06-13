export { loadIndustryConfig, loadAllIndustryConfigs, detectIndustry, getDefaultRadius } from "./industryLoader";
export type { IndustryConfig } from "../../config/industry.config";
export { compareWithBenchmarks } from "./benchmarkService";
export type { BenchmarkResult, BenchmarkComparison } from "./benchmarkService";
export { normalizeKpi, batchNormalizeKpis, weightedSum } from "./kpiNormalizer";
export type { NormalizationType, NormalizationParams, KpiNormalizerEntry, KpiValueMap } from "./kpiNormalizer";
