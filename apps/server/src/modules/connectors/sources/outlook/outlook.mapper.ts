export function mapOutlookPlaceholder(): Record<string, unknown> {
  return {
    provider: "microsoft-graph",
    sync: "delta-query-prepared"
  };
}
