import { t as uiText, useI18n } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import Template from "./DrawerTemplate";
import { Div, Menu, toast, Typography } from "sud-ui";
import { useUser } from "@/app/LIB/context/UserContext";
import { useRouter } from "@/desktop/navigation";
import { useFolderTree } from "@/app/LIB/context/FolderTreeContext";
import { useSetting } from "@/app/LIB/context/SettingContext";
import { TbFile, TbFolder } from "react-icons/tb";
import {
  buildDocsDocumentUrl,
  getOpenDocumentTabs
} from "@/app/LIB/utils/openDocumentTabs";
import { requestDocumentNavigation } from "@/app/LIB/utils/documentNavigationGuard";

export default function TreeDrawer({ openTreeDrawer, setOpenTreeDrawer }) {
  useI18n();
  const { user, userLoading } = useUser();
  const router = useRouter();
  const { folderTree, fetchFolderTree } = useFolderTree();
  const { setting } = useSetting();

  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const lastFileClickRef = useRef({ id: null, timestamp: 0 });

  useEffect(() => {
    if (!openTreeDrawer) return;
    if (!user && !userLoading) {
      return;
    } else if (user) {
      fetchFolderTree();
    }
  }, [openTreeDrawer, user, userLoading, fetchFolderTree]);

  const filterFolders = (items) =>
    items.filter((item) => item.content_type === "folders");

  const filterFiles = (items) =>
    items.filter((item) => item.content_type === "documents");

  const formatTitle = (title) =>
    title.length > 10 ? title.slice(0, 10) + "..." : title;

  const openDocumentFromTree = (file) => {
    const openTabs = getOpenDocumentTabs();
    const existingTab = openTabs.find((tab) => tab.id === file._id);
    const targetTab = existingTab || {
      id: file._id,
      title: file.title,
      parentId: file.parent_id ?? null
    };
    const destination = buildDocsDocumentUrl(targetTab);

    if (!requestDocumentNavigation(destination)) return;

    if (existingTab) {
      toast.info(uiText("이미 열린탭입니다."));
    }

    router.push(destination);
    setOpenTreeDrawer(false);
  };

  const handleFileClick = (file) => {
    const now = Date.now();
    const isSameFile = lastFileClickRef.current.id === file._id;
    const isDoubleClick =
      isSameFile && now - lastFileClickRef.current.timestamp < 300;

    setSelectedFolderId(file._id);
    lastFileClickRef.current = {
      id: file._id,
      timestamp: now
    };

    if (!isDoubleClick) return;

    openDocumentFromTree(file);
    lastFileClickRef.current = { id: null, timestamp: 0 };
  };

  const buildMenuItems = (items) => {
    const folders = filterFolders(items);
    const files = filterFiles(items);

    const folderItems = folders.map((folder) => {
      const childFolders = folder.children
        ? filterFolders(folder.children)
        : [];
      const childFiles = folder.children ? filterFiles(folder.children) : [];
      const childCount = childFolders.length + childFiles.length;

      return {
        key: folder._id,
        label: (
          <div className="flex items-center gap-2">
            <Div className={"hover-scale-6"} color={`apricot`}>
              <TbFolder size={25} />
            </Div>
            <Typography pretendard="SB" size="sm" color="white-1">
              {formatTitle(folder.title)}
            </Typography>
            {childCount > 0 && (
              <Typography size="xs" color="cool-gray">
                ({childCount})
              </Typography>
            )}
          </div>
        ),
        onClick: () => { setSelectedFolderId(folder._id); if (!folder.childrenLoaded) fetchFolderTree(folder._id); },
        ...(!folder.childrenLoaded
          ? { children: [{ key: `load-${folder._id}`, label: uiText("불러오는 중…") }] }
          : folder.children && folder.children.length > 0
          ? { children: buildMenuItems(folder.children) }
          : {})
      };
    });

    const fileItems = files.map((file) => ({
      key: file._id,
      onClick: () => handleFileClick(file),
      label: (
        <div className="flex items-center gap-2">
          <Div className={"hover-scale-6"} color={`${setting.theme}-7`}>
            <TbFile size={25} />
          </Div>
          <Typography pretendard="SB" size="sm" color="white-1">
            {formatTitle(file.title)}
          </Typography>
        </div>
      )
    }));

    return [...folderItems, ...fileItems];
  };

  const menuItems = [
    {
      key: "home",
      label: (
        <Typography pretendard="SB" color="white-1">
          {uiText("홈")}</Typography>
      ),
      onClick: () => setSelectedFolderId(null)
    },
    ...buildMenuItems(folderTree || [])
  ];

  return (
    <Template
      title={uiText("폴더")}
      open={openTreeDrawer}
      onClose={() => setOpenTreeDrawer(false)}
      content={
        <Menu
          items={menuItems}
          selectedKey={selectedFolderId === null ? "home" : selectedFolderId}
        />
      }
    />
  );
}
