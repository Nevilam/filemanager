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
  clearAuthToken,
  createFolder,
  deleteItem,
  downloadOwnFile,
  listMyItems,
  renameItem,
  shareItem,
  updateItemPrivacy,
  uploadFile,
  type CloudItem,
  type FolderInfo,
} from "../lib/api";

interface FileManagerProps {
  userName: string;
  onLogout: () => void;
}

export function FileManager({ userName, onLogout }: FileManagerProps) {
  const [items, setItems] = useState<CloudItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderInfo | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const selectedFile = useMemo(
    () => (selectedItem?.type === "file" ? selectedItem : null),
    [selectedItem],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        clearAuthToken();
        onLogout();
        return;
      }
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
      const response = await listMyItems(currentFolderId);
      setItems(response.items);
      setCurrentFolder(response.currentFolder);
      setSelectedItemId(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, handleApiError]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleAddFolder = async () => {
    try {
      setError("");
      const response = await createFolder("Новая папка", currentFolderId);
      setItems((prev) => [...prev, response.item]);
      setEditingItemId(response.item.id);
      setEditingName(response.item.name);
      setShowAddModal(false);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
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
    setSelectedItemId((prev) => (prev === item.id ? null : item.id));
  };

  const handleItemDoubleClick = (item: CloudItem) => {
    if (item.type === "folder") {
      setCurrentFolderId(item.id);
      setSelectedItemId(null);
      setEditingItemId(null);
    }
  };

  const handleBack = () => {
    if (!currentFolder) {
      return;
    }
    setCurrentFolderId(currentFolder.parentId);
    setSelectedItemId(null);
    setEditingItemId(null);
  };

  const handleDownload = async () => {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.type === "folder") {
      alert("Скачивание папок пока не поддерживается");
      return;
    }

    try {
      await downloadOwnFile(selectedItem.id, selectedItem.name);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleShare = async () => {
    if (!selectedFile) {
      return;
    }

    try {
      const response = await shareItem(selectedFile.id);
      await navigator.clipboard.writeText(response.shareUrl);
      if (response.isPrivate) {
        alert(`Ссылка скопирована (${response.shareCode}), но файл Private и недоступен публично.`);
      } else {
        alert(`Ссылка скопирована: ${response.shareUrl}`);
      }
    } catch (err) {
      handleApiError(err);
    }
  };

  const handlePrivacyToggle = async () => {
    if (!selectedFile || isUpdatingPrivacy) {
      return;
    }

    try {
      setIsUpdatingPrivacy(true);
      const nextValue = !selectedFile.isPrivate;
      const response = await updateItemPrivacy(selectedFile.id, nextValue);
      setItems((prev) => prev.map((item) => (item.id === selectedFile.id ? response.item : item)));
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) {
      return;
    }

    try {
      await deleteItem(selectedItem.id);
      setShowDeleteConfirm(false);
      setSelectedItemId(null);
      setEditingItemId(null);
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
      return (
        <div className="flex items-center gap-2">
          <span className="text-white">{item.name}</span>
          {item.type === "file" && item.shareCode && (
            <span className="text-[10px] text-white/70">#{item.shareCode}</span>
          )}
        </div>
      );
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
          <div className="absolute left-1/2 -translate-x-1/2 w-[420px] h-[52px] bg-transparent border border-white/40 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal] flex items-center justify-center">
            {userName}
          </div>
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
              {currentFolder && (
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
                  "Корневая папка"
                )}
              </h2>
            </div>
            <button
              ref={addButtonRef}
              onClick={() => setShowAddModal(true)}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/30"
            >
              <Plus className="w-6 h-6 text-white" />
            </button>
          </div>

          {selectedFile && (
            <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/15 flex items-center justify-between gap-4">
              <div className="text-white/80 text-sm">
                Код файла: <span className="text-white font-semibold">{selectedFile.shareCode}</span>
              </div>
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
                    selectedFile.isPrivate ? "bg-violet-500" : "bg-emerald-500"
                  } ${isUpdatingPrivacy ? "opacity-60" : ""}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      selectedFile.isPrivate ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-200 mb-4">{error}</div>}

          <div className="max-h-[500px] overflow-y-auto pr-3 space-y-3">
            {loading ? (
              <div className="text-white/70 text-center py-8">Загрузка...</div>
            ) : items.length === 0 ? (
              <div className="text-white/60 text-center py-8">Папка пуста</div>
            ) : (
              items.map((item) => (
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
                      {item.type === "file" && (
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
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
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
