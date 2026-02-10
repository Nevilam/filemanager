export type ItemType = "file" | "folder";

export interface UserDto {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  ok: boolean;
  token: string;
  expiresAt: number;
  user: UserDto;
}

export interface CloudItem {
  id: string;
  name: string;
  type: ItemType;
  parentId: string | null;
  size: number;
  shareCode: string | null;
  isPrivate: boolean;
}

export interface FolderInfo {
  id: string;
  name: string;
  parentId: string | null;
}

export interface PublicFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  shareCode: string;
  owner: string;
  createdAt: number;
}

export interface PublicItem {
  id: string;
  name: string;
  type: ItemType;
  size: number;
  mime: string;
  shareCode: string;
  owner: string;
  createdAt: number;
}

export interface ListItemsResponse {
  ok: boolean;
  items: CloudItem[];
  currentFolder: FolderInfo | null;
}

const TOKEN_STORAGE_KEY = "glasscloud_token";
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function requestJson<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: text };
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: string }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, errorMessage);
  }

  if (typeof data === "object" && data !== null && "ok" in data && (data as { ok: boolean }).ok === false) {
    const errorMessage = "error" in data ? String((data as { error: string }).error) : "Request failed";
    throw new ApiError(response.status, errorMessage);
  }

  return data as T;
}

async function downloadBlob(path: string, fallbackFileName: string, auth = true): Promise<void> {
  const headers = new Headers();
  if (auth) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(buildUrl(path), { headers });
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) {
        errorMessage = String(data.error);
      }
    } catch {
    }
    throw new ApiError(response.status, errorMessage);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fallbackFileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function registerUser(username: string, password: string, email: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    },
    false,
  );
}

export function loginUser(username: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
    false,
  );
}

export function fetchCurrentUser(): Promise<{ ok: boolean; user: UserDto }> {
  return requestJson<{ ok: boolean; user: UserDto }>("/api/auth/me", { method: "GET" });
}

export function logoutUser(): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function listMyItems(parentId: string | null): Promise<ListItemsResponse> {
  const search = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return requestJson<ListItemsResponse>(`/api/files${search}`, { method: "GET" });
}

export function createFolder(name: string, parentId: string | null): Promise<{ ok: boolean; item: CloudItem }> {
  return requestJson<{ ok: boolean; item: CloudItem }>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
}

export function uploadFile(file: File, parentId: string | null): Promise<{ ok: boolean; item: CloudItem }> {
  const formData = new FormData();
  formData.append("file", file);
  if (parentId) {
    formData.append("parentId", parentId);
  }
  return requestJson<{ ok: boolean; item: CloudItem }>("/api/files/upload", {
    method: "POST",
    body: formData,
  });
}

export function renameItem(itemId: string, name: string): Promise<{ ok: boolean; item: CloudItem }> {
  return requestJson<{ ok: boolean; item: CloudItem }>(`/api/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function updateItemPrivacy(itemId: string, isPrivate: boolean): Promise<{ ok: boolean; item: CloudItem }> {
  return requestJson<{ ok: boolean; item: CloudItem }>(`/api/items/${itemId}/privacy`, {
    method: "PATCH",
    body: JSON.stringify({ isPrivate }),
  });
}

export function deleteItem(itemId: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/api/items/${itemId}`, {
    method: "DELETE",
  });
}

export function shareItem(itemId: string): Promise<{ ok: boolean; shareCode: string; isPrivate: boolean; sharePath: string; shareUrl: string }> {
  return requestJson<{ ok: boolean; shareCode: string; isPrivate: boolean; sharePath: string; shareUrl: string }>(
    `/api/items/${itemId}/share`,
    {
      method: "POST",
    },
  );
}

export function downloadOwnItem(itemId: string, fileName: string): Promise<void> {
  return downloadBlob(`/api/items/${itemId}/download`, fileName, true);
}

export function getPublicFile(shareCode: string): Promise<{ ok: boolean; file: PublicFile }> {
  return requestJson<{ ok: boolean; file: PublicFile }>(`/api/public/${encodeURIComponent(shareCode)}`, { method: "GET" }, false);
}

export function downloadPublicFile(shareCode: string, fileName: string): Promise<void> {
  return downloadBlob(`/api/public/${encodeURIComponent(shareCode)}/download`, fileName, false);
}

export function getPublicItem(shareCode: string): Promise<{ ok: boolean; item: PublicItem }> {
  return requestJson<{ ok: boolean; item: PublicItem }>(`/api/public/${encodeURIComponent(shareCode)}`, { method: "GET" }, false);
}

export function listSharedItems(shareCode: string, parentId: string | null): Promise<ListItemsResponse> {
  const search = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return requestJson<ListItemsResponse>(`/api/public/${encodeURIComponent(shareCode)}/items${search}`, { method: "GET" });
}

export function downloadSharedItem(shareCode: string, itemId: string, fileName: string): Promise<void> {
  return downloadBlob(`/api/public/${encodeURIComponent(shareCode)}/items/${encodeURIComponent(itemId)}/download`, fileName, true);
}
