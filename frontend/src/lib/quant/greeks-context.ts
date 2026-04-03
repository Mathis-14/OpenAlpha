import type {
  QuantGreeksActiveTenor,
  QuantGreeksTermNode,
} from "@/types/api";

function sortNodes(nodes: QuantGreeksTermNode[]): QuantGreeksTermNode[] {
  return [...nodes].sort((left, right) => left.time_to_expiry_years - right.time_to_expiry_years);
}

function clampTargetYears(nodes: QuantGreeksTermNode[], targetYears: number) {
  if (nodes.length === 0) {
    return Math.max(targetYears, 1 / 365.25);
  }

  const min = nodes[0]!.time_to_expiry_years;
  const max = nodes[nodes.length - 1]!.time_to_expiry_years;
  return Math.min(max, Math.max(min, targetYears));
}

export function interpolateTotalVariance(
  lowerTimeYears: number,
  lowerVolatility: number,
  upperTimeYears: number,
  upperVolatility: number,
  targetTimeYears: number,
): number {
  const lowerT = Math.max(lowerTimeYears, 1e-6);
  const upperT = Math.max(upperTimeYears, 1e-6);
  const targetT = Math.max(targetTimeYears, 1e-6);

  if (Math.abs(upperT - lowerT) < 1e-8) {
    return lowerVolatility;
  }

  const lowerTotalVariance = lowerVolatility * lowerVolatility * lowerT;
  const upperTotalVariance = upperVolatility * upperVolatility * upperT;
  const weight = (targetT - lowerT) / (upperT - lowerT);
  const targetTotalVariance =
    lowerTotalVariance + weight * (upperTotalVariance - lowerTotalVariance);

  return Math.sqrt(Math.max(targetTotalVariance / targetT, 1e-10));
}

export function interpolateLinearly(
  lowerX: number,
  lowerY: number,
  upperX: number,
  upperY: number,
  targetX: number,
): number {
  if (Math.abs(upperX - lowerX) < 1e-8) {
    return lowerY;
  }

  const weight = (targetX - lowerX) / (upperX - lowerX);
  return lowerY + weight * (upperY - lowerY);
}

export function deriveActiveTenor(
  nodes: QuantGreeksTermNode[],
  targetDaysToExpiry: number,
): (QuantGreeksActiveTenor & {
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
}) | null {
  if (nodes.length === 0) {
    return null;
  }

  const sortedNodes = sortNodes(nodes);
  const requestedDays = Math.max(targetDaysToExpiry, 1);
  const requestedYears = requestedDays / 365.25;
  const clampedYears = clampTargetYears(sortedNodes, requestedYears);
  const exactNode =
    sortedNodes.find((node) => Math.abs(node.days_to_expiry - requestedDays) < 0.5) ??
    sortedNodes.find(
      (node) => Math.abs(node.time_to_expiry_years - clampedYears) < 1e-8,
    );

  if (exactNode) {
    return {
      mode: "listed",
      expiration: exactNode.expiration,
      days_to_expiry: exactNode.days_to_expiry,
      time_to_expiry_years: exactNode.time_to_expiry_years,
      lower_anchor: exactNode,
      upper_anchor: exactNode,
      clamped: Math.abs(requestedDays - exactNode.days_to_expiry) > 0.5,
      volatility: exactNode.volatility,
      riskFreeRate: exactNode.risk_free_rate,
      dividendYield: exactNode.dividend_yield,
    };
  }

  const upperIndex = sortedNodes.findIndex((node) => node.time_to_expiry_years > clampedYears);
  if (upperIndex <= 0) {
    const edgeNode = sortedNodes[0]!;
    return {
      mode: "listed",
      expiration: edgeNode.expiration,
      days_to_expiry: edgeNode.days_to_expiry,
      time_to_expiry_years: edgeNode.time_to_expiry_years,
      lower_anchor: edgeNode,
      upper_anchor: edgeNode,
      clamped: requestedDays < edgeNode.days_to_expiry,
      volatility: edgeNode.volatility,
      riskFreeRate: edgeNode.risk_free_rate,
      dividendYield: edgeNode.dividend_yield,
    };
  }

  const lowerNode = sortedNodes[upperIndex - 1]!;
  const upperNode = sortedNodes[upperIndex]!;
  const volatility = interpolateTotalVariance(
    lowerNode.time_to_expiry_years,
    lowerNode.volatility,
    upperNode.time_to_expiry_years,
    upperNode.volatility,
    clampedYears,
  );
  const riskFreeRate = interpolateLinearly(
    lowerNode.time_to_expiry_years,
    lowerNode.risk_free_rate,
    upperNode.time_to_expiry_years,
    upperNode.risk_free_rate,
    clampedYears,
  );
  const dividendYield = interpolateLinearly(
    lowerNode.time_to_expiry_years,
    lowerNode.dividend_yield,
    upperNode.time_to_expiry_years,
    upperNode.dividend_yield,
    clampedYears,
  );

  return {
    mode: "interpolated",
    days_to_expiry: Math.max(1, Math.round(clampedYears * 365.25)),
    time_to_expiry_years: clampedYears,
    lower_anchor: lowerNode,
    upper_anchor: upperNode,
    clamped: Math.abs(requestedYears - clampedYears) > 1e-8,
    volatility,
    riskFreeRate,
    dividendYield,
  };
}
