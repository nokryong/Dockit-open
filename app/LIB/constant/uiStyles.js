export const cx = (...classes) => classes.filter(Boolean).join(" ");

export const floatingSurfaceStyle = (isDarkMode, extra = {}) => ({
  background: isDarkMode
    ? "rgba(24, 24, 27, 0.94)"
    : "rgba(255, 255, 255, 0.96)",
  borderColor: isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)",
  backdropFilter: "blur(12px)",
  ...extra
});

export const docsWorkspaceStyles = {
  page: "mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-6",
  header: "flex w-full items-start justify-between gap-4",
  headerStack: "flex-col",
  headerPath: "flex items-center gap-2 flex-1 min-w-0",
  breadcrumb: "flex items-center gap-2",
  breadcrumbItem: "flex items-center gap-2",
  toolbar: "flex max-w-full flex-wrap items-center justify-end gap-2 shrink-0",
  section: "flex w-full flex-col gap-4",
  sectionHeader: "flex items-center justify-between gap-3",
  actionBar: "flex flex-wrap items-center gap-2",
  listRow:
    "flex items-center gap-3 justify-start w-full rounded-lg px-3 py-2 text-ellipsis whitespace-nowrap transition-all duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/40",
  listMeta:
    "flex items-center gap-2 w-full text-ellipsis whitespace-nowrap justify-end",
  gridItem: "w-full flex flex-col items-start gap-2 text-left",
  folderGridItem:
    "flex h-20 w-full items-center gap-4 rounded-lg border border-zinc-200/80 bg-white/80 px-4 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950/40",
  documentGridItem: "flex w-full flex-col items-start gap-2 p-[5px]",
  contentList: "flex flex-col gap-8 w-full",
  segmentedLabel: "flex items-center gap-1"
};

export const contextMenuStyles = {
  surface:
    "dockit-context-menu fixed z-50 min-w-56 rounded-2xl border p-2 shadow-lg backdrop-blur-md",
  mobileBackdrop:
    "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
  mobileSurface:
    "dockit-context-menu fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t px-5 pb-7 pt-3 shadow-lg transition-transform duration-300 transform translate-y-0",
  mobileHandle:
    "mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700",
  itemLabel: "flex min-w-0 items-center gap-3",
  itemIcon:
    "flex size-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  itemIconDanger:
    "flex size-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300",
  itemText: "flex min-w-0 flex-col gap-0.5 text-left",
  itemTitle: "truncate text-sm font-semibold leading-tight",
  itemDescription:
    "truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400",
  itemTitleDanger:
    "truncate text-sm font-semibold leading-tight text-red-600 dark:text-red-300"
};
