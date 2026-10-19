import { Extension, Node, mergeAttributes } from "@tiptap/core";
import {
  NodeSelection,
  Selection,
  SelectionRange,
  TextSelection
} from "@tiptap/pm/state";

// Local TipTap 3-compatible replacement for @tiptap-extend/columns.
const buildNode = ({ type, content }) => (content ? { type, content } : { type });
const buildParagraph = ({ content } = {}) =>
  buildNode({ type: "paragraph", content });
const buildColumn = ({ content } = {}) => buildNode({ type: "column", content });
const buildColumnBlock = ({ content }) =>
  buildNode({ type: "columnBlock", content });
const buildNColumns = (count) =>
  Array.from({ length: count }, () =>
    buildColumn({ content: [buildParagraph()] })
  );

const findParentNodeClosestToPos = ($pos, predicate) => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const pos = $pos.before(depth);
    const start = $pos.start(depth);

    if (predicate({ node, pos, start, depth })) {
      return { node, pos, start, depth };
    }
  }

  return null;
};

export const Column = Node.create({
  name: "column",
  group: "column",
  content: "(paragraph|block)*",
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": this.name,
        class: "column"
      }),
      0
    ];
  }
});

class ColumnSelection extends Selection {
  constructor(selection) {
    const { $from, $to } = selection;
    super($from, $to);
    this._$from = $from;
    this._$to = $to;
  }

  get $from() {
    return this._$from;
  }

  get $to() {
    return this._$to;
  }

  map() {
    return this;
  }

  content() {
    return this.$from.doc.slice(this.from, this.to, true);
  }

  eq(other) {
    return other instanceof ColumnSelection && other.anchor === this.anchor;
  }

  toJSON() {
    return { type: "column", from: this.from, to: this.to };
  }

  expandSelection(doc) {
    const closestColumnOrRoot = ({ node, pos }) =>
      node.type.name === Column.name || doc.resolve(pos).depth <= 0;

    const fromParent = findParentNodeClosestToPos(
      this.$from,
      closestColumnOrRoot
    );
    const toParent = findParentNodeClosestToPos(this.$to, closestColumnOrRoot);

    if (!fromParent || !toParent) {
      return false;
    }

    this._$from = doc.resolve(fromParent.pos);
    this._$to = doc.resolve(toParent.pos + toParent.node.nodeSize);

    if (this.getFirstNode()?.type.name === ColumnBlock.name) {
      const offset = 2;
      this._$from = doc.resolve(this.$from.pos + offset);
      this._$to = doc.resolve(this.$to.pos + offset);
    }

    this.$anchor = this._$from;
    this.$head = this._$to;
    this.ranges = [new SelectionRange(this._$from, this._$to)];

    return true;
  }

  static create(doc, from, to) {
    return new ColumnSelection(
      new TextSelection(doc.resolve(from), doc.resolve(to))
    );
  }

  getFirstNode() {
    return this.content().content.firstChild;
  }
}

export const ColumnBlock = Node.create({
  name: "columnBlock",
  group: "block",
  content: "column{2,}",
  isolating: true,
  selectable: true,

  addOptions() {
    return {
      nestedColumns: false
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": this.name,
        class: "column-block"
      }),
      0
    ];
  },

  addCommands() {
    const canAcceptColumnBlockChild = (parent) => {
      if (!parent.contentMatch.matchType(this.type)) {
        return false;
      }

      return this.options.nestedColumns || parent.name !== Column.name;
    };

    return {
      unsetColumns:
        () =>
        ({ tr, dispatch }) => {
          const firstAncestor = findParentNodeClosestToPos(
            tr.selection.$from,
            ({ node }) => node.type === this.type
          );

          if (!firstAncestor) {
            return false;
          }

          if (!dispatch) {
            return true;
          }

          let nodes = [];
          firstAncestor.node.descendants((node, _, parent) => {
            if (parent?.type.name === Column.name && node.content.size > 0) {
              nodes.push(node);
            }
          });

          nodes = nodes.reverse();
          tr = tr.setSelection(
            new NodeSelection(tr.doc.resolve(firstAncestor.pos))
          );
          nodes.forEach((node) => {
            tr = tr.insert(firstAncestor.pos, node);
          });

          dispatch(tr.deleteSelection());
          return true;
        },

      setColumns:
        (count, keepContent = false) =>
        ({ tr, dispatch }) => {
          if (!Number.isInteger(count) || count < 2) {
            return false;
          }

          const { doc, selection } = tr;
          const columnSelection = new ColumnSelection(selection);

          if (!columnSelection.expandSelection(doc)) {
            return false;
          }

          const { openStart, openEnd } = columnSelection.content();
          if (openStart !== openEnd) {
            return false;
          }

          if (!canAcceptColumnBlockChild(columnSelection.$anchor.parent.type)) {
            return false;
          }

          if (!dispatch) {
            return true;
          }

          const content = keepContent
            ? [
                buildColumn(columnSelection.content().toJSON()),
                ...buildNColumns(count - 1)
              ]
            : buildNColumns(count);
          const columnBlock = buildColumnBlock({ content });
          const newNode = doc.type.schema.nodeFromJSON(columnBlock);

          if (!newNode) {
            return false;
          }

          tr = tr.setSelection(columnSelection);
          dispatch(tr.replaceSelectionWith(newNode, false));

          return true;
        }
    };
  }
});

export const ColumnsExtension = Extension.create({
  name: "columnsExtension",

  addOptions() {
    return {
      column: true,
      columnBlock: true
    };
  },

  addExtensions() {
    return [
      ...(this.options.column === false ? [] : [Column]),
      ...(this.options.columnBlock === false ? [] : [ColumnBlock])
    ];
  }
});

export default ColumnsExtension;
