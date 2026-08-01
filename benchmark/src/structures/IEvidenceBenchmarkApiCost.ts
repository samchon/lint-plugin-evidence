/** Exact API-equivalent cost reconstructed from native per-request usage. */
export interface IEvidenceBenchmarkApiCost {
  provider: "openrouter";
  pricingAsOf: "2026-08-01";
  priceSource: "https://openrouter.ai/api/v1/models";
  currency: "USD";
  amountUsd: number;
  requests: number;
  shortContextRequests: number;
  longContextRequests: number;
  longContextThresholdTokens: 272_000;
}
