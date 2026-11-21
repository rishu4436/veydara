"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle, Zone } from "@veydara/quant";

export function PriceChart({ candles, ema20 = [], ema50, zones, showZones }: { candles: Candle[]; ema20?: (number | null)[]; ema50: (number | null)[]; zones: Zone[]; showZones: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const c = (v: string) => css.getPropertyValue(v).trim() || "#888";
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c("--color-muted"), fontFamily: "var(--font-inter)" },
      grid: { vertLines: { color: c("--color-line-soft") }, horzLines: { color: c("--color-line-soft") } },
      rightPriceScale: { borderColor: c("--color-line") },
      timeScale: { borderColor: c("--color-line"), timeVisible: true },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, { upColor: c("--color-mint"), downColor: c("--color-danger"), wickUpColor: c("--color-mint"), wickDownColor: c("--color-danger"), borderVisible: false });
    series.setData(candles.map((k) => ({ time: Math.floor(k.openTime / 1000) as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    const addLine = (vals: (number | null)[], color: string) => {
      if (!vals.length) return;
      const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      line.setData(candles.flatMap((k, i) => (vals[i] != null ? [{ time: Math.floor(k.openTime / 1000) as UTCTimestamp, value: vals[i]! }] : [])));
    };
    addLine(ema20, c("--color-violet"));
    addLine(ema50, c("--color-ice"));
    if (showZones) {
      for (const z of zones) {
        const color = z.kind === "support" ? c("--color-mint") : c("--color-amber");
        series.createPriceLine({ price: z.high, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `${z.kind} ${z.quality}` });
        series.createPriceLine({ price: z.low, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      }
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, ema20, ema50, zones, showZones]);

  return <div ref={ref} className="h-[360px] w-full" role="img" aria-label="Candlestick chart; see data table below for values" />;
}
