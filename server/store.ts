import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DocumentChunk,
  DocumentDetail,
  DocumentFileType,
  DocumentPage,
  DocumentRecord,
  DocumentStatus,
  Folder,
  KnowledgeLibrary,
} from '../src/types/knowledge.ts';
import { createInitialSeedState, DatabaseState } from './seed.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'knowledgebase.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let cachedState: DatabaseState | null = null;

function persistState(state: DatabaseState) {
  ensureDirectories();
  const tmpFile = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function loadState(): DatabaseState {
  if (cachedState) return cachedState;
  ensureDirectories();

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.libraries) && Array.isArray(parsed.documents)) {
        cachedState = parsed;
        return cachedState;
      }
    } catch (err) {
      console.error('Failed to read persisted store; re-initializing seed state:', err);
    }
  }

  cachedState = createInitialSeedState();
  persistState(cachedState);
  return cachedState;
}

export function saveState() {
  if (cachedState) {
    persistState(cachedState);
  }
}

export function resetToSeedState(): DatabaseState {
  // Clean uploaded files safely
  if (fs.existsSync(UPLOADS_DIR)) {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  }
  ensureDirectories();
  cachedState = createInitialSeedState();
  persistState(cachedState);
  return cachedState;
}

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[\u0000-\u001f\u007f]/g, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s()]/g, '_').trim();
  return cleaned.slice(0, 180) || 'document.txt';
}

export function resolveSafeUploadPath(libraryId: string, storageFilename: string): string {
  const libDir = path.resolve(UPLOADS_DIR, libraryId);
  if (!libDir.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid library storage path.');
  }
  fs.mkdirSync(libDir, { recursive: true });
  const target = path.resolve(libDir, storageFilename);
  if (!target.startsWith(libDir + path.sep)) {
    throw new Error('Invalid file storage path.');
  }
  return target;
}

export function verifyStoredFilePath(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    return null;
  }
  return fs.existsSync(resolved) ? resolved : null;
}

// --- Library Operations ---

export function listLibraries(): KnowledgeLibrary[] {
  const state = loadState();
  return state.libraries
    .map((lib) => {
      const docs = state.documents.filter((d) => d.libraryId === lib.id);
      const folders = state.folders.filter((f) => f.libraryId === lib.id);
      return {
        ...lib,
        documentCount: docs.length,
        readyDocumentCount: docs.filter((d) => d.status === 'ready').length,
        processingDocumentCount: docs.filter(
          (d) => d.status === 'processing' || d.status === 'uploading'
        ).length,
        folderCount: folders.length,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getLibraryById(libraryId: string): KnowledgeLibrary | null {
  const state = loadState();
  const lib = state.libraries.find((l) => l.id === libraryId);
  if (!lib) return null;
  const docs = state.documents.filter((d) => d.libraryId === lib.id);
  const folders = state.folders.filter((f) => f.libraryId === lib.id);
  return {
    ...lib,
    documentCount: docs.length,
    readyDocumentCount: docs.filter((d) => d.status === 'ready').length,
    processingDocumentCount: docs.filter(
      (d) => d.status === 'processing' || d.status === 'uploading'
    ).length,
    folderCount: folders.length,
  };
}

export function createLibrary(name: string, description: string): KnowledgeLibrary {
  const state = loadState();
  const now = new Date().toISOString();
  const id = `lib_${crypto.randomUUID().slice(0, 8)}`;
  const library: KnowledgeLibrary = {
    id,
    name: name.trim(),
    description: description.trim(),
    vectorStoreId: `vs_biq_${id}`,
    createdAt: now,
    updatedAt: now,
  };
  state.libraries.unshift(library);
  saveState();
  return {
    ...library,
    documentCount: 0,
    readyDocumentCount: 0,
    processingDocumentCount: 0,
    folderCount: 0,
  };
}

export function updateLibrary(
  libraryId: string,
  updates: { name?: string; description?: string }
): KnowledgeLibrary | null {
  const state = loadState();
  const lib = state.libraries.find((l) => l.id === libraryId);
  if (!lib) return null;
  if (typeof updates.name === 'string') {
    lib.name = updates.name.trim();
  }
  if (typeof updates.description === 'string') {
    lib.description = updates.description.trim();
  }
  lib.updatedAt = new Date().toISOString();
  saveState();
  return getLibraryById(libraryId);
}

export function deleteLibrary(libraryId: string): boolean {
  const state = loadState();
  const idx = state.libraries.findIndex((l) => l.id === libraryId);
  if (idx === -1) return false;

  // Delete associated uploaded files safely
  const docs = state.documents.filter((d) => d.libraryId === libraryId);
  for (const doc of docs) {
    if (doc.storagePath) {
      const safe = verifyStoredFilePath(doc.storagePath);
      if (safe) {
        try {
          fs.unlinkSync(safe);
        } catch {
          // ignore unlink errors
        }
      }
    }
    delete state.pages[doc.id];
  }

  state.libraries.splice(idx, 1);
  state.folders = state.folders.filter((f) => f.libraryId !== libraryId);
  state.documents = state.documents.filter((d) => d.libraryId !== libraryId);
  state.chunks = state.chunks.filter((c) => c.libraryId !== libraryId);
  saveState();
  return true;
}

// --- Folder Operations ---

export function listFolders(libraryId: string): Folder[] {
  const state = loadState();
  return state.folders
    .filter((f) => f.libraryId === libraryId)
    .map((f) => ({
      ...f,
      documentCount: state.documents.filter(
        (d) => d.libraryId === libraryId && d.folderId === f.id
      ).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createFolder(libraryId: string, name: string): Folder | null {
  const state = loadState();
  const lib = state.libraries.find((l) => l.id === libraryId);
  if (!lib) return null;

  const trimmed = name.trim();
  const duplicate = state.folders.find(
    (f) => f.libraryId === libraryId && f.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A folder named "${trimmed}" already exists in this library.`);
  }

  const now = new Date().toISOString();
  const folder: Folder = {
    id: `fld_${crypto.randomUUID().slice(0, 8)}`,
    libraryId,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  state.folders.push(folder);
  lib.updatedAt = now;
  saveState();
  return { ...folder, documentCount: 0 };
}

export function renameFolder(folderId: string, name: string): Folder | null {
  const state = loadState();
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) return null;

  const trimmed = name.trim();
  const duplicate = state.folders.find(
    (f) =>
      f.libraryId === folder.libraryId &&
      f.id !== folderId &&
      f.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A folder named "${trimmed}" already exists in this library.`);
  }

  folder.name = trimmed;
  folder.updatedAt = new Date().toISOString();
  const lib = state.libraries.find((l) => l.id === folder.libraryId);
  if (lib) lib.updatedAt = folder.updatedAt;
  saveState();

  return {
    ...folder,
    documentCount: state.documents.filter((d) => d.folderId === folder.id).length,
  };
}

export function deleteFolder(folderId: string): boolean {
  const state = loadState();
  const idx = state.folders.findIndex((f) => f.id === folderId);
  if (idx === -1) return false;
  const folder = state.folders[idx];

  // Unassign documents from deleted folder (keep documents in the library as Unfiled)
  for (const doc of state.documents) {
    if (doc.folderId === folderId) {
      doc.folderId = null;
      doc.updatedAt = new Date().toISOString();
    }
  }

  state.folders.splice(idx, 1);
  const lib = state.libraries.find((l) => l.id === folder.libraryId);
  if (lib) lib.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

// --- Document Operations ---

export function listDocuments(libraryId: string): DocumentRecord[] {
  const state = loadState();
  const lib = state.libraries.find((l) => l.id === libraryId);
  const folderMap = new Map(
    state.folders.filter((f) => f.libraryId === libraryId).map((f) => [f.id, f.name])
  );

  return state.documents
    .filter((d) => d.libraryId === libraryId)
    .map((d) => ({
      ...d,
      libraryName: lib?.name || '',
      folderName: d.folderId ? folderMap.get(d.folderId) || 'Unfiled' : 'Unfiled',
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getDocumentDetail(documentId: string): DocumentDetail | null {
  const state = loadState();
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return null;
  const lib = state.libraries.find((l) => l.id === doc.libraryId);
  const folder = doc.folderId ? state.folders.find((f) => f.id === doc.folderId) : null;

  return {
    ...doc,
    libraryName: lib?.name || '',
    folderName: folder?.name || 'Unfiled',
    pages: state.pages[doc.id] || [],
  };
}

export function createDocumentRecord(params: {
  libraryId: string;
  folderId: string | null;
  filename: string;
  fileType: DocumentFileType;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}): DocumentRecord {
  const state = loadState();
  const lib = state.libraries.find((l) => l.id === params.libraryId);
  if (!lib) {
    throw new Error('Selected knowledge library not found.');
  }

  if (params.folderId) {
    const folder = state.folders.find(
      (f) => f.id === params.folderId && f.libraryId === params.libraryId
    );
    if (!folder) {
      throw new Error('Selected folder does not belong to this knowledge library.');
    }
  }

  const now = new Date().toISOString();
  const id = `doc_${crypto.randomUUID().slice(0, 10)}`;
  const doc: DocumentRecord = {
    id,
    libraryId: params.libraryId,
    folderId: params.folderId,
    filename: params.filename,
    fileType: params.fileType,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    pageCount: 0,
    storagePath: params.storagePath,
    providerFileId: `file_biq_${id}`,
    vectorStoreId: lib.vectorStoreId,
    status: 'processing',
    errorMessage: null,
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  state.documents.unshift(doc);
  lib.updatedAt = now;
  saveState();

  const folder = params.folderId
    ? state.folders.find((f) => f.id === params.folderId)
    : null;
  return {
    ...doc,
    libraryName: lib.name,
    folderName: folder?.name || 'Unfiled',
  };
}

export function completeDocumentIndexing(
  documentId: string,
  pages: DocumentPage[],
  chunks: DocumentChunk[]
) {
  const state = loadState();
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return;

  // Replace existing chunks for this document
  state.chunks = state.chunks.filter((c) => c.documentId !== documentId);
  state.chunks.push(...chunks);
  state.pages[documentId] = pages;

  doc.pageCount = pages.length;
  doc.chunkCount = chunks.length;
  doc.status = 'ready';
  doc.errorMessage = null;
  doc.updatedAt = new Date().toISOString();

  const lib = state.libraries.find((l) => l.id === doc.libraryId);
  if (lib) lib.updatedAt = doc.updatedAt;
  saveState();
}

export function failDocumentIndexing(documentId: string, errorMessage: string) {
  const state = loadState();
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return;

  doc.status = 'failed';
  doc.errorMessage = errorMessage;
  doc.updatedAt = new Date().toISOString();
  saveState();
}

export function updateDocumentStatus(documentId: string, status: DocumentStatus) {
  const state = loadState();
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return;
  doc.status = status;
  if (status === 'processing') doc.errorMessage = null;
  doc.updatedAt = new Date().toISOString();
  saveState();
}

export function moveDocumentToFolder(documentId: string, folderId: string | null): DocumentRecord | null {
  const state = loadState();
  const doc = state.documents.find((d) => d.id === documentId);
  if (!doc) return null;

  if (folderId !== null) {
    const folder = state.folders.find((f) => f.id === folderId && f.libraryId === doc.libraryId);
    if (!folder) {
      throw new Error('Target folder does not belong to this library.');
    }
  }

  doc.folderId = folderId;
  doc.updatedAt = new Date().toISOString();
  saveState();

  const lib = state.libraries.find((l) => l.id === doc.libraryId);
  const folder = folderId ? state.folders.find((f) => f.id === folderId) : null;
  return {
    ...doc,
    libraryName: lib?.name || '',
    folderName: folder?.name || 'Unfiled',
  };
}

export function deleteDocument(documentId: string): boolean {
  const state = loadState();
  const idx = state.documents.findIndex((d) => d.id === documentId);
  if (idx === -1) return false;
  const doc = state.documents[idx];

  if (doc.storagePath) {
    const safe = verifyStoredFilePath(doc.storagePath);
    if (safe) {
      try {
        fs.unlinkSync(safe);
      } catch {
        // ignore unlink errors
      }
    }
  }

  state.documents.splice(idx, 1);
  delete state.pages[documentId];
  state.chunks = state.chunks.filter((c) => c.documentId !== documentId);

  const lib = state.libraries.find((l) => l.id === doc.libraryId);
  if (lib) lib.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

export function getReadyChunksForLibrary(libraryId: string): {
  chunks: DocumentChunk[];
  docsById: Map<string, DocumentRecord>;
  foldersById: Map<string, Folder>;
  readyDocCount: number;
  processingDocCount: number;
} {
  const state = loadState();
  const libraryDocs = state.documents.filter((d) => d.libraryId === libraryId);
  const readyDocs = libraryDocs.filter((d) => d.status === 'ready');
  const processingDocs = libraryDocs.filter(
    (d) => d.status === 'processing' || d.status === 'uploading'
  );

  const readyDocIds = new Set(readyDocs.map((d) => d.id));
  const docsById = new Map(readyDocs.map((d) => [d.id, d]));
  const foldersById = new Map(
    state.folders.filter((f) => f.libraryId === libraryId).map((f) => [f.id, f])
  );

  // Strictly enforce library isolation AND ready-only indexing status
  const chunks = state.chunks.filter(
    (c) => c.libraryId === libraryId && readyDocIds.has(c.documentId)
  );

  return {
    chunks,
    docsById,
    foldersById,
    readyDocCount: readyDocs.length,
    processingDocCount: processingDocs.length,
  };
}
