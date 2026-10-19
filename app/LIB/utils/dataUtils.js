import { localBridge } from "./localBridge";
export const createData = (type, parentId = null, data = {}) => localBridge().data("create", { type, parentId, data });
export const updateData = (type, id, data) => localBridge().data("update", { type, id, data });
export const fetchData = (type, id) => localBridge().data("get", { type, id });
export const fetchDocumentContent = async id => (await fetchData("documents", id)).content.content;
export const fetchDataList = (type, parentId = null, title = null, page = 1, limit = 10, sortBy = "updated_at", sortOrder = -1) =>
  localBridge().data("list", { type, parentId, title, sortBy, sortOrder });
export const deleteData = (type, id) => localBridge().data("delete", { type, id });
export const fetchDataTree = (parentId = null) => localBridge().data("tree", { parentId });
export const moveData = (type, id, parentId = null) => localBridge().data("move", { type, id, parentId });

