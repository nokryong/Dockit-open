import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ChartBlockView from "./ChartBlockView";

const ChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      tableData: {
        default: "[]",
        parseHTML: (el) => el.getAttribute("data-table") || "[]",
        renderHTML: (attrs) => ({ "data-table": attrs.tableData })
      },
      chartType: {
        default: "bar",
        parseHTML: (el) => el.getAttribute("data-chart-type") || "bar",
        renderHTML: (attrs) => ({ "data-chart-type": attrs.chartType })
      },
      chartColors: {
        default: "[]",
        parseHTML: (el) => el.getAttribute("data-colors") || "[]",
        renderHTML: (attrs) => ({ "data-colors": attrs.chartColors })
      },
      isAxesSwapped: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-axes-swapped") === "true",
        renderHTML: (attrs) => ({ "data-axes-swapped": String(attrs.isAxesSwapped) })
      },
      viewDataValue: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-view-data") === "true",
        renderHTML: (attrs) => ({ "data-view-data": String(attrs.viewDataValue) })
      },
      viewLegend: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-view-legend") === "true",
        renderHTML: (attrs) => ({ "data-view-legend": String(attrs.viewLegend) })
      },
      viewYLabel: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-view-ylabel") !== "false",
        renderHTML: (attrs) => ({ "data-view-ylabel": String(attrs.viewYLabel) })
      },
      textAlign: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-text-align") || "left",
        renderHTML: (attrs) => ({ "data-text-align": attrs.textAlign })
      },
      width: {
        default: 120,
        parseHTML: (el) => parseFloat(el.getAttribute("data-width")) || 120,
        renderHTML: (attrs) => ({ "data-width": attrs.width })
      },
      height: {
        default: 80,
        parseHTML: (el) => parseFloat(el.getAttribute("data-height")) || 80,
        renderHTML: (attrs) => ({ "data-height": attrs.height })
      },
      legendPosition: {
        default: "bottom",
        parseHTML: (el) => el.getAttribute("data-legend-pos") || "bottom",
        renderHTML: (attrs) => ({ "data-legend-pos": attrs.legendPosition })
      },
      dataLabelPos: {
        default: "top",
        parseHTML: (el) => el.getAttribute("data-label-pos") || "top",
        renderHTML: (attrs) => ({ "data-label-pos": attrs.dataLabelPos })
      },
      showGrid: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-grid") === "true",
        renderHTML: (attrs) => ({ "data-show-grid": String(attrs.showGrid) })
      },
      lineType: {
        default: "monotone",
        parseHTML: (el) => el.getAttribute("data-line-type") || "monotone",
        renderHTML: (attrs) => ({ "data-line-type": attrs.lineType })
      },
      barRadius: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-bar-radius") !== "false",
        renderHTML: (attrs) => ({ "data-bar-radius": String(attrs.barRadius) })
      },
      pieDonut: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-pie-donut") === "true",
        renderHTML: (attrs) => ({ "data-pie-donut": String(attrs.pieDonut) })
      },
      objectId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-object-id") || null,
        renderHTML: (attrs) =>
          attrs.objectId ? { "data-object-id": attrs.objectId } : {}
      }
    };
  },

  parseHTML() {
    return [{ tag: "div[data-chart-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-chart-block": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartBlockView);
  },

  addCommands() {
    return {
      insertChartBlock: (attrs) => ({ commands }) => {
        return commands.insertContent({ type: "chartBlock", attrs });
      },
      updateChartBlock: (pos, attrs) => ({ state, dispatch }) => {
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== "chartBlock") return false;
        if (dispatch) dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
        return true;
      }
    };
  }
});

export default ChartBlock;
