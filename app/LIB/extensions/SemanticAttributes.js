import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  SEMANTIC_ATTRIBUTE_TYPES,
  SEMANTIC_ATTRIBUTE_TYPE_SET as SUPPORTED_TYPES,
  validateSemanticAttributes,
  validateSemanticKey,
  validateSemanticRole,
  validateSemanticTags
} from "../utils/semanticAttributes";
import { validateDockitDesignPreset } from "../utils/dockitDesignPresetUtils";
import { transformSemanticTransferSlice } from "../utils/semanticCopyUtils";

export { SEMANTIC_ATTRIBUTE_TYPES, validateSemanticAttributes, validateSemanticKey, validateSemanticRole, validateSemanticTags };
const SYNC_META = "dockitSemanticAttributesSync";

const semanticAttributeConfig = {
  semanticKey: {
    default: null,
    parseHTML: (element) => {
      const result = validateSemanticKey(element.getAttribute("data-dockit-semantic-key"));
      return result.valid ? result.value : null;
    },
    renderHTML: (attributes) => {
      const result = validateSemanticKey(attributes.semanticKey);
      return result.valid ? { "data-dockit-semantic-key": result.value } : {};
    }
  },
  semanticRole: {
    default: null,
    parseHTML: (element) => {
      const result = validateSemanticRole(element.getAttribute("data-dockit-semantic-role"));
      return result.valid ? result.value : null;
    },
    renderHTML: (attributes) => {
      const result = validateSemanticRole(attributes.semanticRole);
      return result.valid ? { "data-dockit-semantic-role": result.value } : {};
    }
  },
  semanticTags: {
    default: [],
    parseHTML: (element) => {
      const raw = element.getAttribute("data-dockit-semantic-tags");
      if (raw === null) return [];
      try {
        const result = validateSemanticTags(JSON.parse(raw));
        return result.valid ? result.value : [];
      } catch {
        return [];
      }
    },
    renderHTML: (attributes) => {
      const result = validateSemanticTags(attributes.semanticTags);
      return result.valid && result.value.length
        ? { "data-dockit-semantic-tags": JSON.stringify(result.value) }
        : {};
    }
  },
  designPreset: {
    default: null,
    parseHTML: (element) => {
      const result = validateDockitDesignPreset(
        element.getAttribute("data-dockit-design")
      );
      return result.valid ? result.value : null;
    },
    renderHTML: (attributes) => {
      const result = validateDockitDesignPreset(attributes.designPreset);
      return result.valid && result.value
        ? { "data-dockit-design": result.value }
        : {};
    }
  }
};

export const buildSemanticAttributesNormalizationTransaction = (state) => {
  if (!state?.doc) return null;
  const usedKeys = new Set();
  const tr = state.tr;
  let modified = false;
  state.doc.descendants((node, pos) => {
    if (!SUPPORTED_TYPES.has(node.type.name)) return true;
    const normalized = validateSemanticAttributes(node.attrs);
    const next = { ...normalized.value };
    if (next.semanticKey && usedKeys.has(next.semanticKey)) next.semanticKey = null;
    if (next.semanticKey) usedKeys.add(next.semanticKey);
    if (
      node.attrs.semanticKey !== next.semanticKey ||
      node.attrs.semanticRole !== next.semanticRole ||
      JSON.stringify(node.attrs.semanticTags) !== JSON.stringify(next.semanticTags)
    ) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
      modified = true;
    }
    return true;
  });
  if (!modified) return null;
  tr.setMeta(SYNC_META, true);
  tr.setMeta("addToHistory", false);
  return tr;
};

const hasDuplicateKeyElsewhere = (doc, position, key) => {
  if (!key) return false;
  let duplicate = false;
  doc.descendants((node, pos) => {
    const existing = validateSemanticKey(node.attrs.semanticKey);
    if (
      pos !== position &&
      SUPPORTED_TYPES.has(node.type.name) &&
      existing.valid &&
      existing.value === key
    ) {
      duplicate = true;
      return false;
    }
    return !duplicate;
  });
  return duplicate;
};

export const SemanticAttributes = Extension.create({
  name: "semanticAttributes",
  addGlobalAttributes() {
    return [{ types: SEMANTIC_ATTRIBUTE_TYPES, attributes: semanticAttributeConfig }];
  },
  addCommands() {
    return {
      setSemanticAttributes:
        (pos, attributes = {}) =>
        ({ state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || !SUPPORTED_TYPES.has(node.type.name)) return false;
          const candidate = {
            semanticKey: Object.hasOwn(attributes, "semanticKey") ? attributes.semanticKey : node.attrs.semanticKey,
            semanticRole: Object.hasOwn(attributes, "semanticRole") ? attributes.semanticRole : node.attrs.semanticRole,
            semanticTags: Object.hasOwn(attributes, "semanticTags") ? attributes.semanticTags : node.attrs.semanticTags
          };
          const validation = validateSemanticAttributes(candidate);
          if (!validation.valid || hasDuplicateKeyElsewhere(state.doc, pos, validation.value.semanticKey)) return false;
          if (dispatch) {
            dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...validation.value }));
          }
          return true;
        }
    };
  },
  onCreate() {
    const transaction = buildSemanticAttributesNormalizationTransaction(this.editor.state);
    if (transaction) this.editor.view.dispatch(transaction);
  },
  addProseMirrorPlugins() {
    let pendingInternalDropMove = null;
    return [new Plugin({
      key: new PluginKey("dockitSemanticAttributes"),
      props: {
        handleDOMEvents: {
          drop(view, event) {
            if (!view.dragging) return false;
            const customMove = view.someProp(
              "dragCopies",
              (copies) => !copies(event)
            );
            const isMac =
              typeof navigator !== "undefined" &&
              /Mac|iP(?:ad|hone|od)/u.test(navigator.platform);
            pendingInternalDropMove =
              customMove ?? !(isMac ? event.altKey : event.ctrlKey);
            queueMicrotask(() => {
              pendingInternalDropMove = null;
            });
            return false;
          }
        },
        transformPasted(slice, view) {
          return transformSemanticTransferSlice(slice, view, {
            isMove: pendingInternalDropMove ?? view?.dragging?.move
          });
        }
      },
      appendTransaction(transactions, _oldState, newState) {
        if (transactions.every((transaction) => transaction.getMeta(SYNC_META))) return null;
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        return buildSemanticAttributesNormalizationTransaction(newState);
      }
    })];
  }
});

export default SemanticAttributes;
