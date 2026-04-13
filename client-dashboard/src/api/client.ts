export interface MetricRow {
  name: string;
  value: number;
}

export async function fetchMetrics(): Promise<MetricRow[]> {
  return Promise.resolve([
    { name: "activeUsers", value: 128 },
    { name: "conversionRate", value: 42 },
    { name: "errorBudget", value: 3 }
  ]);
}
