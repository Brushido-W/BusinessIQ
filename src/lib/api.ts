import {
  AskResponse,
  DocumentDetail,
  DocumentRecord,
  Folder,
  KnowledgeLibrary,
  SystemStatus,
} from '../types/knowledge.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  getSystemStatus: () => request<SystemStatus>('/api/system/status'),

  resetDemo: () =>
    request<{ ok: boolean; libraries: KnowledgeLibrary[] }>('/api/system/reset-demo', {
      method: 'POST',
    }),

  listLibraries: () => request<{ libraries: KnowledgeLibrary[] }>('/api/libraries'),

  createLibrary: (payload: { name: string; description: string }) =>
    request<{ library: KnowledgeLibrary }>('/api/libraries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLibraryDetail: (libraryId: string) =>
    request<{ library: KnowledgeLibrary; folders: Folder[]; documents: DocumentRecord[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}`
    ),

  updateLibrary: (libraryId: string, payload: { name?: string; description?: string }) =>
    request<{ library: KnowledgeLibrary }>(`/api/libraries/${encodeURIComponent(libraryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLibrary: (libraryId: string) =>
    request<{ deleted: boolean }>(`/api/libraries/${encodeURIComponent(libraryId)}`, {
      method: 'DELETE',
    }),

  createFolder: (libraryId: string, name: string) =>
    request<{ folder: Folder }>(`/api/libraries/${encodeURIComponent(libraryId)}/folders`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameFolder: (folderId: string, name: string) =>
    request<{ folder: Folder }>(`/api/folders/${encodeURIComponent(folderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (folderId: string) =>
    request<{ deleted: boolean }>(`/api/folders/${encodeURIComponent(folderId)}`, {
      method: 'DELETE',
    }),

  uploadDocuments: (libraryId: string, files: File[], folderId: string | null) => {
    const formData = new FormData();
    if (folderId) {
      formData.append('folderId', folderId);
    }
    for (const file of files) {
      formData.append('files', file);
    }
    return request<{ documents: DocumentRecord[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/documents`,
      {
        method: 'POST',
        body: formData,
      }
    );
  },

  getDocument: (documentId: string) =>
    request<{ document: DocumentDetail }>(`/api/documents/${encodeURIComponent(documentId)}`),

  moveDocument: (documentId: string, folderId: string | null) =>
    request<{ document: DocumentRecord }>(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),

  reindexDocument: (documentId: string) =>
    request<{ status: string }>(`/api/documents/${encodeURIComponent(documentId)}/reindex`, {
      method: 'POST',
    }),

  deleteDocument: (documentId: string) =>
    request<{ deleted: boolean }>(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    }),

  askQuestion: (payload: {
    libraryId: string;
    question: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) =>
    request<AskResponse>('/api/chat/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
