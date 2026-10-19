// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPaginationDomModel } from "../../app/LIB/pagination/model/collectDomMeasurements";

const node = (name, children = []) => ({
  type: { name }, isBlock: true, childCount: children.length,
  nodeSize: 2 + children.reduce((sum, child) => sum + child.nodeSize, 0),
  forEach(callback) {
    let offset = 0;
    children.forEach((child, index) => {
      callback(child, offset, index);
      offset += child.nodeSize;
    });
  }
});

const setBox = (element, top, height, scale = 1) => {
  element.style.boxSizing = "border-box";
  element.style.height = `${height}px`;
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: Math.round(height) });
  element.getBoundingClientRect = () => ({
    top: top * scale, bottom: (top + height) * scale, height: height * scale,
    left: 0, right: 600 * scale, width: 600 * scale
  });
};

const makeView = (root, children, domByPos) => ({
  dom: root, state: { doc: node("doc", children) }, nodeDOM: pos => domByPos.get(pos)
});

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("fractional pagination heights", () => {
  it.each([0.75, 1, 1.5])("measures text and list lines in document pixels at scale %s", scale => {
    const canvas = document.createElement("div");
    canvas.className = "zoom-container";
    canvas.style.transform = `matrix(${scale}, 0, 0, ${scale}, 0, 0)`;
    const root = document.createElement("div");
    root.innerHTML = '<p>A</p><ul><li><p>B</p></li></ul>';
    canvas.append(root);
    document.body.append(canvas);
    const [paragraph, list] = root.children;
    const item = list.firstElementChild;
    setBox(root, 0, 80, scale);
    setBox(paragraph, 0, 25.59375, scale);
    setBox(list, 25.59375, 25.59375, scale);
    setBox(item, 25.59375, 25.59375, scale);
    setBox(item.firstElementChild, 25.59375, 25.59375, scale);
    paragraph.style.lineHeight = item.firstElementChild.style.lineHeight = '25.59375px';
    vi.spyOn(document, "createRange").mockImplementation(() => {
      let selected;
      return {
        selectNodeContents(element) { selected = element; },
        getClientRects() { return [selected.parentElement.getBoundingClientRect()]; },
        detach() {}
      };
    });
    const view = makeView(root, [node("paragraph"), node("bulletList", [node("listItem", [node("paragraph")])])],
      new Map([[0, paragraph], [2, list], [3, item]]));
    view.posAtCoords = () => ({ pos: 1 });
    const { measurements } = collectPaginationDomModel(view);
    expect(measurements.map(item => item.kind)).toEqual(["textLine", "listLine"]);
    measurements.forEach(item => expect(item.offsetHeight).toBeCloseTo(25.59375, 5));
  });

  it.each([1, 1.5])("keeps empty-line heights instead of accumulating rounded pixels at scale %s", scale => {
    const root = document.createElement("div");
    const domByPos = new Map();
    const children = Array.from({ length: 26 }, (_, index) => {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      setBox(paragraph, index * 25.59375, 25.59375, scale);
      root.append(paragraph);
      domByPos.set(index * 2, paragraph);
      return node("paragraph");
    });
    setBox(root, 0, 26 * 25.59375, scale);
    document.body.append(root);
    const { measurements } = collectPaginationDomModel(makeView(root, children, domByPos));
    expect(measurements.reduce((sum, item) => sum + item.offsetHeight, 0)).toBe(665.4375);
  });

  it("includes padding and borders when CSS height describes the content box", () => {
    const root = document.createElement("div");
    const heading = document.createElement("h2");
    setBox(root, 0, 100);
    setBox(heading, 0, 25.59375);
    heading.style.boxSizing = "content-box";
    heading.style.padding = "2px 0";
    heading.style.border = "1px solid";
    root.append(heading);
    document.body.append(root);
    const { measurements } = collectPaginationDomModel(makeView(root, [node("heading")], new Map([[0, heading]])));
    expect(measurements[0].offsetHeight).toBe(31.59375);
  });

  it.each([1, 1.5])("counts table outer edges once without counting injected page gaps at scale %s", scale => {
    const root = document.createElement("div");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<table><tbody><tr class="tiptap-table-page-break-row"><td></td></tr><tr><th>A</th></tr><tr class="tiptap-table-page-break-row"><td></td></tr><tr><td>B</td></tr></tbody></table>';
    root.append(wrapper);
    document.body.append(root);
    setBox(root, 0, 500, scale);
    setBox(wrapper, 10, 2 * 30.3125 + 300 + 1, scale);
    const rows = [...wrapper.querySelectorAll("tr")];
    let top = 10.5;
    [100, 30.3125, 200, 30.3125].forEach((height, index) => {
      setBox(rows[index], top, height, scale);
      top += height;
    });
    const table = node("table", [node("tableRow"), node("tableRow")]);
    const view = makeView(root, [table], new Map([[0, wrapper], [1, rows[1]], [3, rows[3]]]));
    const { measurements, blocks } = collectPaginationDomModel(view);
    expect(measurements.map(item => item.offsetHeight)).toEqual([30.8125, 30.8125]);
    expect(measurements.reduce((sum, item) => sum + item.offsetHeight, 0)).toBe(61.625);
    expect(blocks[0].repeatHeaderHeight).toBe(30.3125);
  });
});
