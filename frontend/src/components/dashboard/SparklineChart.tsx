import ReactECharts from "echarts-for-react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  smooth?: boolean;
  filled?: boolean;
  yMax?: number;
}

export function SparklineChart({
  data,
  color = "#06b6d4",
  height = 48,
  smooth = true,
  filled = true,
  yMax = 100,
}: SparklineProps) {
  const option = {
    animation: false,
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: {
      type: "category",
      show: false,
      data: data.map((_, i) => i),
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      show: false,
      min: 0,
      max: yMax,
    },
    series: [
      {
        type: "line",
        data,
        smooth,
        symbol: "none",
        lineStyle: { color, width: 1.5 },
        areaStyle: filled
          ? {
              color: {
                type: "linear",
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}40` },
                  { offset: 1, color: `${color}05` },
                ],
              },
            }
          : undefined,
      },
    ],
    backgroundColor: "transparent",
  };

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}
