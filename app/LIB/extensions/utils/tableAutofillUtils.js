import { t as uiText } from "../../i18n";
import { CellSelection } from "@tiptap/pm/tables";
import { toast } from "sud-ui";

const TABLE_AUTOFILL_MIN_SEED_COUNT = 3;
const TABLE_AUTOFILL_EPSILON = 0.000001;
const TABLE_AUTOFILL_KOREAN_SEQUENCE = [
  "가",
  "나",
  "다",
  "라",
  "마",
  "바",
  "사",
  "아",
  "자",
  "차",
  "카",
  "타",
  "파",
  "하"
];
const TABLE_AUTOFILL_WEEKDAY_SEQUENCE = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일"
];
const TABLE_AUTOFILL_ENGLISH_LOWER_SEQUENCE = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode(97 + index)
);
const TABLE_AUTOFILL_ENGLISH_UPPER_SEQUENCE = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode(65 + index)
);

function normalizeCellText(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellPlainText(cellNode) {
  if (!cellNode) {
    return "";
  }

  return normalizeCellText(
    cellNode.textBetween(0, cellNode.content.size, "\n", "\n")
  );
}

function getLinearCellSelection(state, tableContext) {
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return null;
  }

  const { tablePos, map } = tableContext;
  const anchorRelPos = selection.$anchorCell.pos - tablePos - 1;
  const headRelPos = selection.$headCell.pos - tablePos - 1;
  const rect = map.rectBetween(anchorRelPos, headRelPos);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  if (width !== 1 && height !== 1) {
    return null;
  }

  const cells = [];
  const visited = new Set();

  if (height === 1) {
    for (let col = rect.left; col < rect.right; col += 1) {
      const relPos = map.map[rect.top * map.width + col];

      if (visited.has(relPos)) {
        return null;
      }

      visited.add(relPos);

      const cellRect = map.findCell(relPos);

      if (
        cellRect.left !== col ||
        cellRect.right !== col + 1 ||
        cellRect.top !== rect.top ||
        cellRect.bottom !== rect.bottom
      ) {
        return null;
      }

      const pos = tablePos + 1 + relPos;
      const node = state.doc.nodeAt(pos);

      if (!node) {
        return null;
      }

      cells.push({
        pos,
        node,
        text: getCellPlainText(node)
      });
    }

    return { axis: "row", cells, rect };
  }

  for (let row = rect.top; row < rect.bottom; row += 1) {
    const relPos = map.map[row * map.width + rect.left];

    if (visited.has(relPos)) {
      return null;
    }

    visited.add(relPos);

    const cellRect = map.findCell(relPos);

    if (
      cellRect.left !== rect.left ||
      cellRect.right !== rect.right ||
      cellRect.top !== row ||
      cellRect.bottom !== row + 1
    ) {
      return null;
    }

    const pos = tablePos + 1 + relPos;
    const node = state.doc.nodeAt(pos);

    if (!node) {
      return null;
    }

    cells.push({
      pos,
      node,
      text: getCellPlainText(node)
    });
  }

  return { axis: "column", cells, rect };
}

function getLeadingFilledCellCount(values) {
  let count = 0;

  for (const value of values) {
    if (!normalizeCellText(value)) {
      break;
    }

    count += 1;
  }

  return count;
}

function getAutofillSeedValues(values) {
  if (values.length <= TABLE_AUTOFILL_MIN_SEED_COUNT) {
    return null;
  }

  const leadingFilledCount = getLeadingFilledCellCount(values);

  if (leadingFilledCount < TABLE_AUTOFILL_MIN_SEED_COUNT) {
    return null;
  }

  const seedCount =
    leadingFilledCount < values.length
      ? leadingFilledCount
      : TABLE_AUTOFILL_MIN_SEED_COUNT;

  if (seedCount >= values.length) {
    return null;
  }

  return {
    seedValues: values.slice(0, seedCount).map((value) => normalizeCellText(value)),
    targetCount: values.length - seedCount
  };
}

function parseNumericValueWithSuffix(value) {
  const normalizedValue = normalizeCellText(value);
  const match = normalizedValue.match(
    /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/
  );

  if (!match) {
    return null;
  }

  const rawNumber = match[1];
  const suffix = match[2] || "";
  const normalizedSuffix = suffix.trim();
  const decimalMatch = rawNumber.replace(/,/g, "").match(/\.(\d+)$/);

  return {
    value: Number(rawNumber.replace(/,/g, "")),
    suffix,
    normalizedSuffix,
    decimals: decimalMatch ? decimalMatch[1].length : 0
  };
}

function parseNumericSeries(values) {
  const entries = values.map(parseNumericValueWithSuffix);

  if (entries.some((entry) => !entry || !Number.isFinite(entry.value))) {
    return null;
  }

  const normalizedSuffix = entries[0].normalizedSuffix;

  if (
    entries.some((entry) => entry.normalizedSuffix !== normalizedSuffix)
  ) {
    return null;
  }

  return {
    entries,
    suffix: entries[0].suffix,
    decimals: entries.reduce(
      (maxDecimals, entry) => Math.max(maxDecimals, entry.decimals),
      0
    )
  };
}

function summarizeNumericValues(values) {
  const entries = values.map(parseNumericValueWithSuffix);
  const numericEntries = entries.filter(
    (entry) => entry && Number.isFinite(entry.value)
  );
  const normalizedSuffixes = new Set(
    numericEntries.map((entry) => entry.normalizedSuffix)
  );

  return {
    totalValue: entries.reduce(
      (sum, entry) => sum + (entry && Number.isFinite(entry.value) ? entry.value : 0),
      0
    ),
    decimals: numericEntries.reduce(
      (maxDecimals, entry) => Math.max(maxDecimals, entry.decimals),
      0
    ),
    suffix:
      numericEntries.length > 0 && normalizedSuffixes.size === 1
        ? numericEntries[0].suffix
        : ""
  };
}

function almostEqual(a, b) {
  return Math.abs(a - b) <= TABLE_AUTOFILL_EPSILON;
}

function formatNumericOutput(value, decimals, suffix) {
  const precision = Math.max(decimals, 6);
  const roundedValue = Number(value.toFixed(precision));
  return `${roundedValue}${suffix || ""}`;
}

function generateArithmeticSeries(entries, targetCount, suffix, decimals) {
  const diff = entries[1].value - entries[0].value;

  for (let index = 2; index < entries.length; index += 1) {
    if (!almostEqual(entries[index].value - entries[index - 1].value, diff)) {
      return null;
    }
  }

  const generatedValues = [];
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    currentValue += diff;
    generatedValues.push(formatNumericOutput(currentValue, decimals, suffix));
  }

  return generatedValues;
}

function generateGeometricSeries(entries, targetCount, suffix, decimals) {
  if (entries.some((entry) => almostEqual(entry.value, 0))) {
    return null;
  }

  const ratio = entries[1].value / entries[0].value;

  for (let index = 2; index < entries.length; index += 1) {
    if (!almostEqual(entries[index].value / entries[index - 1].value, ratio)) {
      return null;
    }
  }

  const generatedValues = [];
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    currentValue *= ratio;
    generatedValues.push(formatNumericOutput(currentValue, decimals, suffix));
  }

  return generatedValues;
}

function generateAdditiveSeries(entries, targetCount, suffix, decimals) {
  for (let index = 2; index < entries.length; index += 1) {
    if (
      !almostEqual(
        entries[index].value,
        entries[index - 1].value + entries[index - 2].value
      )
    ) {
      return null;
    }
  }

  const generatedValues = [];
  let previousValue = entries[entries.length - 2].value;
  let currentValue = entries[entries.length - 1].value;

  for (let index = 0; index < targetCount; index += 1) {
    const nextValue = previousValue + currentValue;
    generatedValues.push(formatNumericOutput(nextValue, decimals, suffix));
    previousValue = currentValue;
    currentValue = nextValue;
  }

  return generatedValues;
}

function generateSequenceSeries(values, targetCount, sequence) {
  const sequenceIndexes = values.map((value) => sequence.indexOf(value));

  if (sequenceIndexes.some((index) => index < 0)) {
    return null;
  }

  const step = sequenceIndexes[1] - sequenceIndexes[0];

  if (!Number.isInteger(step) || step === 0) {
    return null;
  }

  for (let index = 2; index < sequenceIndexes.length; index += 1) {
    if (sequenceIndexes[index] - sequenceIndexes[index - 1] !== step) {
      return null;
    }
  }

  const generatedValues = [];
  let currentIndex = sequenceIndexes[sequenceIndexes.length - 1];

  for (let index = 0; index < targetCount; index += 1) {
    currentIndex += step;

    if (currentIndex < 0 || currentIndex >= sequence.length) {
      return null;
    }

    generatedValues.push(sequence[currentIndex]);
  }

  return generatedValues;
}

function generateAutofillValues(seedValues, targetCount) {
  if (
    seedValues.length < TABLE_AUTOFILL_MIN_SEED_COUNT ||
    targetCount <= 0
  ) {
    return null;
  }

  if (seedValues.every((value) => value === seedValues[0])) {
    return Array(targetCount).fill(seedValues[0]);
  }

  const numericSeries = parseNumericSeries(seedValues);

  if (numericSeries) {
    return (
      generateArithmeticSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      ) ||
      generateGeometricSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      ) ||
      generateAdditiveSeries(
        numericSeries.entries,
        targetCount,
        numericSeries.suffix,
        numericSeries.decimals
      )
    );
  }

  return (
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_KOREAN_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_ENGLISH_LOWER_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_ENGLISH_UPPER_SEQUENCE
    ) ||
    generateSequenceSeries(
      seedValues,
      targetCount,
      TABLE_AUTOFILL_WEEKDAY_SEQUENCE
    )
  );
}

function createCellTextContent(schema, cellNode, text) {
  const textNode = text ? schema.text(text) : null;
  const preferredType =
    cellNode.firstChild?.type?.isTextblock
      ? cellNode.firstChild.type
      : cellNode.contentMatchAt(0)?.defaultType || schema.nodes.paragraph;
  const preferredAttrs =
    cellNode.firstChild?.type === preferredType ? cellNode.firstChild.attrs : null;

  if (preferredType?.isTextblock) {
    const preferredContent = preferredType.createAndFill(preferredAttrs, textNode);

    if (preferredContent) {
      return preferredContent;
    }
  }

  if (schema.nodes.paragraph) {
    return (
      schema.nodes.paragraph.createAndFill(null, textNode) ||
      schema.nodes.paragraph.create(null, textNode)
    );
  }

  return preferredType.create(preferredAttrs, textNode);
}

function applyCellTextChanges(view, linearSelection, changes) {
  if (!changes.length) {
    return false;
  }

  const { state } = view;
  const tr = state.tr;
  const sortedChanges = [...changes].sort((a, b) => b.pos - a.pos);

  for (const change of sortedChanges) {
    tr.replaceWith(
      change.pos + 1,
      change.pos + change.node.nodeSize - 1,
      createCellTextContent(state.schema, change.node, change.text)
    );
  }

  const firstCellPos = tr.mapping.map(linearSelection.cells[0].pos);
  const lastCellPos = tr.mapping.map(
    linearSelection.cells[linearSelection.cells.length - 1].pos
  );

  tr.setSelection(CellSelection.create(tr.doc, firstCellPos, lastCellPos));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function runTableAutofill(view, tableContext) {
  const { state } = view;
  const linearSelection = getLinearCellSelection(state, tableContext);

  if (!linearSelection || linearSelection.cells.length <= TABLE_AUTOFILL_MIN_SEED_COUNT) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  const selectedValues = linearSelection.cells.map((cell) => cell.text);
  const autofillSeed = getAutofillSeedValues(selectedValues);

  if (!autofillSeed) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  const generatedValues = generateAutofillValues(
    autofillSeed.seedValues,
    autofillSeed.targetCount
  );

  if (!generatedValues) {
    toast.danger(uiText("자동채우기를 실패했습니다."));
    return false;
  }

  return applyCellTextChanges(
    view,
    linearSelection,
    linearSelection.cells
      .slice(linearSelection.cells.length - generatedValues.length)
      .map((cell, index) => ({
        ...cell,
        text: generatedValues[index]
      }))
  );
}

function runTableSelectionSum(view, tableContext) {
  const { state } = view;
  const linearSelection = getLinearCellSelection(state, tableContext);

  if (!linearSelection || linearSelection.cells.length < 2) {
    toast.danger(uiText("합계 계산을 실패했습니다."));
    return false;
  }

  const sourceCells = linearSelection.cells.slice(0, -1);
  const summary = summarizeNumericValues(sourceCells.map((cell) => cell.text));

  return applyCellTextChanges(view, linearSelection, [
    {
      ...linearSelection.cells[linearSelection.cells.length - 1],
      text: formatNumericOutput(
        summary.totalValue,
        summary.decimals,
        summary.suffix
      )
    }
  ]);
}

export { runTableAutofill, runTableSelectionSum };
