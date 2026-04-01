"use client";

import dynamic from "next/dynamic";
import type { QuantSurfaceResult } from "@/types/api";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-[14px] border border-[#E8701A]/12 bg-[#fff8f2] text-sm text-black/58">
      Loading surface plot...
    </div>
  ),
});

export default function QuantSurfacePlot({
  surface,
}: {
  surface: QuantSurfaceResult;
}) {
  const displayPoints =
    surface.points.length > 750
      ? surface.points.filter((_, index) => index % Math.ceil(surface.points.length / 750) === 0)
      : surface.points;

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-[14px] border border-[#E8701A]/12 bg-[#fff8f2]">
      <Plot
        data={[
          {
            type: "surface",
            x: surface.moneyness_values,
            y: surface.days_to_expiry_values,
            z: surface.z_values,
            colorscale: [
              [0, "#fff4ec"],
              [0.55, "#f4a261"],
              [1, "#E8701A"],
            ],
            hovertemplate:
              "Moneyness %{x}<br>DTE %{y}<br>IV %{z:.2%}<extra></extra>",
            showscale: true,
            opacity: 0.97,
            contours: {
              z: {
                show: true,
                usecolormap: false,
                color: "rgba(109,44,0,0.14)",
                width: 1,
              },
            },
            lighting: {
              ambient: 0.8,
              diffuse: 0.88,
              roughness: 0.42,
              specular: 0.24,
              fresnel: 0.12,
            },
          },
          {
            type: "scatter3d",
            mode: "markers",
            x: displayPoints.map((point) => point.moneyness),
            y: displayPoints.map((point) => point.days_to_expiry),
            z: displayPoints.map((point) => point.implied_volatility),
            marker: {
              color: "#7b3a10",
              size: 3.2,
              opacity: 0.56,
              line: {
                color: "rgba(255,246,238,0.52)",
                width: 0.35,
              },
            },
            hovertemplate:
              "Filtered point<br>Moneyness %{x:.3f}<br>DTE %{y}<br>IV %{z:.2%}<extra></extra>",
            name: "Filtered market points",
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 0, r: 0, t: 10, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          scene: {
            bgcolor: "rgba(0,0,0,0)",
            xaxis: {
              title: { text: "Moneyness" },
              gridcolor: "rgba(232,112,26,0.12)",
              zerolinecolor: "rgba(232,112,26,0.12)",
            },
            yaxis: {
              title: { text: "Days to expiry" },
              gridcolor: "rgba(232,112,26,0.12)",
              zerolinecolor: "rgba(232,112,26,0.12)",
            },
            zaxis: {
              title: { text: "Implied vol" },
              tickformat: ".0%",
              gridcolor: "rgba(232,112,26,0.12)",
              zerolinecolor: "rgba(232,112,26,0.12)",
            },
            camera: {
              eye: { x: 1.45, y: 1.25, z: 1.08 },
            },
          },
        }}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: [
            "lasso2d",
            "select2d",
            "toImage",
            "hoverCompareCartesian",
          ],
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
