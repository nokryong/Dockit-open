"use client";
import { t as uiText, useI18n } from "../../i18n";

import dynamic from "@/desktop/dynamic";
import { useCallback, useRef, useState } from "react";
import { Button, toast } from "sud-ui";
import { useSetting } from "../../context/SettingContext";
import WidgetCard from "./WidgetCard";
import { TbFileSpreadsheet } from "react-icons/tb";

// FortuneSheet SSR 대응
const Workbook = dynamic(
  () => import("@fortune-sheet/react").then((mod) => mod.Workbook),
  { ssr: false }
);
import "@fortune-sheet/react/dist/index.css";
import { HiOutlineDownload, HiOutlineUpload } from "react-icons/hi";
import { useLayout } from "../../context/LayoutContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { newShadowDarkSm, newShadowLightSm } from "../../constant/uiProps";

export default function SheetPanel({ dragHandleProps }) {
  const language = useI18n();
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const { headerHeight, footerHeight } = useLayout();
  const workbookRef = useRef(null);
  const fileInputRef = useRef(null);
  const [key, setKey] = useState(0);

  const [data, setData] = useState([
    {
      name: "Sheet1",
      celldata: []
    }
  ]);

  // ExcelJS로 엑셀 업로드 처리
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { default: ExcelJS } = await import("exceljs");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const sheets = [];

      // 모든 시트를 순회
      workbook.eachSheet((worksheet, sheetId) => {
        const celldata = [];
        const mergeData = {}; // 병합 정보 저장

        // 병합된 셀 정보 수집
        if (worksheet.model?.merges) {
          worksheet.model.merges.forEach((merge) => {
            // merge 형식: "A1:B2" 또는 {top, left, bottom, right}
            let startRow, startCol, endRow, endCol;

            if (typeof merge === "string") {
              // "A1:B2" 형식 파싱
              const [start, end] = merge.split(":");
              const startCell = worksheet.getCell(start);
              const endCell = worksheet.getCell(end);
              startRow = startCell.row - 1;
              startCol = startCell.col - 1;
              endRow = endCell.row - 1;
              endCol = endCell.col - 1;
            } else {
              startRow = merge.top - 1;
              startCol = merge.left - 1;
              endRow = merge.bottom - 1;
              endCol = merge.right - 1;
            }

            const key = `${startRow}_${startCol}`;
            mergeData[key] = {
              r: startRow,
              c: startCol,
              rs: endRow - startRow + 1,
              cs: endCol - startCol + 1
            };
          });
        }

        // 모든 행과 열을 순회
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            if (
              cell.value === null ||
              cell.value === undefined ||
              cell.value === ""
            )
              return;

            const cellObj = {
              r: rowNumber - 1,
              c: colNumber - 1,
              v: {
                v: cell.value,
                m: String(cell.value),
                ct: { fa: "General", t: "n" }
              }
            };

            // 병합 정보 추가
            const mergeKey = `${rowNumber - 1}_${colNumber - 1}`;
            if (mergeData[mergeKey]) {
              cellObj.v.mc = mergeData[mergeKey];
            }

            // 폰트 스타일
            if (cell.font?.bold) cellObj.v.bl = 1;
            if (cell.font?.italic) cellObj.v.it = 1;
            if (cell.font?.size) cellObj.v.fs = cell.font.size;

            // 배경색
            if (cell.fill?.fgColor?.argb) {
              const argb = cell.fill.fgColor.argb;
              cellObj.v.bg = `#${argb.slice(-6)}`;
            }

            celldata.push(cellObj);
          });
        });

        sheets.push({
          name: worksheet.name,
          color: "",
          status: sheetId === 1 ? 1 : 0, // 첫 번째 시트만 활성화
          order: sheetId - 1,
          celldata: celldata,
          row: worksheet.rowCount,
          column: worksheet.columnCount,
          config: {
            merge: mergeData,
            columnlen: {},
            rowlen: {}
          },
          index: String(sheetId - 1)
        });
      });

      if (sheets.length === 0) {
        setTimeout(() => toast.danger(uiText("유효한 시트 데이터가 없습니다.")), 0);
        return;
      }

      setData(sheets);
      setKey((prev) => prev + 1);

      setTimeout(
        () =>
          toast.success(uiText("{0}개의 시트를 성공적으로 불러왔습니다.", sheets.length)),
        0
      );
    } catch (error) {
      console.error(uiText("업로드 처리 중 오류:"), error);
      setTimeout(() => toast.danger(uiText("파일 업로드 중 오류가 발생했습니다.")), 0);
    } finally {
      e.target.value = "";
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
        import("exceljs"),
        import("file-saver")
      ]);
      const instance = workbookRef.current;
      if (!instance) {
        setTimeout(() => toast.danger(uiText("시트 데이터를 가져올 수 없습니다.")), 0);
        return;
      }

      // getAllSheets() 메서드로 현재 시트 데이터 가져오기
      const allSheets = instance.getAllSheets();

      if (!allSheets?.length) {
        setTimeout(() => toast.danger(uiText("내보낼 데이터가 없습니다.")), 0);
        return;
      }

      const workbook = new ExcelJS.Workbook();

      allSheets.forEach((sheet, sheetIndex) => {
        const worksheet = workbook.addWorksheet(
          sheet.name || `Sheet${sheetIndex + 1}`
        );

        // FortuneSheet는 data를 여러 형식으로 저장할 수 있음
        // 1. celldata 형식 (우리가 업로드한 형식)
        // 2. data 2차원 배열 형식
        const celldata = sheet.celldata || [];
        const data2D = sheet.data || [];

        // celldata 형식으로 처리
        if (celldata.length > 0) {
          celldata.forEach((cell) => {
            const { r, c, v } = cell;
            if (!v) return;

            const excelCell = worksheet.getCell(r + 1, c + 1);
            const cellValue = v.m ?? v.v;

            if (
              cellValue !== null &&
              cellValue !== undefined &&
              cellValue !== ""
            ) {
              excelCell.value = cellValue;
            }

            // 스타일 적용
            const font = {};
            if (v.bl === 1 || v.bl === true) font.bold = true;
            if (v.it === 1 || v.it === true) font.italic = true;
            if (v.fs) font.size = v.fs;
            if (v.fc) font.color = { argb: "FF" + v.fc.replace("#", "") };
            if (Object.keys(font).length > 0) excelCell.font = font;

            if (v.bg && typeof v.bg === "string") {
              excelCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF" + v.bg.replace("#", "") }
              };
            }

            const alignment = {};
            if (v.ht !== undefined)
              alignment.horizontal =
                ["left", "center", "right"][v.ht] || "left";
            if (v.vt !== undefined)
              alignment.vertical =
                ["top", "middle", "bottom"][v.vt] || "middle";
            if (Object.keys(alignment).length > 0)
              excelCell.alignment = alignment;
          });
        }
        // data 2차원 배열 형식으로 처리
        else if (data2D.length > 0) {
          data2D.forEach((row, rowIndex) => {
            if (!row) return;

            row.forEach((cell, colIndex) => {
              if (!cell) return;

              const excelCell = worksheet.getCell(rowIndex + 1, colIndex + 1);
              const cellValue = cell.m ?? cell.v;

              if (
                cellValue !== null &&
                cellValue !== undefined &&
                cellValue !== ""
              ) {
                excelCell.value = cellValue;
              }

              // 스타일 적용
              const font = {};
              if (cell.bl === 1 || cell.bl === true) font.bold = true;
              if (cell.it === 1 || cell.it === true) font.italic = true;
              if (cell.fs) font.size = cell.fs;
              if (cell.fc)
                font.color = { argb: "FF" + cell.fc.replace("#", "") };
              if (Object.keys(font).length > 0) excelCell.font = font;

              if (cell.bg && typeof cell.bg === "string") {
                excelCell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: "FF" + cell.bg.replace("#", "") }
                };
              }

              const alignment = {};
              if (cell.ht !== undefined)
                alignment.horizontal =
                  ["left", "center", "right"][cell.ht] || "left";
              if (cell.vt !== undefined)
                alignment.vertical =
                  ["top", "middle", "bottom"][cell.vt] || "middle";
              if (Object.keys(alignment).length > 0)
                excelCell.alignment = alignment;
            });
          });
        } else {
          console.warn(`Sheet "${sheet.name}" has no data to export`);
        }

        // 병합된 셀 처리
        if (sheet.config?.merge) {
          Object.values(sheet.config.merge).forEach((merge) => {
            try {
              worksheet.mergeCells(
                merge.r + 1,
                merge.c + 1,
                merge.r + merge.rs,
                merge.c + merge.cs
              );
            } catch (e) {
              console.error("Merge error:", e);
            }
          });
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buffer]), `dockit_sheet_${timestamp}.xlsx`);
      setTimeout(() => toast.success(uiText("파일을 성공적으로 내보냈습니다.")), 0);
    } catch (error) {
      console.error(uiText("내보내기 중 오류:"), error);
      setTimeout(() => toast.danger(uiText("파일 내보내기에 실패했습니다.")), 0);
    }
  }, []);

  return (
    <WidgetCard
      icon={TbFileSpreadsheet}
      title={uiText("시트")}
      dragHandleProps={dragHandleProps}
      widgetType="sheetPanel"
      titleBtn={
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".xlsx,.xls"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            icon={<HiOutlineUpload size={16} />}
            onClick={() => fileInputRef.current?.click()}
            background={setting.theme}
            color={`${setting.theme}-1`}
            aria-label={uiText("엑셀 파일 업로드")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          />
          <Button
            size="sm"
            icon={<HiOutlineDownload size={16} />}
            onClick={handleExport}
            background={setting.theme}
            color={`${setting.theme}-1`}
            aria-label={uiText("엑셀 파일 다운로드")}
            border={false}
            {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
          />
        </div>
      }
    >
      <div
        className="w-full"
        style={{
          height: `calc(100dvh - ${headerHeight}px - ${footerHeight}px - ${150}px)`
        }}
      >
        <Workbook
          lang={language}
          key={key}
          ref={workbookRef}
          data={data}
          onChange={setData}
          showToolbar={true}
          showFormulaBar={true}
        />
      </div>
    </WidgetCard>
  );
}
