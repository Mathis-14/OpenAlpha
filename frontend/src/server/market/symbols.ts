export function normalizeDashboardSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function toProviderSymbol(symbol: string): string {
  return normalizeDashboardSymbol(symbol).replace(/\./g, "-");
}

export function toDisplaySymbol(symbol: string): string {
  const normalized = normalizeDashboardSymbol(symbol);
  if (/^[A-Z]{1,5}-[A-Z]{1,2}$/.test(normalized)) {
    return normalized.replace("-", ".");
  }
  return normalized;
}

export function looksLikeExactTicker(query: string): boolean {
  const normalized = normalizeDashboardSymbol(query);
  return /^[A-Z0-9]{1,5}([.-][A-Z0-9]{1,3})?$/.test(normalized);
}
