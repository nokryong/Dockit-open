import { t as uiText, useI18n } from "../../../i18n";
/**
 * Chart.js - Recharts 기반 차트 컴포넌트
 *
 * 이 컴포넌트는 테이블 데이터를 받아서 다양한 형태의 차트로 시각화합니다.
 *
 * @component
 * @param {Array<Array<string>>} tableData - 테이블 데이터 (2차원 배열)
 *   - 첫 번째 행: 헤더 (데이터셋 이름)
 *   - 나머지 행: 데이터 (첫 번째 열은 라벨, 나머지는 값)
 * @param {string} chartType - 차트 타입 ("bar" | "line" | "area" | "pie" | "radar")
 * @param {boolean} isAxesSwapped - 축 전환 여부 (true: 행/열 교체)
 * @param {React.Ref} ref - 차트 컨테이너 DOM 참조
 *
 * 지원하는 차트 타입:
 * - bar: 막대 그래프
 * - line: 선 그래프
 * - area: 영역 그래프
 * - pie: 원형 차트
 * - radar: 레이더 차트
 */

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  LabelList
} from "recharts";
import { Typography } from "sud-ui";
import { useDarkMode } from "../../../context/DarkModeContext";

const Chart = React.forwardRef(
  (
    {
      tableData,
      chartType,
      isAxesSwapped = false,
      viewDataValue = false,
      viewLegend = false,
      chartColors = [],
      viewYLabel = true,
      ratio = "3/2",
      containerHeight = null,
      legendPosition = "bottom",
      dataLabelPos = "top",
      showGrid = false,
      lineType = "monotone",
      barRadius = true,
      pieDonut = false
    },
    ref
  ) => {
  useI18n();
    const { currentColors } = useDarkMode();
    const neutralStroke = currentColors.white[4];
    const fallbackSeriesColor = currentColors.white[6];
    const surfaceColor = currentColors.white[10];

    /**
     * 테이블 데이터를 Recharts 형식으로 변환하는 함수
     *
     * 입력 형식 (테이블):
     *   [헤더행: ["라벨", "데이터셋1", "데이터셋2", ...],
     *    데이터행1: ["라벨1", "10", "20", ...],
     *    데이터행2: ["라벨2", "30", "40", ...]]
     *
     * 출력 형식 (Recharts):
     *   {
     *     data: [
     *       {name: "라벨1", 데이터셋1: 10, 데이터셋2: 20},
     *       {name: "라벨2", 데이터셋1: 30, 데이터셋2: 40}
     *     ],
     *     keys: ["데이터셋1", "데이터셋2", ...]
     *   }
     *
     * @returns {Object|null} 변환된 차트 데이터 또는 null (데이터 없음)
     */
    // "1,000명" → { value: 1000, unit: "명" } / "50%" → { value: 50, unit: "%" }
    const parseSmartNumber = (str) => {
      if (!str) return { value: 0, unit: "" };
      const cleaned = str.replace(/,/g, "");
      const match = cleaned.match(/^([\d.]+)(.*)$/);
      if (!match) return { value: NaN, unit: str };
      return { value: parseFloat(match[1]), unit: match[2].trim() };
    };

    const getChartData = () => {
      // 유효성 검사: 최소 2행 필요 (헤더 + 데이터)
      if (!tableData || tableData.length < 2) return null;

      let processedData = tableData;

      /**
       * 축 전환 처리
       * isAxesSwapped가 true인 경우 행과 열을 교체 (transpose)
       * 예:
       *   원본: [[A,B], [1,2], [3,4]]
       *   전환: [[A,1,3], [B,2,4]]
       */
      if (isAxesSwapped) {
        const maxCols = Math.max(...tableData.map((row) => row.length));
        processedData = [];
        // 각 컬럼을 행으로 변환
        for (let colIndex = 0; colIndex < maxCols; colIndex++) {
          const newRow = [];
          for (let rowIndex = 0; rowIndex < tableData.length; rowIndex++) {
            // 빈 셀은 빈 문자열로 처리
            newRow.push(tableData[rowIndex][colIndex] || "");
          }
          processedData.push(newRow);
        }
      }

      const headers = processedData[0]; // 첫 번째 행은 헤더 (데이터셋 이름들)
      const dataRows = processedData.slice(1); // 나머지는 실제 데이터 행들
      const labelCounts = new Map();
      const series = headers.slice(1).map((header, index) => {
        const trimmedHeader = String(header ?? "").trim();
        const baseLabel = trimmedHeader || uiText("데이터 {0}", index + 1);
        const nextCount = (labelCounts.get(baseLabel) || 0) + 1;
        labelCounts.set(baseLabel, nextCount);

        return {
          dataKey: `series_${index + 1}`,
          label: nextCount === 1 ? baseLabel : `${baseLabel} (${nextCount})`,
          columnIndex: index + 1
        };
      });

      if (series.length === 0) return null;

      /**
       * Recharts 형식으로 데이터 변환
       * 각 데이터 행을 객체로 변환:
       *   - name: 첫 번째 컬럼 (X축 라벨)
       *   - 나머지 컬럼: 헤더 이름을 키로 하는 값들
       */
      const units = {}; // { 헤더명: "명" } 형태로 단위 수집
      const rechartsData = dataRows.map((row) => {
        const dataPoint = {
          name: row[0] || "" // 첫 번째 컬럼은 name (X축 라벨로 사용됨)
        };
        // 나머지 컬럼들을 데이터셋으로 변환
        // headers.slice(1)은 첫 번째 헤더(라벨)를 제외한 데이터셋 이름들
        series.forEach(({ dataKey, columnIndex }) => {
          const { value, unit } = parseSmartNumber(row[columnIndex]);
          dataPoint[dataKey] = isNaN(value) ? 0 : value;
          // 단위 수집 (처음 발견된 단위 사용)
          if (unit && !units[dataKey]) units[dataKey] = unit;
        });
        return dataPoint;
      });

      return {
        data: rechartsData, // Recharts가 사용할 데이터 배열
        keys: series.map(({ dataKey }) => dataKey), // 데이터셋 키들 (각 차트 시리즈의 이름)
        series,
        units // 키별 단위 (예: { 매출: "원", 인원: "명" })
      };
    };

    const chartDataInfo = getChartData();

    /**
     * 차트 타입에 따라 적절한 Recharts 컴포넌트를 렌더링하는 함수
     *
     * 각 차트 타입별 커스터마이징 옵션:
     * - 모든 차트: ResponsiveContainer로 반응형 처리
     * - 공통 요소: XAxis, YAxis, Tooltip, Legend 등
     */
    const renderChart = () => {
      // 데이터 유효성 검사
      if (
        !chartDataInfo ||
        !chartDataInfo.data ||
        chartDataInfo.data.length === 0
      ) {
        return (
          <Typography color="cool-gray-7">{uiText("차트 데이터가 없습니다")}</Typography>
        );
      }

      const { data, keys, series, units } = chartDataInfo;
      // Y축: 모든 키의 단위가 같으면 공통 단위 사용, 다르면 첫 번째 키 단위
      const yAxisUnit = keys.every((k) => units[k] === units[keys[0]])
        ? units[keys[0]] || ""
        : units[keys[0]] || "";
      // 전체 키에서 유니크 단위 추출 → 2종류 이상이면 dual axis
      const uniqueUnits = [...new Set(keys.map((k) => units[k]).filter(Boolean))];
      const dualAxis = viewYLabel && uniqueUnits.length >= 2;
      const leftUnit = dualAxis ? uniqueUnits[0] : yAxisUnit;
      const rightUnit = dualAxis ? uniqueUnits[1] : null;
      const yTickFormatter = leftUnit ? (v) => `${v}${leftUnit}` : undefined;
      const yRightTickFormatter = rightUnit ? (v) => `${v}${rightUnit}` : undefined;
      // 각 키의 단위가 rightUnit이면 오른쪽 축, 아니면 왼쪽 축
      const yAxisIdOf = (index) => (dualAxis && units[keys[index]] === rightUnit) ? "right" : "left";

      const isLegendVertical = legendPosition === "left" || legendPosition === "right";
      const legendProps = {
        layout: isLegendVertical ? "vertical" : "horizontal",
        verticalAlign: isLegendVertical ? "middle" : legendPosition,
        align: isLegendVertical ? legendPosition : "center",
        content: ({ payload }) => (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            flexDirection: isLegendVertical ? "column" : "row",
            justifyContent: isLegendVertical ? "flex-start" : "center",
            gap: "6px 12px",
            fontSize: 12,
            paddingTop: legendPosition === "bottom" ? "12px" : "0",
            paddingBottom: legendPosition === "top" ? "6px" : "0",
          }}>
            {payload?.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                <span style={{ color: "#555" }}>{entry.value}</span>
              </div>
            ))}
          </div>
        )
      };

      switch (chartType) {
        /**
         * 막대 그래프 (Bar Chart)
         *
         * Bar 컴포넌트 커스터마이징 옵션:
         * - fill: 막대 색상 (현재: getColorForKey로 동적 생성)
         * - stroke: 막대 테두리 색상
         * - strokeWidth: 테두리 두께
         * - radius: [topLeft, topRight, bottomRight, bottomLeft] - 모서리 둥글기
         * - maxBarSize: 최대 막대 너비 (숫자)
         * - stackId: 같은 stackId를 가진 Bar는 쌓임
         *
         * BarChart 커스터마이징 옵션:
         * - layout: "horizontal" | "vertical" - 막대 방향
         * - barCategoryGap: 카테고리 간격 (퍼센트 또는 숫자)
         * - barGap: 데이터셋 간격 (퍼센트)
         * - margin: {top, right, bottom, left} - 여백
         */

        case "bar":
          return (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: viewDataValue ? 28 : 8, right: dualAxis ? 0 : (viewDataValue ? 40 : 8), bottom: 5, left: 0 }}
              >
                {showGrid && (
                  <CartesianGrid strokeDasharray="3 3" stroke={neutralStroke} />
                )}
                <XAxis dataKey="name" fontSize={12} tickLine={false} />
                {viewYLabel && (
                  <YAxis yAxisId="left" fontSize={12} tickLine={false} tickFormatter={yTickFormatter} width={80} />
                )}
                {dualAxis && (
                  <YAxis yAxisId="right" orientation="right" fontSize={12} tickLine={false} tickFormatter={yRightTickFormatter} width={80} />
                )}
                {viewLegend && <Legend {...legendProps} />}
                {series.map(({ dataKey, label }, index) => (
                  <Bar
                    key={index}
                    yAxisId={viewYLabel ? yAxisIdOf(index) : undefined}
                    dataKey={dataKey}
                    name={label}
                    fill={chartColors[index] || fallbackSeriesColor}
                    radius={barRadius ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  >
                    {viewDataValue && (
                      <LabelList
                        dataKey={dataKey}
                        position={dataLabelPos}
                        fontSize={12}
                        offset={5}
                        formatter={(v) => `${v}${units[dataKey] || ""}`}
                      />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        /**
         * 선 그래프 (Line Chart)
         *
         * Line 컴포넌트 커스터마이징 옵션:
         * - type: "basis" | "basisClosed" | "basisOpen" | "linear" | "linearClosed" | "natural" | "monotone" | "monotoneX" | "monotoneY" | "step" | "stepBefore" | "stepAfter"
         *   현재: "monotone" (부드러운 곡선)
         * - stroke: 선 색상
         * - strokeWidth: 선 두께 (현재: 2)
         * - strokeDasharray: 점선 패턴 (예: "5 5")
         * - dot: true | false | <Dot /> - 데이터 포인트 표시
         * - dotRadius: 포인트 반지름
         * - activeDot: 활성 포인트 커스터마이징
         * - connectNulls: null 값 연결 여부
         *
         * LineChart 커스터마이징 옵션:
         * - margin: {top, right, bottom, left}
         */
        case "line":
          return (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{
                  top: viewDataValue ? 28 : 8,
                  right: dualAxis ? 0 : (viewDataValue ? 50 : 20),
                  bottom: 0,
                  left: viewYLabel ? 0 : 20
                }}
              >
                {showGrid && (
                  <CartesianGrid strokeDasharray="3 3" stroke={neutralStroke} />
                )}
                <XAxis dataKey="name" fontSize={12} tickLine={false} />
                {viewYLabel && (
                  <YAxis yAxisId="left" fontSize={12} tickLine={false} tickFormatter={yTickFormatter} width={80} />
                )}
                {dualAxis && (
                  <YAxis yAxisId="right" orientation="right" fontSize={12} tickLine={false} tickFormatter={yRightTickFormatter} width={80} />
                )}
                {viewLegend && <Legend {...legendProps} />}
                {series.map(({ dataKey, label }, index) => (
                  <Line
                    key={index}
                    yAxisId={viewYLabel ? yAxisIdOf(index) : undefined}
                    type={lineType}
                    dataKey={dataKey}
                    name={label}
                    stroke={chartColors[index] || fallbackSeriesColor}
                    strokeWidth={1}
                    dot={{ r: 2 }}
                    connectNulls={true}
                  >
                    {viewDataValue && (
                      <LabelList
                        dataKey={dataKey}
                        position={dataLabelPos}
                        fontSize={12}
                        offset={5}
                        formatter={(v) => `${v}${units[dataKey] || ""}`}
                      />
                    )}
                  </Line>
                ))}
              </LineChart>
            </ResponsiveContainer>
          );
        /**
         * 영역 그래프 (Area Chart)
         *
         * Area 컴포넌트 커스터마이징 옵션:
         * - type: Line과 동일 (현재: "monotone")
         * - fill: 채우기 색상
         * - fillOpacity: 채우기 투명도 (0-1)
         * - stroke: 테두리 색상
         * - strokeWidth: 테두리 두께
         * - stackId: 같은 stackId를 가진 Area는 쌓임 (현재: 모두 "1"로 쌓임)
         *   stackId를 다르게 하면 겹쳐서 표시
         * - dot: 포인트 표시 여부
         * - activeDot: 활성 포인트 커스터마이징
         */
        case "area":
          return (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{
                  top: viewDataValue ? 28 : 8,
                  right: dualAxis ? 0 : (viewDataValue ? 50 : 20),
                  bottom: 0,
                  left: viewYLabel ? 0 : 20
                }}
              >
                {showGrid && (
                  <CartesianGrid strokeDasharray="3 3" stroke={neutralStroke} />
                )}
                <XAxis dataKey="name" fontSize={12} tickLine={false} />
                {viewYLabel && (
                  <YAxis yAxisId="left" fontSize={12} tickLine={false} tickFormatter={yTickFormatter} width={80} />
                )}
                {dualAxis && (
                  <YAxis yAxisId="right" orientation="right" fontSize={12} tickLine={false} tickFormatter={yRightTickFormatter} width={80} />
                )}
                {viewLegend && <Legend {...legendProps} />}
                {series.map(({ dataKey, label }, index) => (
                  <Area
                    key={index}
                    yAxisId={viewYLabel ? yAxisIdOf(index) : undefined}
                    type={lineType}
                    dataKey={dataKey}
                    name={label}
                    stackId={dataKey}
                    stroke={chartColors[index] || fallbackSeriesColor}
                    fill={chartColors[index] || fallbackSeriesColor}
                    fillOpacity={0.2}
                    strokeWidth={1}
                  >
                    {viewDataValue && (
                      <LabelList
                        dataKey={dataKey}
                        position={dataLabelPos}
                        fontSize={12}
                        offset={5}
                        formatter={(v) => `${v}${units[dataKey] || ""}`}
                      />
                    )}
                  </Area>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          );
        /**
         * 원형 차트 (Pie Chart)
         *
         * 주의: 파이 차트는 첫 번째 데이터셋만 사용합니다.
         * 여러 데이터셋이 있어도 keys[0]의 데이터만 표시됩니다.
         *
         * Pie 컴포넌트 커스터마이징 옵션:
         * - cx, cy: 중심 좌표 ("50%", 숫자 등)
         * - outerRadius: 외부 반지름 (현재: 80)
         * - innerRadius: 내부 반지름 (도넛 차트로 만들려면 값 지정)
         * - startAngle: 시작 각도 (0-360)
         * - endAngle: 끝 각도 (0-360)
         * - paddingAngle: 조각 간 간격 (숫자)
         * - label: true | false | function | ReactNode - 라벨 표시
         * - labelLine: true | false | <LabelLine /> - 라벨 선 표시
         * - dataKey: 데이터 값 키 (현재: "value")
         * - nameKey: 이름 키 (기본: "name")
         * - fill: 기본 색상 (Cell로 오버라이드됨)
         * - animationBegin: 애니메이션 시작 지연
         * - animationDuration: 애니메이션 지속 시간
         *
         * Cell 컴포넌트: 각 조각의 개별 스타일 지정
         * - fill: 색상
         * - stroke: 테두리 색상
         * - strokeWidth: 테두리 두께
         */
        case "pie":
          // 파이 차트는 첫 번째 데이터셋만 사용 (keys[0])
          const pieData = data.map((item) => ({
            name: item.name,
            value: item[keys[0]] || 0
          }));
          return (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  fill={chartColors[0] || fallbackSeriesColor}
                  dataKey="value"
                  innerRadius={pieDonut ? "40%" : 0}
                  label={false}
                >
                  {viewDataValue && (
                    <LabelList
                      dataKey="value"
                      position={dataLabelPos === "top" ? "outside" : dataLabelPos}
                        fill={dataLabelPos === "top" ? undefined : "white"}
                        stroke="none"
                        fontSize={12}
                        offset={5}
                        formatter={(v) => `${v}${units[keys[0]] || ""}`}
                      />
                    )}
                  {/* 각 조각에 다른 색상 적용 */}
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={chartColors[index] || fallbackSeriesColor}
                      stroke={surfaceColor}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                {/* <Tooltip /> */}
                {viewLegend && <Legend {...legendProps} />}
              </PieChart>
            </ResponsiveContainer>
          );
        /**
         * 레이더 차트 (Radar Chart / Spider Chart)
         *
         * 다차원 데이터를 극좌표계로 표현하는 차트입니다.
         *
         * Radar 컴포넌트 커스터마이징 옵션:
         * - stroke: 선 색상
         * - strokeWidth: 선 두께
         * - fill: 채우기 색상
         * - fillOpacity: 채우기 투명도 (0-1, 현재: 0.6)
         * - dot: true | false | <Dot /> - 포인트 표시
         * - activeDot: 활성 포인트 커스터마이징
         * - connectNulls: null 값 연결 여부
         *
         * PolarGrid 컴포넌트: 극좌표계 격자선
         * - strokeDasharray: 점선 패턴
         *
         * PolarAngleAxis 컴포넌트: 각도축 (라벨 표시)
         * - dataKey: 라벨에 사용할 데이터 키 (현재: "name")
         * - tick: true | false | function | ReactNode - 눈금 표시
         * - tickFormatter: 눈금 텍스트 포맷 함수
         *
         * PolarRadiusAxis 컴포넌트: 반경축 (값 표시)
         * - angle: 축이 위치할 각도 (0-360, 현재: 90도)
         * - domain: [min, max] - 값 범위 (현재: 0부터 최대값까지)
         * - tick: 눈금 표시
         * - tickCount: 눈금 개수
         * - tickFormatter: 눈금 텍스트 포맷 함수
         */
        case "radar":
          return (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data}>
                <PolarGrid />
                <PolarAngleAxis dataKey="name" fontSize={12} tickLine={false} />
                {viewLegend && <Legend {...legendProps} />}
                {series.map(({ dataKey, label }, index) => (
                  <Radar
                    key={index}
                    name={label}
                    dataKey={dataKey}
                    stroke={chartColors[index] || fallbackSeriesColor}
                    fill={chartColors[index] || fallbackSeriesColor}
                    fillOpacity={0.2}
                    strokeWidth={1}
                  >
                    {viewDataValue && (
                      <LabelList
                        dataKey={dataKey}
                        position={dataLabelPos}
                        fontSize={12}
                        offset={5}
                        formatter={(v) => `${v}${units[dataKey] || ""}`}
                      />
                    )}
                  </Radar>
                ))}
              </RadarChart>
            </ResponsiveContainer>
          );
        default:
          return (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                {/* <CartesianGrid strokeDasharray="3 3" /> */}
                <XAxis dataKey="name" tickLine={false} />
                {viewYLabel && <YAxis tickLine={false} />}
                {/* <Tooltip /> */}
                {viewLegend && <Legend {...legendProps} />}
                {series.map(({ dataKey, label }, index) => (
                  <Bar
                    key={index}
                    dataKey={dataKey}
                    name={label}
                    fill={chartColors[index] || fallbackSeriesColor}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
      }
    };

    /**
     * 차트 컨테이너 렌더링
     *
     * 커스터마이징 가능한 스타일:
     * - height: 차트 높이 (현재: "250px")
     * - padding: 내부 여백 (현재: "10px")
     * - width: 너비 (기본: 100%)
     *
     * ref는 ChartPanel.js에서 이미지 복사 기능에 사용됩니다.
     */
    const [ratioW, ratioH] = ratio.split("/").map(Number);

    return (
      <div
        ref={ref}
        className="chart-container"
        style={
          containerHeight != null
            ? { width: "100%", height: containerHeight }
            : { aspectRatio: `${ratioW} / ${ratioH}`, width: "100%" }
        }
      >
        {renderChart()}
      </div>
    );
  }
);

Chart.displayName = "Chart";

/**
 * 공통 컴포넌트 커스터마이징 옵션 모음
 *
 * ========== XAxis / YAxis (축 설정) ==========
 * - dataKey: 데이터 키 (XAxis만)
 * - type: "number" | "category" | 기본값
 * - domain: [min, max] - 값 범위 (예: [0, 100], ["auto", "auto"])
 * - tick: true | false | function | ReactNode - 눈금 표시
 * - tickCount: 눈금 개수
 * - tickFormatter: (value) => string - 눈금 텍스트 포맷 함수
 * - label: string | ReactNode - 축 라벨
 * - angle: 라벨 회전 각도 (-90 ~ 90)
 * - dy: 라벨 Y축 오프셋
 * - dx: 라벨 X축 오프셋
 * - tickMargin: 눈금과 라벨 사이 간격
 * - fontSize: 폰트 크기
 * - fontWeight: 폰트 굵기
 * - stroke: 축 색상
 * - width: 축 선 두께
 *
 * ========== CartesianGrid (격자선) ==========
 * - strokeDasharray: 점선 패턴 (예: "3 3")
 * - stroke: 격자선 색상
 * - strokeWidth: 격자선 두께
 * - vertical: 수직선 표시 여부
 * - horizontal: 수평선 표시 여부
 *
 * ========== Tooltip (툴팁) ==========
 * - formatter: (value, name, props) => ReactNode - 값 포맷 함수
 * - labelFormatter: (label) => ReactNode - 라벨 포맷 함수
 * - content: ReactNode | function - 커스텀 툴팁 컴포넌트
 * - cursor: true | false | <Cursor /> - 커서 표시
 * - separator: ":" - 라벨과 값 구분자
 * - contentStyle: CSS 스타일 객체
 * - labelStyle: 라벨 스타일
 * - itemStyle: 항목 스타일
 * - wrapperStyle: 래퍼 스타일
 *
 * ========== Legend (범례) ==========
 * - align: "left" | "center" | "right" - 정렬
 * - verticalAlign: "top" | "middle" | "bottom" - 수직 정렬
 * - layout: "horizontal" | "vertical" - 배치 방향
 * - iconType: "line" | "square" | "rect" | "circle" | "cross" | "diamond" | "star" | "triangle" | "wye"
 * - formatter: (value) => string - 텍스트 포맷 함수
 * - wrapperStyle: CSS 스타일 객체
 * - iconSize: 아이콘 크기
 * - payload: 커스텀 항목들
 *
 * ========== ResponsiveContainer (반응형 컨테이너) ==========
 * - width: 너비 ("100%", 숫자)
 * - height: 높이 ("100%", 숫자)
 * - aspect: 가로세로 비율 (width/height)
 * - minWidth: 최소 너비
 * - minHeight: 최소 높이
 * - maxHeight: 최대 높이
 *
 * ========== 색상 커스터마이징 예시 ==========
 *
 * // 1. 단일 색상 사용
 * fill="#FF6384"
 *
 * // 2. 투명도 포함
 * fill="rgba(255, 99, 132, 0.5)"
 *
 * // 3. 그라데이션 (BarChart 등에서 사용)
 * <defs>
 *   <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
 *     <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
 *     <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
 *   </linearGradient>
 * </defs>
 * <Bar fill="url(#colorGradient)" />
 *
 * ========== 데이터 포맷팅 예시 ==========
 *
 * // Tooltip 포맷팅
 * <Tooltip
 *   formatter={(value) => `${value.toLocaleString()}개`}
 *   labelFormatter={(label) => `날짜: ${label}`}
 * />
 *
 * // YAxis 포맷팅
 * <YAxis
 *   tickFormatter={(value) => `${value}%`}
 * />
 *
 * ========== 애니메이션 커스터마이징 ==========
 *
 * // Bar/Line/Area 등에서 애니메이션 제어
 * <Bar
 *   isAnimationActive={true}  // 애니메이션 활성화
 *   animationBegin={0}         // 시작 지연 (ms)
 *   animationDuration={800}    // 지속 시간 (ms)
 *   animationEasing="ease-in-out"  // 이징 함수
 * />
 *
 * ========== 이벤트 핸들링 ==========
 *
 * // 클릭 이벤트
 * <Bar
 *   onClick={(data, index) => console.log(data, index)}
 * />
 *
 * // 마우스 오버
 * <Bar
 *   onMouseEnter={(data, index) => console.log('Enter', data)}
 *   onMouseLeave={(data, index) => console.log('Leave', data)}
 * />
 */

export default Chart;
