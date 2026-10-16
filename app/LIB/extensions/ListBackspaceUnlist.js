import { Extension } from "@tiptap/core";

const LIST_ITEM_TYPE_NAMES = new Set(["listItem", "taskItem"]);

export function getActiveListItemInfo(selection) {
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const typeName = node.type.name;

    if (LIST_ITEM_TYPE_NAMES.has(typeName)) {
      return {
        depth,
        node,
        pos: $from.before(depth),
        typeName
      };
    }
  }

  return null;
}

export function isAtListItemMarkerStart(selection, activeListItem) {
  if (!selection.empty || selection.node || !activeListItem) {
    return false;
  }

  const { $from, $to } = selection;

  if ($from.pos !== $to.pos || $from.parentOffset !== 0) {
    return false;
  }

  if (!$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
    return false;
  }

  if ($from.depth !== activeListItem.depth + 1) {
    return false;
  }

  return $from.index(activeListItem.depth) === 0;
}

export function unlistOnMarkerBackspace(editor) {
  const { state, view } = editor;

  if (view?.composing) {
    return false;
  }

  const activeListItem = getActiveListItemInfo(state.selection);

  if (!isAtListItemMarkerStart(state.selection, activeListItem)) {
    return false;
  }

  if (editor.commands.undoInputRule()) {
    return true;
  }

  return editor.chain().liftListItem(activeListItem.typeName).run();
}

const ListBackspaceUnlist = Extension.create({
  name: "listBackspaceUnlist",
  priority: 350,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => unlistOnMarkerBackspace(editor)
    };
  }
});

export default ListBackspaceUnlist;
