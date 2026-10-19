import { describe, expect, it } from "vitest";
import {
  collectListNumberingModels,
  normalizeListNumbering
} from "../../app/LIB/ir/listNumberingModel";
import { listTableReadinessIR } from "./fixtures/irExportReadinessFixtures";

const nestedListBlock = {
  type: "list",
  listType: "ordered",
  attrs: {
    start: 5
  },
  items: [
    {
      type: "listItem",
      attrs: {
        value: 5
      },
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [{ type: "textRun", text: "첫 항목", marks: [] }]
        },
        {
          type: "list",
          listType: "bullet",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "하위 bullet", marks: [] }]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: "listItem",
      attrs: {},
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [{ type: "textRun", text: "둘째 항목", marks: [] }]
        },
        {
          type: "list",
          listType: "task",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: {
                checked: true
              },
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "완료 task", marks: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

describe("IR list numbering model v1", () => {
  it("ordered list의 start number, effective number, depth를 정규화한다", () => {
    const model = normalizeListNumbering(nestedListBlock);

    expect(model).toMatchObject({
      version: "ir-list-numbering-v1",
      rootListType: "ordered",
      maxDepth: 1,
      unsupported: [
        "numbering definition id is not stable in v1",
        "nested list restart policy is adapter-defined in v1"
      ]
    });
    expect(model.levels[0]).toMatchObject({
      depth: 0,
      level: 1,
      listType: "ordered",
      markerKind: "ordered",
      markerFormat: "decimal",
      startNumber: 5,
      startNumberSource: "attrs",
      itemCount: 2
    });
    expect(model.items[0]).toMatchObject({
      path: [0],
      depth: 0,
      level: 1,
      ordinal: 1,
      startNumber: 5,
      effectiveNumber: 5,
      childListCount: 1,
      unsupported: ["list item value is preserved but not canonical numbering"]
    });
    expect(model.items.find((item) => item.path.join(".") === "1")).toMatchObject({
      path: [1],
      ordinal: 2,
      effectiveNumber: 6
    });
  });

  it("nested bullet/task list는 가능한 marker metadata만 보존한다", () => {
    const model = normalizeListNumbering(nestedListBlock);
    const bulletLevel = model.levels.find((level) => level.listType === "bullet");
    const taskItem = model.items.find((item) => item.markerKind === "task");

    expect(bulletLevel).toMatchObject({
      depth: 1,
      level: 2,
      markerKind: "bullet",
      markerFormat: "bullet",
      startNumber: null,
      startNumberSource: "not-applicable"
    });
    expect(taskItem).toMatchObject({
      path: [1, 0, 0],
      depth: 1,
      level: 2,
      markerKind: "task",
      markerFormat: "checkbox",
      checked: true,
      effectiveNumber: null
    });
    expect(Object.isFrozen(model.levels)).toBe(true);
    expect(Object.isFrozen(model.items[0].path)).toBe(true);
  });

  it("IR block tree에서 list numbering model을 수집한다", () => {
    const models = collectListNumberingModels(
      listTableReadinessIR.sections[0].blocks
    );

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      rootListType: "ordered",
      levels: [
        {
          markerFormat: "decimal",
          startNumber: 3
        }
      ],
      items: [
        {
          effectiveNumber: 3,
          unsupported: ["list item value is preserved but not canonical numbering"]
        }
      ]
    });
  });
});
