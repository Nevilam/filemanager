import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Download,
  File,
  Folder,
  FolderOpen,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import {
  ApiError,
  createFolder,
  deleteItem,
  downloadOwnItem,
  downloadPublicFile,
  downloadSharedItem,
  getPublicItem,
  listMyItems,
  listSharedItems,
  renameItem,
  shareItem,
  updateItemPrivacy,
  uploadFile,
  type CloudItem,
  type FolderInfo,
  type PublicItem,
} from "../lib/api";

interface FileManagerProps {
  userName: string;
  onLogout: () => void;
  sharedCode?: string;
  shareOnly?: boolean;
  sharedRootItem?: PublicItem | null;
  onUserNameClick?: () => void;
}

export function FileManager({
  userName,
  onLogout,
  sharedCode,
  shareOnly = false,
  sharedRootItem = null,
  onUserNameClick,
}: FileManagerProps) {
  const [items, setItems] = useState<CloudItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderInfo | null>(null);
  const [folderPrivacyById, setFolderPrivacyById] = useState<Record<string, boolean>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sharedRoots, setSharedRoots] = useState<PublicItem[]>([]);
  const [activeSharedCode, setActiveSharedCode] = useState<string | null>(null);
  const [activeSharedRoot, setActiveSharedRoot] = useState<PublicItem | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const isSharedMode = activeSharedCode !== null;
  const isSharedShortcut = useCallback((item: CloudItem) => item.id.startsWith("shared:"), []);
  const isPublicShareFile = useCallback((item: CloudItem) => item.id.startsWith("public:"), []);

  const shareRootEntries = useMemo(() => {
    if (!shareOnly || !sharedRootItem) {
      return [];
    }
    if (sharedRootItem.type === "folder") {
      return [
        {
          id: `shared:${sharedRootItem.shareCode}`,
          name: sharedRootItem.name,
          type: "folder" as const,
          parentId: null,
          size: sharedRootItem.size,
          shareCode: sharedRootItem.shareCode,
          isPrivate: false,
        },
      ];
    }
    return [
      {
        id: `public:${sharedRootItem.shareCode}`,
        name: sharedRootItem.name,
        type: "file" as const,
        parentId: null,
        size: sharedRootItem.size,
        shareCode: sharedRootItem.shareCode,
        isPrivate: false,
      },
    ];
  }, [shareOnly, sharedRootItem]);

  const displayItems = useMemo(() => {
    if (shareOnly) {
      return isSharedMode ? items : shareRootEntries;
    }
    if (isSharedMode || currentFolderId) {
      return items;
    }
    if (sharedRoots.length === 0) {
      return items;
    }
    const sharedEntries: CloudItem[] = sharedRoots.map((root) => {
      if (root.type === "file") {
        return {
          id: `public:${root.shareCode}`,
          name: root.name,
          type: "file",
          parentId: null,
          size: root.size,
          shareCode: root.shareCode,
          isPrivate: false,
        };
      }
      return {
        id: `shared:${root.shareCode}`,
        name: root.name,
        type: "folder",
        parentId: null,
        size: 0,
        shareCode: root.shareCode,
        isPrivate: false,
      };
    });
    return [...sharedEntries, ...items];
  }, [currentFolderId, isSharedMode, items, shareOnly, shareRootEntries, sharedRoots]);

  const selectedItem = useMemo(
    () => displayItems.find((item) => item.id === selectedItemId) ?? null,
    [displayItems, selectedItemId],
  );
  const isSelectedSharedShortcut = selectedItem ? isSharedShortcut(selectedItem) : false;
  const isSelectedPublicFile = selectedItem ? isPublicShareFile(selectedItem) : false;
  const currentFolderIsPrivate = useMemo(() => {
    if (isSharedMode || !currentFolderId) {
      return false;
    }
    return folderPrivacyById[currentFolderId] ?? false;
  }, [currentFolderId, folderPrivacyById, isSharedMode]);
  const bulkDownloadTarget = useMemo<{
    id: string;
    name: string;
    type: "file" | "folder";
  } | null>(() => {
    if (!isSharedMode && !shareOnly) {
      return null;
    }
    if (isSharedMode) {
      if (currentFolder) {
        return {
          id: currentFolder.id,
          name: currentFolder.name,
          type: "folder",
        };
      }
      if (activeSharedRoot) {
        return {
          id: activeSharedRoot.id,
          name: activeSharedRoot.name,
          type: "folder",
        };
      }
    }
    if (shareOnly && sharedRootItem) {
      return {
        id: sharedRootItem.id,
        name: sharedRootItem.name,
        type: sharedRootItem.type,
      };
    }
    return null;
  }, [activeSharedRoot, currentFolder, isSharedMode, shareOnly, sharedRootItem]);
  const canBulkDownload = !!bulkDownloadTarget;
  const rootLabel = useMemo(() => {
    if (isSharedMode && activeSharedRoot?.owner) {
      return activeSharedRoot.owner;
    }
    if (shareOnly && sharedRootItem?.owner) {
      return sharedRootItem.owner;
    }
    return "Корневая папка";
  }, [activeSharedRoot, isSharedMode, shareOnly, sharedRootItem]);

  const handleUserNameClick = () => {
    setActiveSharedCode(null);
    setActiveSharedRoot(null);
    setCurrentFolderId(null);
    setCurrentFolder(null);
    setSelectedItemId(null);
    setEditingItemId(null);
    setEditingName("");
    setShareNotice("");
    setError("");
    onUserNameClick?.();
  };

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ошибка сети. Попробуйте снова");
      }
    },
    [onLogout],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isSharedMode && activeSharedCode) {
        const response = await listSharedItems(activeSharedCode, currentFolderId);
        setItems(response.items);
        if (!currentFolderId && activeSharedRoot) {
          setCurrentFolder({ id: activeSharedRoot.id, name: activeSharedRoot.name, parentId: null });
        } else {
          setCurrentFolder(response.currentFolder);
        }
        setFolderPrivacyById((prev) => {
          const next = { ...prev };
          for (const item of response.items) {
            if (item.type === "folder") {
              next[item.id] = item.isPrivate;
            }
          }
          return next;
        });
      } else if (shareOnly) {
        setItems([]);
        setCurrentFolder(null);
        setFolderPrivacyById({});
      } else {
        const response = await listMyItems(currentFolderId);
        setItems(response.items);
        setCurrentFolder(response.currentFolder);
        setFolderPrivacyById((prev) => {
          const next = { ...prev };
          for (const item of response.items) {
            if (item.type === "folder") {
              next[item.id] = item.isPrivate;
            }
          }
          return next;
        });
      }
      setSelectedItemId(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [activeSharedCode, activeSharedRoot, currentFolderId, handleApiError, isSharedMode, shareOnly]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!shareOnly || !sharedRootItem || sharedRootItem.type !== "folder") {
      return;
    }

    setSharedRoots((prev) => {
      if (prev.some((item) => item.shareCode === sharedRootItem.shareCode)) {
        return prev;
      }
      return [...prev, sharedRootItem];
    });
  }, [shareOnly, sharedRootItem]);

  useEffect(() => {
    if (!sharedCode) {
      return;
    }

    const run = async () => {
      try {
        const response = await getPublicItem(sharedCode);
        setSharedRoots((prev) => {
          if (prev.some((item) => item.shareCode === response.item.shareCode)) {
            return prev;
          }
          return [...prev, response.item];
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Ошибка сети. Попробуйте снова");
        }
      }
    };

    void run();
  }, [sharedCode]);

  const handleAddFolder = async () => {
    if (isSharedMode || shareOnly) {
      return;
    }

    try {
      setError("");
      const response = await createFolder("Новая папка", currentFolderId);
      setItems((prev) => [...prev, response.item]);
      setFolderPrivacyById((prev) => ({ ...prev, [response.item.id]: response.item.isPrivate }));
      setEditingItemId(response.item.id);
      setEditingName(response.item.name);
      setShowAddModal(false);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (isSharedMode || shareOnly) {
      return;
    }

    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setError("");
      const response = await uploadFile(file, currentFolderId);
      setItems((prev) => [...prev, response.item]);
      setShowAddModal(false);
      setSelectedItemId(response.item.id);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleRename = async (itemId: string) => {
    if (isSharedMode || shareOnly || itemId.startsWith("shared:") || itemId.startsWith("public:")) {
      return;
    }

    const name = editingName.trim() || "Новая папка";
    try {
      await renameItem(itemId, name);
      setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, name } : item)));
      setEditingItemId(null);
      setEditingName("");
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleItemClick = (item: CloudItem) => {
    setShareNotice("");
    setSelectedItemId((prev) => (prev === item.id ? null : item.id));
  };

  const handleItemDoubleClick = (item: CloudItem) => {
    if (isSharedShortcut(item)) {
      const shareCodeFromItem = item.shareCode;
      const root = sharedRoots.find((rootItem) => rootItem.shareCode === shareCodeFromItem) ?? null;
      if (shareCodeFromItem && root) {
        setActiveSharedCode(shareCodeFromItem);
        setActiveSharedRoot(root);
        setCurrentFolderId(null);
        setSelectedItemId(null);
        setEditingItemId(null);
        setShareNotice("");
      }
      return;
    }

    if (item.type === "folder") {
      setCurrentFolderId(item.id);
      setFolderPrivacyById((prev) =>
        prev[item.id] === item.isPrivate ? prev : { ...prev, [item.id]: item.isPrivate },
      );
      setSelectedItemId(null);
      setEditingItemId(null);
      setShareNotice("");
    }
  };

  const handleBack = () => {
    if (isSharedMode) {
      if (!currentFolderId) {
        setActiveSharedCode(null);
        setActiveSharedRoot(null);
        setCurrentFolderId(null);
        setCurrentFolder(null);
        setSelectedItemId(null);
        setEditingItemId(null);
        setShareNotice("");
        return;
      }
      setCurrentFolderId(currentFolder?.parentId ?? null);
      setSelectedItemId(null);
      setEditingItemId(null);
      setShareNotice("");
      return;
    }

    if (!currentFolder) {
      return;
    }
    setCurrentFolderId(currentFolder.parentId);
    setSelectedItemId(null);
    setEditingItemId(null);
    setShareNotice("");
  };

  const handleDownload = async () => {
    if (!selectedItem) {
      return;
    }

    try {
      if (isSelectedPublicFile) {
        if (selectedItem.shareCode) {
          await downloadPublicFile(selectedItem.shareCode, selectedItem.name);
        }
        return;
      }
      if (isSelectedSharedShortcut) {
        return;
      }
      const fileName = selectedItem.type === "folder" ? `${selectedItem.name}.zip` : selectedItem.name;
      if (isSharedMode && activeSharedCode) {
        await downloadSharedItem(activeSharedCode, selectedItem.id, fileName);
      } else {
        await downloadOwnItem(selectedItem.id, fileName);
      }
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleBulkDownload = async () => {
    if (!bulkDownloadTarget) {
      return;
    }

    try {
      if (shareOnly && sharedRootItem && sharedRootItem.type === "file" && !isSharedMode) {
        await downloadPublicFile(sharedRootItem.shareCode, sharedRootItem.name);
        return;
      }

      const shareCode = activeSharedCode ?? sharedRootItem?.shareCode ?? null;
      if (!shareCode) {
        return;
      }

      const fileName =
        bulkDownloadTarget.type === "folder"
          ? `${bulkDownloadTarget.name}.zip`
          : bulkDownloadTarget.name;
      await downloadSharedItem(shareCode, bulkDownloadTarget.id, fileName);
    } catch (err) {
      handleApiError(err);
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back to a legacy copy approach below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
    }
    return copied;
  };

  const handleShare = async () => {
    if (!selectedItem || isSharedMode || isSelectedSharedShortcut || isSelectedPublicFile || shareOnly) {
      return;
    }

    if (currentFolderId && currentFolderIsPrivate) {
      setShareNotice("вы находитесь в приватной папке, невозможно поделиться");
      return;
    }

    try {
      const response = await shareItem(selectedItem.id);
      const shareUrl = `${window.location.origin}${response.sharePath}`;
      const copied = await copyToClipboard(shareUrl);
      setShareNotice(copied ? "Ссылка скопирована" : "Не удалось скопировать ссылку");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        if (currentFolderId && currentFolderIsPrivate) {
          setShareNotice("вы находитесь в приватной папке, невозможно поделиться");
          return;
        }
        const notice =
          selectedItem.type === "folder"
            ? "Вы пытаетесь поделиться приватной папкой"
            : "Вы пытаетесь поделиться приватным файлом";
        setShareNotice(notice);
        return;
      }
      handleApiError(err);
    }
  };

  const handlePrivacyToggle = async () => {
    if (
      !selectedItem ||
      isUpdatingPrivacy ||
      isSharedMode ||
      isSelectedSharedShortcut ||
      isSelectedPublicFile ||
      shareOnly
    ) {
      return;
    }

    try {
      setIsUpdatingPrivacy(true);
      const nextValue = !selectedItem.isPrivate;
      const response = await updateItemPrivacy(selectedItem.id, nextValue);
      setItems((prev) => prev.map((item) => (item.id === selectedItem.id ? response.item : item)));
      if (response.item.type === "folder") {
        setFolderPrivacyById((prev) => ({ ...prev, [response.item.id]: response.item.isPrivate }));
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem || isSharedMode || isSelectedSharedShortcut || isSelectedPublicFile || shareOnly) {
      return;
    }

    try {
      await deleteItem(selectedItem.id);
      setShowDeleteConfirm(false);
      setSelectedItemId(null);
      setEditingItemId(null);
      if (selectedItem.type === "folder") {
        setFolderPrivacyById((prev) => {
          const next = { ...prev };
          delete next[selectedItem.id];
          return next;
        });
      }
      await loadItems();
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedItemId(null);
    }
  };

  const renderItemName = (item: CloudItem) => {
    if (editingItemId !== item.id) {
      return <span className="text-white">{item.name}</span>;
    }

    return (
      <input
        type="text"
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onBlur={() => void handleRename(item.id)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            void handleRename(item.id);
          }
          if (e.key === "Escape") {
            setEditingItemId(null);
            setEditingName("");
          }
        }}
        autoFocus
        className="bg-white/20 text-white px-2 py-1 rounded outline-none border border-white/40"
      />
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden px-8 py-6">
      <div className="w-full relative z-10">
        <div className="flex items-center justify-between mb-12 px-4">
          <h1 className="[font-family:'Aquire-Light',Helvetica] font-light text-white text-2xl md:text-3xl tracking-[0] leading-[normal]">
            GlassCloud
          </h1>
          {onUserNameClick ? (
            <button
              type="button"
              onClick={handleUserNameClick}
              className="absolute left-1/2 -translate-x-1/2 w-[420px] h-[52px] bg-transparent border border-white/40 hover:bg-white/5 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal] flex items-center justify-center"
            >
              {userName}
            </button>
          ) : (
            <div className="absolute left-1/2 -translate-x-1/2 w-[420px] h-[52px] bg-transparent border border-white/40 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal] flex items-center justify-center">
              {userName}
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-[140px] h-[52px] bg-transparent border border-white/40 hover:bg-white/5 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal]"
          >
            Выйти
          </button>
        </div>

        <div
          className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-10 shadow-2xl"
          onClick={handleClickOutside}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {(isSharedMode || currentFolder) && (
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
              )}
              <h2 className="text-2xl text-white font-light flex items-center gap-2">
                {currentFolder ? (
                  <>
                    <FolderOpen className="w-6 h-6" />
                    {currentFolder.name}
                  </>
                ) : (
                  rootLabel
                )}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {selectedItem &&
                !isSharedMode &&
                !isSelectedSharedShortcut &&
                !isSelectedPublicFile &&
                !shareOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePrivacyToggle();
                  }}
                  disabled={isUpdatingPrivacy}
                  className="flex items-center gap-2 text-white text-sm"
                  title="Доступ к файлу"
                >
                  <span>Private</span>
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      selectedItem.isPrivate ? "bg-violet-500" : "bg-emerald-500"
                    } ${isUpdatingPrivacy ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        selectedItem.isPrivate ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </span>
                </button>
              )}
              {!isSharedMode && !shareOnly && (
                <button
                  ref={addButtonRef}
                  onClick={() => setShowAddModal(true)}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/30"
                >
                  <Plus className="w-6 h-6 text-white" />
                </button>
              )}
              {(isSharedMode || shareOnly) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleBulkDownload();
                  }}
                  disabled={!canBulkDownload}
                  className={`p-3 rounded-full transition-all border border-white/30 ${
                    canBulkDownload ? "bg-white/10 hover:bg-white/20" : "bg-white/5 opacity-50 cursor-not-allowed"
                  }`}
                  title="Скачать"
                >
                  <Download className="w-6 h-6 text-white" />
                </button>
              )}
            </div>
          </div>

          {shareNotice && <div className="mb-4 text-sm text-amber-200">{shareNotice}</div>}

          {error && <div className="text-sm text-red-200 mb-4">{error}</div>}

          <div className="max-h-[500px] overflow-y-auto pr-3 space-y-3">
            {loading ? (
              <div className="text-white/70 text-center py-8">Загрузка...</div>
            ) : displayItems.length === 0 ? (
              <div className="text-white/60 text-center py-8">Папка пуста</div>
            ) : (
              displayItems.map((item) => {
                const sharedShortcut = isSharedShortcut(item);
                const publicShareFile = isPublicShareFile(item);
                const readOnlyItem = sharedShortcut || publicShareFile || shareOnly;
                const allowShare = !isSharedMode && !readOnlyItem;
                const allowDelete = !isSharedMode && !readOnlyItem;
                const allowDownload = !sharedShortcut;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                      selectedItem?.id === item.id
                        ? "bg-white/20 border border-white/40"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {item.type === "folder" ? (
                        <Folder className="w-5 h-5 text-yellow-300" />
                      ) : (
                        <File className="w-5 h-5 text-blue-300" />
                      )}
                      {renderItemName(item)}
                    </div>

                    {selectedItem?.id === item.id && (
                      <div className="flex items-center gap-2">
                        {allowDownload && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDownload();
                            }}
                            className="p-2 hover:bg-white/20 rounded-lg transition-all"
                            title="Скачать"
                          >
                            <Download className="w-5 h-5 text-white" />
                          </button>
                        )}
                        {allowShare && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleShare();
                            }}
                            className="p-2 hover:bg-white/20 rounded-lg transition-all"
                            title="Скопировать ссылку"
                          >
                            <Share2 className="w-5 h-5 text-white" />
                          </button>
                        )}
                        {allowDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(true);
                            }}
                            className="p-2 hover:bg-white/20 rounded-lg transition-all"
                            title="Удалить"
                          >
                            <Trash2 className="w-5 h-5 text-red-300" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showAddModal && !isSharedMode && !shareOnly && (
        <div className="fixed inset-0 z-50" onClick={() => setShowAddModal(false)}>
          <div
            className="fixed bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4 w-48 shadow-2xl"
            style={{
              top: addButtonRef.current
                ? addButtonRef.current.getBoundingClientRect().bottom + 10
                : "auto",
              right: addButtonRef.current
                ? window.innerWidth - addButtonRef.current.getBoundingClientRect().right + 10
                : "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleAddFolder();
                }}
                className="w-full p-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all border border-white/20 flex items-center gap-2 text-sm"
              >
                <Folder className="w-4 h-4" />
                Папку
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                  setShowAddModal(false);
                }}
                className="w-full p-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all border border-white/20 flex items-center gap-2 text-sm"
              >
                <File className="w-4 h-4" />
                Файл
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl text-white mb-4 font-light">Подтверждение</h3>
            <p className="text-white/80 mb-6">
              Удалить {selectedItem?.type === "folder" ? "папку" : "файл"} "
              {selectedItem?.name}"?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => void handleDelete()}
                className="flex-1 p-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-white transition-all border border-red-500/40"
              >
                Да
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all border border-white/20"
              >
                Нет
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        onChange={(e) => void handleFileSelect(e)}
        className="hidden"
      />
    </div>
  );
}
