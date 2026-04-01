import type {
  QuantOptionChain,
  QuantOptionContract,
  QuantSurfacePoint,
  QuantSurfaceResult,
} from "@/types/api";

type SSVIObservation = QuantSurfacePoint & {
  option_type: QuantOptionContract["option_type"];
  total_variance: number;
  log_moneyness: number;
  liquidity_score: number;
};

type ThetaSlice = {
  expiration: string;
  days_to_expiry: number;
  time_to_expiry_years: number;
  theta: number;
};

type SSVIParameters = {
  rho: number;
  eta: number;
  gamma: number;
  butterfly_margin: number;
  loss: number;
};

type ExpiryFit = {
  expiration: string;
  theta: number;
  loss: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.floor((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index];
}

export function ssviPhiPowerLaw(
  theta: number,
  eta: number,
  gamma: number,
): number {
  const thetaSafe = Math.max(theta, 1e-10);
  return eta / (thetaSafe ** gamma * (1 + thetaSafe) ** (1 - gamma));
}

export function ssviVariance(
  logMoneyness: number,
  theta: number,
  rho: number,
  eta: number,
  gamma: number,
): number {
  const phi = ssviPhiPowerLaw(theta, eta, gamma);
  const sqrtTerm = Math.sqrt((phi * logMoneyness + rho) ** 2 + (1 - rho ** 2));

  return (theta / 2) * (1 + rho * phi * logMoneyness + sqrtTerm);
}

function getPriceProxy(contract: QuantOptionContract): number | null {
  const candidate = contract.midpoint ?? contract.last_price ?? contract.bid ?? contract.ask;
  return candidate != null && Number.isFinite(candidate) ? candidate : null;
}

function getSpreadRatio(contract: QuantOptionContract): number | null {
  if (
    contract.bid == null ||
    contract.ask == null ||
    contract.bid <= 0 ||
    contract.ask <= 0
  ) {
    return null;
  }

  const midpoint = (contract.bid + contract.ask) / 2;
  return (contract.ask - contract.bid) / Math.max(midpoint, 0.01);
}

function getLiquidityScore(
  contract: QuantOptionContract,
  absLogMoneyness: number,
): number {
  let score = 0;
  const price = getPriceProxy(contract);
  if (price != null && price > 0.05) {
    score += 2;
  }

  if (contract.open_interest != null && contract.open_interest > 0) {
    score += Math.min(6, Math.log1p(contract.open_interest));
  }

  if (contract.volume != null && contract.volume > 0) {
    score += Math.min(4, Math.log1p(contract.volume));
  }

  score += Math.max(0, 1.4 - absLogMoneyness * 2.5);
  const spreadRatio = getSpreadRatio(contract);
  if (spreadRatio != null) {
    score -= Math.min(1.4, spreadRatio * 0.85);
  }
  return score;
}

function isUsableContract(
  contract: QuantOptionContract,
  logMoneyness: number,
): boolean {
  const iv = contract.implied_volatility;
  const price = getPriceProxy(contract);
  const absLogMoneyness = Math.abs(logMoneyness);

  if (
    iv == null ||
    !Number.isFinite(iv) ||
    iv < 0.01 ||
    iv > 4.5 ||
    !Number.isFinite(contract.strike) ||
    contract.strike <= 0 ||
    price == null ||
    price <= 0.01 ||
    absLogMoneyness > 0.6
  ) {
    return false;
  }

  if (contract.bid != null && contract.ask != null && contract.bid > 0 && contract.ask > 0) {
    const midpoint = (contract.bid + contract.ask) / 2;
    const spreadRatio = (contract.ask - contract.bid) / Math.max(midpoint, 0.01);
    if (spreadRatio > 2.2) {
      return false;
    }
    if (spreadRatio > 1.15 && absLogMoneyness > 0.14) {
      return false;
    }
  }

  if (price <= 0.05 && absLogMoneyness > 0.18) {
    return false;
  }

  const hasLiquidity =
    (contract.open_interest != null && contract.open_interest > 0) ||
    (contract.volume != null && contract.volume > 0);

  if (!hasLiquidity && absLogMoneyness > 0.12) {
    return false;
  }

  return true;
}

function estimateForwardFromParity(
  expiration: QuantOptionChain["expirations"][number],
  spotPrice: number,
  riskFreeRate: number,
): number {
  const naiveForward = spotPrice * Math.exp(riskFreeRate * expiration.time_to_expiry_years);
  const callsByStrike = new Map(
    expiration.calls.map((contract) => [contract.strike, contract] as const),
  );
  const putsByStrike = new Map(
    expiration.puts.map((contract) => [contract.strike, contract] as const),
  );
  const candidates: Array<{ forward: number; score: number }> = [];

  for (const [strike, call] of callsByStrike.entries()) {
    const put = putsByStrike.get(strike);
    if (!put) {
      continue;
    }

    const distanceToSpot = Math.abs(Math.log(strike / spotPrice));
    if (distanceToSpot > 0.16) {
      continue;
    }

    const callPrice = getPriceProxy(call);
    const putPrice = getPriceProxy(put);
    if (callPrice == null || putPrice == null) {
      continue;
    }

    const impliedForward =
      strike +
      Math.exp(riskFreeRate * expiration.time_to_expiry_years) * (callPrice - putPrice);

    if (
      !Number.isFinite(impliedForward) ||
      impliedForward <= 0 ||
      impliedForward < naiveForward * 0.82 ||
      impliedForward > naiveForward * 1.18
    ) {
      continue;
    }

    const score =
      getLiquidityScore(call, distanceToSpot) +
      getLiquidityScore(put, distanceToSpot) -
      distanceToSpot * 12;

    candidates.push({ forward: impliedForward, score });
  }

  if (candidates.length === 0) {
    return naiveForward;
  }

  const forwards = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 9)
    .map((candidate) => candidate.forward);

  return median(forwards) ?? naiveForward;
}

function buildObservation(
  contract: QuantOptionContract | undefined,
  forward: number,
  expiration: QuantOptionChain["expirations"][number],
): SSVIObservation | null {
  if (!contract) {
    return null;
  }

  const logMoneyness = Math.log(contract.strike / forward);
  if (!isUsableContract(contract, logMoneyness)) {
    return null;
  }

  return {
    expiration: expiration.expiration,
    days_to_expiry: expiration.days_to_expiry,
    time_to_expiry_years: expiration.time_to_expiry_years,
    strike: contract.strike,
    moneyness: Number((contract.strike / forward).toFixed(4)),
    implied_volatility: Number(contract.implied_volatility!.toFixed(6)),
    option_type: contract.option_type,
    total_variance: Number(
      (contract.implied_volatility! ** 2 * expiration.time_to_expiry_years).toFixed(8),
    ),
    log_moneyness: Number(logMoneyness.toFixed(6)),
    liquidity_score: getLiquidityScore(contract, Math.abs(logMoneyness)),
  };
}

function chooseObservationForStrike(
  callObservation: SSVIObservation | null,
  putObservation: SSVIObservation | null,
  forward: number,
  strike: number,
): SSVIObservation | null {
  if (!callObservation && !putObservation) {
    return null;
  }

  if (!callObservation) {
    return putObservation;
  }

  if (!putObservation) {
    return callObservation;
  }

  const desiredType: QuantOptionContract["option_type"] =
    strike >= forward ? "call" : "put";
  const callScore =
    callObservation.liquidity_score +
    (callObservation.option_type === desiredType ? 0.35 : 0) +
    (Math.abs(callObservation.log_moneyness) < 0.035 ? 0.45 : 0);
  const putScore =
    putObservation.liquidity_score +
    (putObservation.option_type === desiredType ? 0.35 : 0) +
    (Math.abs(putObservation.log_moneyness) < 0.035 ? 0.45 : 0);

  if (
    Math.abs(callObservation.implied_volatility - putObservation.implied_volatility) > 0.14
  ) {
    const lowerIvObservation =
      callObservation.implied_volatility <= putObservation.implied_volatility
        ? callObservation
        : putObservation;
    const higherIvObservation =
      lowerIvObservation === callObservation ? putObservation : callObservation;

    if (higherIvObservation.liquidity_score <= lowerIvObservation.liquidity_score + 0.9) {
      return lowerIvObservation;
    }
  }

  return callScore >= putScore ? callObservation : putObservation;
}

function buildExpirationObservations(
  chain: QuantOptionChain,
  riskFreeRate: number,
): {
  observations: SSVIObservation[];
  rawPointCount: number;
  warnings: string[];
} {
  const observations: SSVIObservation[] = [];
  const warnings: string[] = [];
  let rawPointCount = 0;

  for (const expiration of chain.expirations) {
    if (expiration.days_to_expiry < 7) {
      warnings.push(
        `Skipped ${expiration.expiration} because the expiry is too short-dated for stable SSVI calibration.`,
      );
      continue;
    }

    const forward = estimateForwardFromParity(expiration, chain.spot_price, riskFreeRate);
    const callsByStrike = new Map(
      expiration.calls.map((contract) => [contract.strike, contract] as const),
    );
    const putsByStrike = new Map(
      expiration.puts.map((contract) => [contract.strike, contract] as const),
    );
    const preferredByStrike = new Map<number, SSVIObservation>();

    rawPointCount += expiration.calls.length + expiration.puts.length;

    const allStrikes = Array.from(
      new Set([...callsByStrike.keys(), ...putsByStrike.keys()]),
    ).sort((left, right) => left - right);

    for (const strike of allStrikes) {
      const chosenObservation = chooseObservationForStrike(
        buildObservation(callsByStrike.get(strike), forward, expiration),
        buildObservation(putsByStrike.get(strike), forward, expiration),
        forward,
        strike,
      );

      if (chosenObservation) {
        preferredByStrike.set(strike, chosenObservation);
      }
    }

    const expirationObservations = Array.from(preferredByStrike.values()).sort(
      (left, right) => left.log_moneyness - right.log_moneyness,
    );

    if (expirationObservations.length < 5) {
      warnings.push(
        `Skipped ${expiration.expiration} because too few liquid strikes remained after filtering.`,
      );
      continue;
    }

    const atmObservation = expirationObservations.reduce((best, observation) => {
      if (!best) {
        return observation;
      }

      return Math.abs(observation.log_moneyness) < Math.abs(best.log_moneyness)
        ? observation
        : best;
    }, expirationObservations[0]);

    const atmVariance = atmObservation.total_variance;
    const trimmed = expirationObservations.filter((observation) => {
      const varianceRatio = observation.total_variance / Math.max(atmVariance, 1e-8);
      return varianceRatio >= 0.2 && varianceRatio <= 6 && Math.abs(observation.log_moneyness) <= 0.45;
    });

    if (trimmed.length < 5) {
      warnings.push(
        `Kept the broader filtered set for ${expiration.expiration} because aggressive trimming removed too many strikes.`,
      );
      observations.push(...expirationObservations);
      continue;
    }

    observations.push(...trimmed);
  }

  return { observations, rawPointCount, warnings };
}

function estimateThetaSlices(observations: SSVIObservation[]): ThetaSlice[] {
  const groups = new Map<string, SSVIObservation[]>();
  for (const observation of observations) {
    const bucket = groups.get(observation.expiration);
    if (bucket) {
      bucket.push(observation);
    } else {
      groups.set(observation.expiration, [observation]);
    }
  }

  const slices = Array.from(groups.entries())
    .map(([expiration, rows]) => {
      const sorted = [...rows].sort(
        (left, right) => Math.abs(left.log_moneyness) - Math.abs(right.log_moneyness),
      );
      const anchor = sorted.filter((row) => Math.abs(row.log_moneyness) <= 0.06).slice(0, 3);
      const reference = anchor.length > 0 ? anchor : sorted.slice(0, Math.min(3, sorted.length));
      const weightSum = reference.reduce(
        (sum, row) =>
          sum +
          (0.8 + Math.min(row.liquidity_score, 6) * 0.2) /
            (1 + Math.abs(row.log_moneyness) * 40),
        0,
      );
      const theta = reference.reduce((sum, row) => {
        const weight =
          (0.8 + Math.min(row.liquidity_score, 6) * 0.2) /
          (1 + Math.abs(row.log_moneyness) * 40);
        return sum + row.total_variance * (weight / weightSum);
      }, 0);

      return {
        expiration,
        days_to_expiry: sorted[0].days_to_expiry,
        time_to_expiry_years: sorted[0].time_to_expiry_years,
        theta: Math.max(theta, 1e-6),
      };
    })
    .sort((left, right) => left.time_to_expiry_years - right.time_to_expiry_years);

  let runningTheta = 0;
  return slices.map((slice) => {
    runningTheta = Math.max(runningTheta + 1e-8, slice.theta);
    return {
      ...slice,
      theta: Number(runningTheta.toFixed(8)),
    };
  });
}

function evaluateLoss(
  parameters: { rho: number; eta: number; gamma: number },
  thetaSlices: ThetaSlice[],
  observations: SSVIObservation[],
): SSVIParameters {
  const thetaByExpiry = new Map(thetaSlices.map((slice) => [slice.expiration, slice.theta]));
  const butterflyMargin = 2 - parameters.eta * (1 + Math.abs(parameters.rho));
  if (butterflyMargin <= 0) {
    return {
      ...parameters,
      butterfly_margin: butterflyMargin,
      loss: Number.POSITIVE_INFINITY,
    };
  }

  let loss = 0;
  for (const observation of observations) {
    const theta = thetaByExpiry.get(observation.expiration);
    if (theta == null) {
      continue;
    }

    const modelVariance = ssviVariance(
      observation.log_moneyness,
      theta,
      parameters.rho,
      parameters.eta,
      parameters.gamma,
    );
    const weight =
      clamp(0.65 + observation.liquidity_score / 7, 0.65, 2) /
      (1 + Math.abs(observation.log_moneyness) * 3.2);
    loss += weight * (modelVariance - observation.total_variance) ** 2;
  }

  return {
    ...parameters,
    butterfly_margin: butterflyMargin,
    loss,
  };
}

function evaluateExpiryLoss(
  theta: number,
  parameters: { rho: number; eta: number; gamma: number },
  observations: SSVIObservation[],
): number {
  let loss = 0;

  for (const observation of observations) {
    const modelVariance = ssviVariance(
      observation.log_moneyness,
      theta,
      parameters.rho,
      parameters.eta,
      parameters.gamma,
    );
    const weight =
      clamp(0.65 + observation.liquidity_score / 7, 0.65, 2) /
      (1 + Math.abs(observation.log_moneyness) * 2.8);
    loss += weight * (modelVariance - observation.total_variance) ** 2;
  }

  return loss;
}

function modelImpliedVolatility(
  observation: SSVIObservation,
  theta: number,
  parameters: { rho: number; eta: number; gamma: number },
): number {
  const totalVariance = ssviVariance(
    observation.log_moneyness,
    theta,
    parameters.rho,
    parameters.eta,
    parameters.gamma,
  );

  return Math.sqrt(Math.max(totalVariance / observation.time_to_expiry_years, 1e-10));
}

function pruneResidualOutliers(
  observations: SSVIObservation[],
  thetaSlices: ThetaSlice[],
  parameters: { rho: number; eta: number; gamma: number },
): {
  observations: SSVIObservation[];
  removedCount: number;
} {
  const thetaByExpiry = new Map(thetaSlices.map((slice) => [slice.expiration, slice.theta]));
  const byExpiry = new Map<string, SSVIObservation[]>();

  for (const observation of observations) {
    const bucket = byExpiry.get(observation.expiration);
    if (bucket) {
      bucket.push(observation);
    } else {
      byExpiry.set(observation.expiration, [observation]);
    }
  }

  let removedCount = 0;
  const keptObservations: SSVIObservation[] = [];

  for (const rows of byExpiry.values()) {
    const theta = thetaByExpiry.get(rows[0]?.expiration ?? "");
    if (theta == null) {
      keptObservations.push(...rows);
      continue;
    }

    const scored = rows.map((observation) => ({
      observation,
      diff: Math.abs(
        modelImpliedVolatility(observation, theta, parameters) -
          observation.implied_volatility,
      ),
    }));
    const diffs = scored.map((entry) => entry.diff);
    const medianDiff = median(diffs) ?? 0;
    const mad =
      median(diffs.map((diff) => Math.abs(diff - medianDiff))) ?? medianDiff;
    const p75 = percentile(diffs, 0.75) ?? medianDiff;
    const threshold = Math.max(0.04, medianDiff + mad * 3.5, p75 * 1.35);
    const minKeep = Math.min(rows.length, Math.max(5, Math.ceil(rows.length * 0.6)));
    const protectedRows = new Set(
      [...scored]
        .sort((left, right) => left.diff - right.diff)
        .slice(0, minKeep)
        .map((entry) => entry.observation),
    );

    for (const entry of scored) {
      if (entry.diff <= threshold || protectedRows.has(entry.observation)) {
        keptObservations.push(entry.observation);
      } else {
        removedCount += 1;
      }
    }
  }

  keptObservations.sort((left, right) => {
    if (left.time_to_expiry_years !== right.time_to_expiry_years) {
      return left.time_to_expiry_years - right.time_to_expiry_years;
    }
    return left.log_moneyness - right.log_moneyness;
  });

  return {
    observations: keptObservations,
    removedCount,
  };
}

function fitThetaForExpiry(
  initialTheta: number,
  parameters: { rho: number; eta: number; gamma: number },
  observations: SSVIObservation[],
): ExpiryFit {
  let bestTheta = Math.max(initialTheta, 1e-6);
  let bestLoss = evaluateExpiryLoss(bestTheta, parameters, observations);
  let step = Math.max(bestTheta * 0.28, 0.004);

  for (let iteration = 0; iteration < 7; iteration += 1) {
    let improved = false;
    const candidates = [
      bestTheta - step,
      bestTheta - step * 0.5,
      bestTheta,
      bestTheta + step * 0.5,
      bestTheta + step,
    ];

    for (const candidateTheta of candidates) {
      const theta = Math.max(candidateTheta, 1e-6);
      const loss = evaluateExpiryLoss(theta, parameters, observations);
      if (loss < bestLoss) {
        bestTheta = theta;
        bestLoss = loss;
        improved = true;
      }
    }

    if (!improved) {
      step *= 0.45;
    }
  }

  return {
    expiration: observations[0]?.expiration ?? "",
    theta: Number(bestTheta.toFixed(8)),
    loss: bestLoss,
  };
}

function refitThetaSlices(
  thetaSlices: ThetaSlice[],
  parameters: { rho: number; eta: number; gamma: number },
  observations: SSVIObservation[],
): ThetaSlice[] {
  const byExpiry = new Map<string, SSVIObservation[]>();
  for (const observation of observations) {
    const bucket = byExpiry.get(observation.expiration);
    if (bucket) {
      bucket.push(observation);
    } else {
      byExpiry.set(observation.expiration, [observation]);
    }
  }

  let runningTheta = 0;
  return thetaSlices.map((slice) => {
    const fitted = fitThetaForExpiry(
      slice.theta,
      parameters,
      byExpiry.get(slice.expiration) ?? [],
    );
    runningTheta = Math.max(runningTheta + 1e-8, fitted.theta);

    return {
      ...slice,
      theta: Number(runningTheta.toFixed(8)),
    };
  });
}

function calibrateSsviParameters(
  thetaSlices: ThetaSlice[],
  observations: SSVIObservation[],
): SSVIParameters {
  const rhoGrid = [-0.9, -0.75, -0.6, -0.45, -0.3, -0.15, 0, 0.15];
  const gammaGrid = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
  const etaFractions = [0.08, 0.16, 0.28, 0.4, 0.55, 0.7, 0.85, 0.94];

  let best: SSVIParameters | null = null;

  for (const rho of rhoGrid) {
    const etaMax = (2 - 1e-4) / (1 + Math.abs(rho));
    for (const gamma of gammaGrid) {
      for (const fraction of etaFractions) {
        const eta = etaMax * fraction;
        const candidate = evaluateLoss({ rho, eta, gamma }, thetaSlices, observations);
        if (!best || candidate.loss < best.loss) {
          best = candidate;
        }
      }
    }
  }

  if (!best) {
    throw new Error("Unable to initialize SSVI calibration.");
  }

  let stepRho = 0.08;
  let stepGamma = 0.08;
  let stepEta = Math.max(best.eta * 0.22, 0.08);

  for (let iteration = 0; iteration < 5; iteration += 1) {
    let improved = false;
    const rhoCandidates = [best.rho - stepRho, best.rho, best.rho + stepRho];
    const gammaCandidates = [best.gamma - stepGamma, best.gamma, best.gamma + stepGamma];
    const etaCandidates = [best.eta - stepEta, best.eta, best.eta + stepEta];

    for (const rhoCandidate of rhoCandidates) {
      const rho = clamp(rhoCandidate, -0.95, 0.95);
      const etaMax = (2 - 1e-4) / (1 + Math.abs(rho));
      for (const gammaCandidate of gammaCandidates) {
        const gamma = clamp(gammaCandidate, 0, 1);
        for (const etaCandidate of etaCandidates) {
          const eta = clamp(etaCandidate, 0.001, etaMax);
          const candidate = evaluateLoss({ rho, eta, gamma }, thetaSlices, observations);
          if (candidate.loss < best.loss) {
            best = candidate;
            improved = true;
          }
        }
      }
    }

    if (!improved) {
      stepRho *= 0.5;
      stepGamma *= 0.5;
      stepEta *= 0.5;
    }
  }

  return best;
}

function calibrateSsvi(
  initialThetaSlices: ThetaSlice[],
  observations: SSVIObservation[],
): {
  parameters: SSVIParameters;
  thetaSlices: ThetaSlice[];
} {
  let thetaSlices = initialThetaSlices;
  let parameters = calibrateSsviParameters(thetaSlices, observations);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const updatedThetaSlices = refitThetaSlices(thetaSlices, parameters, observations);
    const updatedParameters = calibrateSsviParameters(updatedThetaSlices, observations);

    const thetaDrift = updatedThetaSlices.reduce(
      (sum, slice, index) => sum + Math.abs(slice.theta - thetaSlices[index]!.theta),
      0,
    );
    const lossImprovement = parameters.loss - updatedParameters.loss;

    thetaSlices = updatedThetaSlices;
    parameters = updatedParameters;

    if (thetaDrift < 1e-4 && lossImprovement < 1e-6) {
      break;
    }
  }

  return { parameters, thetaSlices };
}

export function buildArbitrageFreeSurface(
  chain: QuantOptionChain,
  riskFreeRate: number,
): QuantSurfaceResult {
  const { observations, rawPointCount, warnings } = buildExpirationObservations(
    chain,
    riskFreeRate,
  );

  if (observations.length < 12) {
    return {
      symbol: chain.symbol,
      spot_price: chain.spot_price,
      x_axis: "moneyness",
      expirations: [],
      days_to_expiry_values: [],
      moneyness_values: [],
      z_values: [],
      points: [],
      model: "ssvi",
      raw_point_count: rawPointCount,
      filtered_point_count: observations.length,
      warnings: [
        ...warnings,
        `Not enough filtered options were available to calibrate an SSVI surface for ${chain.symbol}.`,
      ],
      data_status: "partial",
    };
  }

  const thetaSlices = estimateThetaSlices(observations);
  if (thetaSlices.length < 2) {
    return {
      symbol: chain.symbol,
      spot_price: chain.spot_price,
      x_axis: "moneyness",
      expirations: [],
      days_to_expiry_values: [],
      moneyness_values: [],
      z_values: [],
      points: [],
      model: "ssvi",
      raw_point_count: rawPointCount,
      filtered_point_count: observations.length,
      warnings: [
        ...warnings,
        `SSVI calibration needs at least two liquid expiries; only ${thetaSlices.length} remained for ${chain.symbol}.`,
      ],
      data_status: "partial",
    };
  }

  let calibration = calibrateSsvi(thetaSlices, observations);
  let finalObservations = observations;

  const pruned = pruneResidualOutliers(
    observations,
    calibration.thetaSlices,
    calibration.parameters,
  );
  if (pruned.removedCount > 0 && pruned.observations.length >= 12) {
    const prunedThetaSlices = estimateThetaSlices(pruned.observations);
    if (prunedThetaSlices.length >= 2) {
      finalObservations = pruned.observations;
      calibration = calibrateSsvi(prunedThetaSlices, pruned.observations);
    }
  }

  const bestParameters = calibration.parameters;
  const calibratedThetaSlices = calibration.thetaSlices;
  const minMoneyness = clamp(
    Math.min(...finalObservations.map((observation) => observation.moneyness)) * 0.985,
    0.65,
    0.97,
  );
  const maxMoneyness = clamp(
    Math.max(...finalObservations.map((observation) => observation.moneyness)) * 1.015,
    1.03,
    1.58,
  );
  const gridSize = 27;
  const step = (maxMoneyness - minMoneyness) / Math.max(gridSize - 1, 1);
  const moneynessValues = Array.from({ length: gridSize }, (_, index) =>
    Number((minMoneyness + step * index).toFixed(4)),
  );

  const expirations = calibratedThetaSlices.map((slice) => slice.expiration);
  const daysToExpiryValues = calibratedThetaSlices.map((slice) => slice.days_to_expiry);
  const zValues = calibratedThetaSlices.map((slice) =>
    moneynessValues.map((moneyness) => {
      const totalVariance = ssviVariance(
        Math.log(moneyness),
        slice.theta,
        bestParameters.rho,
        bestParameters.eta,
        bestParameters.gamma,
      );
      return Number(
        Math.sqrt(Math.max(totalVariance / slice.time_to_expiry_years, 1e-10)).toFixed(6),
      );
    }),
  );

  const calibrationWarnings = [...warnings];
  if (rawPointCount > observations.length) {
    calibrationWarnings.unshift(
      `Filtered ${rawPointCount - observations.length} noisy contracts before SSVI calibration.`,
    );
  }
  if (pruned.removedCount > 0 && finalObservations.length < observations.length) {
    calibrationWarnings.unshift(
      `Removed ${pruned.removedCount} residual outliers after the initial SSVI fit.`,
    );
  }

  return {
    symbol: chain.symbol,
    spot_price: chain.spot_price,
    x_axis: "moneyness",
    expirations,
    days_to_expiry_values: daysToExpiryValues,
    moneyness_values: moneynessValues,
    z_values: zValues,
    points: finalObservations.map((observation) => ({
      expiration: observation.expiration,
      days_to_expiry: observation.days_to_expiry,
      time_to_expiry_years: observation.time_to_expiry_years,
      strike: observation.strike,
      moneyness: observation.moneyness,
      implied_volatility: observation.implied_volatility,
    })),
    model: "ssvi",
    raw_point_count: rawPointCount,
    filtered_point_count: finalObservations.length,
    calibration: {
      rho: Number(bestParameters.rho.toFixed(6)),
      eta: Number(bestParameters.eta.toFixed(6)),
      gamma: Number(bestParameters.gamma.toFixed(6)),
      butterfly_margin: Number(bestParameters.butterfly_margin.toFixed(6)),
      calendar_valid: true,
      loss: Number(bestParameters.loss.toExponential(6)),
    },
    warnings: calibrationWarnings.length > 0 ? calibrationWarnings : chain.warnings,
    data_status: "complete",
  };
}
