import type {
  QuantGreeksMetric,
  QuantGreeksResult,
  QuantOptionChain,
  QuantOptionContract,
  QuantPayoffLeg,
  QuantPayoffResult,
  QuantSurfaceResult,
  QuantYieldCurveResult,
} from "@/types/api";
import {
  buildPayoffDiagram,
  buildVolSurface,
  computeGreeks,
  fetchOptionChain,
  getRiskFreeYieldCurve,
  type QuantGreeksInput,
} from "@/server/quant/service";

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type QuantDisplayEvent =
  | {
      type: "display_quant_chain";
      data: { chain: QuantOptionChain };
    }
  | {
      type: "display_quant_greeks";
      data: { result: QuantGreeksResult; preferred_metric?: QuantGreeksMetric };
    }
  | {
      type: "display_quant_yield_curve";
      data: { curve: QuantYieldCurveResult };
    }
  | {
      type: "display_quant_surface";
      data: { surface: QuantSurfaceResult };
    }
  | {
      type: "display_quant_payoff";
      data: { payoff: QuantPayoffResult };
    };

function normalizeSymbol(value: unknown): string {
  const symbol = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!symbol) {
    throw new Error("A valid U.S. equity ticker is required.");
  }

  return symbol;
}

function normalizeExpiration(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return value.trim();
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionType(value: unknown): "call" | "put" | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "call" || value === "put") {
    return value;
  }

  throw new Error("Option type must be 'call' or 'put'.");
}

function normalizeGreeksMetric(value: unknown): QuantGreeksMetric | undefined {
  const metrics: QuantGreeksMetric[] = [
    "price",
    "payoff",
    "delta",
    "gamma",
    "vega",
    "theta",
    "rho",
    "volga",
    "vanna",
    "speed",
  ];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as QuantGreeksMetric;
  return metrics.includes(normalized) ? normalized : undefined;
}

function summarizeContract(contract: QuantOptionContract) {
  return {
    contract_symbol: contract.contract_symbol,
    strike: contract.strike,
    expiration: contract.expiration,
    bid: contract.bid,
    ask: contract.ask,
    midpoint: contract.midpoint,
    implied_volatility: contract.implied_volatility,
    volume: contract.volume,
    open_interest: contract.open_interest,
  };
}

function findAtmContract(chain: QuantOptionChain): QuantOptionContract | null {
  const contracts = chain.expirations.flatMap((expiration) => [
    ...expiration.calls,
    ...expiration.puts,
  ]);

  if (contracts.length === 0) {
    return null;
  }

  return contracts.reduce((best, contract) => {
    if (!best) {
      return contract;
    }

    return Math.abs(contract.strike - chain.spot_price) <
      Math.abs(best.strike - chain.spot_price)
      ? contract
      : best;
  }, contracts[0]);
}

function shapeChainForAgent(chain: QuantOptionChain) {
  const nearestExpiration = chain.expirations[0] ?? null;
  const atmContract = findAtmContract(chain);

  return {
    symbol: chain.symbol,
    name: chain.name,
    currency: chain.currency,
    exchange: chain.exchange,
    spot_price: chain.spot_price,
    available_expirations: chain.available_expirations,
    selected_expiration: chain.selected_expiration ?? nearestExpiration?.expiration ?? null,
    expiration_count: chain.expiration_count,
    atm_strike: chain.atm_strike,
    warnings: chain.warnings,
    data_status: chain.data_status,
    nearest_expiration_summary: nearestExpiration
      ? {
          expiration: nearestExpiration.expiration,
          days_to_expiry: nearestExpiration.days_to_expiry,
          time_to_expiry_years: nearestExpiration.time_to_expiry_years,
          call_count: nearestExpiration.calls.length,
          put_count: nearestExpiration.puts.length,
          atm_call: nearestExpiration.calls.length > 0
            ? summarizeContract(
                nearestExpiration.calls.reduce((best, contract) =>
                  Math.abs(contract.strike - chain.spot_price) <
                  Math.abs(best.strike - chain.spot_price)
                    ? contract
                    : best,
                nearestExpiration.calls[0]),
              )
            : null,
          atm_put: nearestExpiration.puts.length > 0
            ? summarizeContract(
                nearestExpiration.puts.reduce((best, contract) =>
                  Math.abs(contract.strike - chain.spot_price) <
                  Math.abs(best.strike - chain.spot_price)
                    ? contract
                    : best,
                nearestExpiration.puts[0]),
              )
            : null,
        }
      : null,
    atm_contract: atmContract ? summarizeContract(atmContract) : null,
  };
}

function shapeSurfaceForAgent(surface: QuantSurfaceResult) {
  return {
    symbol: surface.symbol,
    spot_price: surface.spot_price,
    x_axis: surface.x_axis,
    model: surface.model,
    expirations: surface.expirations,
    days_to_expiry_values: surface.days_to_expiry_values,
    moneyness_values: surface.moneyness_values,
    point_count: surface.points.length,
    raw_point_count: surface.raw_point_count,
    filtered_point_count: surface.filtered_point_count,
    calibration: surface.calibration,
    warnings: surface.warnings,
    data_status: surface.data_status,
  };
}

function shapeYieldCurveForAgent(curve: QuantYieldCurveResult) {
  const nodeMap = new Map(curve.nodes.map((node) => [node.label, node]));
  const twoYear = nodeMap.get("2Y");
  const tenYear = nodeMap.get("10Y");
  const thirtyYear = nodeMap.get("30Y");
  const twoTenSlope =
    twoYear && tenYear
      ? Number((tenYear.rate_percent - twoYear.rate_percent).toFixed(4))
      : null;

  return {
    as_of: curve.as_of,
    source: curve.source,
    curve_method: curve.curve_method,
    interpolation_method: curve.interpolation_method,
    node_count: curve.nodes.length,
    nodes: curve.nodes.map((node) => ({
      label: node.label,
      tenor_days: node.tenor_days,
      rate_percent: node.rate_percent,
    })),
    key_levels: {
      "1M": nodeMap.get("1M")?.rate_percent ?? null,
      "3M": nodeMap.get("3M")?.rate_percent ?? null,
      "6M": nodeMap.get("6M")?.rate_percent ?? null,
      "2Y": twoYear?.rate_percent ?? null,
      "10Y": tenYear?.rate_percent ?? null,
      "30Y": thirtyYear?.rate_percent ?? null,
    },
    slope_2s10s_percent_points: twoTenSlope,
    warnings: curve.warnings,
  };
}

function shapePayoffForAgent(payoff: QuantPayoffResult) {
  return {
    symbol: payoff.symbol,
    spot_reference: payoff.spot_reference,
    leg_count: payoff.legs.length,
    legs: payoff.legs,
    breakeven_points: payoff.breakeven_points,
    max_profit: payoff.max_profit,
    max_loss: payoff.max_loss,
    payoff_preview: [
      payoff.points[0],
      payoff.points[Math.floor(payoff.points.length / 2)],
      payoff.points[payoff.points.length - 1],
    ].filter(Boolean),
  };
}

function normalizePayoffLegs(value: unknown): QuantPayoffLeg[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("build_payoff_diagram requires at least one option leg.");
  }

  return value.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Each payoff leg must be an object.");
    }

    const optionType = Reflect.get(raw, "option_type");
    const direction = Reflect.get(raw, "direction");
    const strike = Reflect.get(raw, "strike");
    const premium = Reflect.get(raw, "premium");
    const quantity = Reflect.get(raw, "quantity");

    if (optionType !== "call" && optionType !== "put") {
      throw new Error("Each leg must specify option_type as 'call' or 'put'.");
    }

    if (direction !== "long" && direction !== "short") {
      throw new Error("Each leg must specify direction as 'long' or 'short'.");
    }

    if (
      typeof strike !== "number" ||
      !Number.isFinite(strike) ||
      typeof premium !== "number" ||
      !Number.isFinite(premium) ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity)
    ) {
      throw new Error("Each leg must include numeric strike, premium, and quantity.");
    }

    return {
      option_type: optionType,
      direction,
      strike,
      premium,
      quantity,
    };
  });
}

export const QUANT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "fetch_option_chain",
      description:
        "Fetch a normalized U.S. equity options chain from Yahoo Finance, with available expiries, calls, puts, implied volatility, volume, and open interest.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "U.S. equity ticker symbol such as AAPL, NVDA, SPY, or TSLA.",
          },
          expiration: {
            type: "string",
            description: "Optional expiry in yyyy-mm-dd format.",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compute_greeks",
      description:
        "Compute a Black-Scholes-Merton option price and Greeks, and drive the chain-linked Greeks profile chart. Use this for requests to plot or visualize delta, gamma, vega, theta, rho, volga, vanna, or speed. If a symbol is supplied, the tool can infer missing strike, option type, spot, expiry, dividend yield, and the tenor-matched Treasury risk-free rate from the live chain. Off-grid tenors are interpolated between real listed expiries.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional ticker symbol to infer missing inputs from the live option chain.",
          },
          option_type: {
            type: "string",
            enum: ["call", "put"],
            description: "Optional option type. Defaults to call when omitted.",
          },
          strike: {
            type: "number",
            description: "Optional strike price. If omitted with a symbol, the tool uses the live ATM strike.",
          },
          expiration: {
            type: "string",
            description: "Optional expiry in yyyy-mm-dd format.",
          },
          spot_price: {
            type: "number",
            description: "Optional current underlying spot price.",
          },
          volatility: {
            type: "number",
            description: "Optional volatility as a decimal, e.g. 0.25 for 25%. When supplied, it overrides the live implied-volatility term structure.",
          },
          risk_free_rate: {
            type: "number",
            description: "Optional risk-free rate as a decimal, e.g. 0.04 for 4%. When supplied, it overrides the tenor-matched Treasury curve.",
          },
          time_to_expiry_years: {
            type: "number",
            description: "Optional time to expiry in years.",
          },
          days_to_expiry: {
            type: "number",
            description: "Optional time to expiry in calendar days.",
          },
          focus_metric: {
            type: "string",
            enum: [
              "price",
              "payoff",
              "delta",
              "gamma",
              "vega",
              "theta",
              "rho",
              "volga",
              "vanna",
              "speed",
            ],
            description: "Optional preferred metric to open in the Greeks visualization.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_yield_curve",
      description:
        "Fetch the current U.S. Treasury constant-maturity par curve (CMT nodes) used by Quant Alpha to derive tenor-matched risk-free rates for options pricing. This is not a bootstrapped zero-coupon curve.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_vol_surface",
      description:
        "Build an arbitrage-constrained SSVI implied-volatility surface for a U.S. equity ticker across moneyness and expiry.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "U.S. equity ticker symbol.",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_payoff_diagram",
      description:
        "Build the expiry payoff diagram for a multi-leg options strategy. Translate natural-language spreads into structured legs before calling.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional ticker symbol for spot reference.",
          },
          spot_price: {
            type: "number",
            description: "Optional spot reference when symbol is not provided.",
          },
          legs: {
            type: "array",
            description: "Option strategy legs.",
            items: {
              type: "object",
              properties: {
                option_type: {
                  type: "string",
                  enum: ["call", "put"],
                },
                direction: {
                  type: "string",
                  enum: ["long", "short"],
                },
                strike: { type: "number" },
                premium: { type: "number" },
                quantity: { type: "number" },
              },
              required: ["option_type", "direction", "strike", "premium", "quantity"],
            },
          },
        },
        required: ["legs"],
      },
    },
  },
];

export async function dispatchQuantToolWithDisplay(
  name: string,
  argumentsObject: Record<string, unknown>,
): Promise<[string, QuantDisplayEvent[]]> {
  if (name === "fetch_option_chain") {
    const symbol = normalizeSymbol(argumentsObject.symbol);
    const expiration = normalizeExpiration(argumentsObject.expiration);
    const chain = await fetchOptionChain(symbol, expiration);

    return [
      JSON.stringify(shapeChainForAgent(chain)),
      [{ type: "display_quant_chain", data: { chain } }],
    ];
  }

  if (name === "compute_greeks") {
    const preferredMetric = normalizeGreeksMetric(
      argumentsObject.focus_metric ?? argumentsObject.metric ?? argumentsObject.greek,
    );
    const result = await computeGreeks({
      symbol:
        typeof argumentsObject.symbol === "string" && argumentsObject.symbol.trim()
          ? argumentsObject.symbol
          : undefined,
      option_type: normalizeOptionType(argumentsObject.option_type),
      strike:
        typeof argumentsObject.strike === "number" && Number.isFinite(argumentsObject.strike)
          ? argumentsObject.strike
          : undefined,
      expiration: normalizeExpiration(argumentsObject.expiration),
      spot_price: normalizeNumber(argumentsObject.spot_price),
      volatility: normalizeNumber(argumentsObject.volatility),
      risk_free_rate: normalizeNumber(argumentsObject.risk_free_rate),
      days_to_expiry: normalizeNumber(argumentsObject.days_to_expiry),
      time_to_expiry_years: normalizeNumber(argumentsObject.time_to_expiry_years),
    } satisfies QuantGreeksInput);

    return [
      JSON.stringify(result),
      [{ type: "display_quant_greeks", data: { result, preferred_metric: preferredMetric } }],
    ];
  }

  if (name === "build_vol_surface") {
    const symbol = normalizeSymbol(argumentsObject.symbol);
    const surface = await buildVolSurface(symbol);

    return [
      JSON.stringify(shapeSurfaceForAgent(surface)),
      [{ type: "display_quant_surface", data: { surface } }],
    ];
  }

  if (name === "fetch_yield_curve") {
    const curve = await getRiskFreeYieldCurve();

    return [
      JSON.stringify(shapeYieldCurveForAgent(curve)),
      [{ type: "display_quant_yield_curve", data: { curve } }],
    ];
  }

  if (name === "build_payoff_diagram") {
    const payoff = await buildPayoffDiagram({
      symbol:
        typeof argumentsObject.symbol === "string" && argumentsObject.symbol.trim()
          ? argumentsObject.symbol
          : undefined,
      spot_price: normalizeNumber(argumentsObject.spot_price),
      legs: normalizePayoffLegs(argumentsObject.legs),
    });

    return [
      JSON.stringify(shapePayoffForAgent(payoff)),
      [{ type: "display_quant_payoff", data: { payoff } }],
    ];
  }

  throw new Error(`Unsupported quant tool: ${name}`);
}
