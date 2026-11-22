import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { DocumentFileType, SystemStatus } from './src/types/knowledge.ts';
import {
  createDocumentRecord,
  createFolder,
  createLibrary,
  deleteDocument,
  deleteFolder,
  deleteLibrary,
  getDocumentDetail,
  getLibraryById,
  listDocuments,
  listFolders,
  listLibraries,
  loadState,
  moveDocumentToFolder,
  renameFolder,
  resetToSeedState,
  resolveSafeUploadPath,
  sanitizeFilename,
  updateDocumentStatus,
  updateLibrary,
  verifyStoredFilePath,
} from './server/store.ts';
import { askKnowledgeLibrary, indexUploadedDocument, isGeminiConfigured } from './server/rag.ts';

const PORT = 3000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

function detectFileType(filename: string): DocumentFileType | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.txt') return 'txt';
  if (ext === '.md') return 'md';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error('Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.'));
      return;
    }
    cb(null, true);
  },
});

async function startServer() {
  // Initialize persisted server-side store
  loadState();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // --- System & Health ---
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/system/status', (_req: Request, res: Response) => {
    const geminiReady = isGeminiConfigured();
    const openaiReady = Boolean(process.env.OPENAI_API_KEY?.trim());
    const supabaseReady = Boolean(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    );

    const status: SystemStatus = {
      appMode: 'single-operator-prototype',
      geminiConfigured: geminiReady,
      openaiConfigured: openaiReady,
      supabaseConfigured: supabaseReady,
      activeRagEngine: geminiReady
        ? 'Gemini RAG (gemini-4-hydrogen + gemini-embedding-2)'
        : 'Not Configured',
      activePersistence: supabaseReady
        ? 'Supabase PostgreSQL'
        : 'Local Server File Store (Prototype Mode)',
      maxUploadSizeMb: 25,
      supportedExtensions: ['PDF', 'DOCX', 'TXT', 'MD'],
    };
    res.json(status);
  });

  app.post('/api/system/reset-demo', (_req: Request, res: Response) => {
    try {
      resetToSeedState();
      res.json({ ok: true, libraries: listLibraries() });
    } catch (err) {
      console.error('Failed to reset demo data:', err);
      res.status(500).json({ error: 'Failed to reset prototype data.' });
    }
  });

  // --- Knowledge Libraries ---
  app.get('/api/libraries', (_req: Request, res: Response) => {
    res.json({ libraries: listLibraries() });
  });

  app.post('/api/libraries', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!name || name.length > 120) {
      return res.status(400).json({ error: 'Library name must be between 1 and 120 characters.' });
    }
    if (description.length > 400) {
      return res.status(400).json({ error: 'Description must be 400 characters or fewer.' });
    }

    const library = createLibrary(name, description);
    return res.status(201).json({ library });
  });

  app.get('/api/libraries/:libraryId', (req: Request, res: Response) => {
    const library = getLibraryById(req.params.libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Knowledge library not found.' });
    }
    return res.json({
      library,
      folders: listFolders(library.id),
      documents: listDocuments(library.id),
    });
  });

  app.patch('/api/libraries/:libraryId', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;

    if (name !== undefined && (!name || name.length > 120)) {
      return res.status(400).json({ error: 'Library name must be between 1 and 120 characters.' });
    }
    if (description !== undefined && description.length > 400) {
      return res.status(400).json({ error: 'Description must be 400 characters or fewer.' });
    }

    const updated = updateLibrary(req.params.libraryId, { name, description });
    if (!updated) {
      return res.status(404).json({ error: 'Knowledge library not found.' });
    }
    return res.json({ library: updated });
  });

  app.delete('/api/libraries/:libraryId', (req: Request, res: Response) => {
    const deleted = deleteLibrary(req.params.libraryId);
    if (!deleted) {
      return res.status(404).json({ error: 'Knowledge library not found.' });
    }
    return res.json({ deleted: true });
  });

  // --- Folders ---
  app.get('/api/libraries/:libraryId/folders', (req: Request, res: Response) => {
    const library = getLibraryById(req.params.libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Knowledge library not found.' });
    }
    return res.json({ folders: listFolders(library.id) });
  });

  app.post('/api/libraries/:libraryId/folders', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Folder name must be between 1 and 80 characters.' });
    }

    try {
      const folder = createFolder(req.params.libraryId, name);
      if (!folder) {
        return res.status(404).json({ error: 'Knowledge library not found.' });
      }
      return res.status(201).json({ folder });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to create folder.';
      return res.status(400).json({ error: msg });
    }
  });

  app.patch('/api/folders/:folderId', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Folder name must be between 1 and 80 characters.' });
    }

    try {
      const folder = renameFolder(req.params.folderId, name);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found.' });
      }
      return res.json({ folder });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to rename folder.';
      return res.status(400).json({ error: msg });
    }
  });

  app.delete('/api/folders/:folderId', (req: Request, res: Response) => {
    const deleted = deleteFolder(req.params.folderId);
    if (!deleted) {
      return res.status(404).json({ error: 'Folder not found.' });
    }
    return res.json({ deleted: true });
  });

  // --- Documents ---
  app.get('/api/libraries/:libraryId/documents', (req: Request, res: Response) => {
    const library = getLibraryById(req.params.libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Knowledge library not found.' });
    }
    return res.json({ documents: listDocuments(library.id) });
  });

  app.post(
    '/api/libraries/:libraryId/documents',
    upload.array('files', 10),
    async (req: Request, res: Response) => {
      const library = getLibraryById(req.params.libraryId);
      if (!library) {
        return res.status(404).json({ error: 'Knowledge library not found.' });
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Please select at least one file to upload.' });
      }

      const rawFolderId =
        typeof req.body?.folderId === 'string' && req.body.folderId.trim() !== ''
          ? req.body.folderId.trim()
          : null;

      const createdDocs = [];

      for (const file of files) {
        const safeName = sanitizeFilename(file.originalname);
        const fileType = detectFileType(safeName);
        if (!fileType) {
          return res.status(400).json({
            error: `Unsupported file format for "${safeName}". Supported formats: PDF, DOCX, TXT, MD.`,
          });
        }

        const uniqueStorageName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
        const safePath = resolveSafeUploadPath(library.id, uniqueStorageName);
        fs.writeFileSync(safePath, file.buffer);

        try {
          const record = createDocumentRecord({
            libraryId: library.id,
            folderId: rawFolderId,
            filename: safeName,
            fileType,
            mimeType: file.mimetype || 'application/octet-stream',
            sizeBytes: file.size,
            storagePath: safePath,
          });
          createdDocs.push(record);

          // Kick off real asynchronous extraction, chunking, and embedding
          // Document stays in "processing" (non-searchable) until complete!
          setTimeout(() => {
            void indexUploadedDocument(record.id, library.id, safePath, fileType);
          }, 350);
        } catch (err: unknown) {
          if (fs.existsSync(safePath)) {
            fs.unlinkSync(safePath);
          }
          const msg = err instanceof Error ? err.message : 'Failed to create document record.';
          return res.status(400).json({ error: msg });
        }
      }

      return res.status(201).json({ documents: createdDocs });
    }
  );

  app.get('/api/documents/:documentId', (req: Request, res: Response) => {
    const doc = getDocumentDetail(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    return res.json({ document: doc });
  });

  app.get('/api/documents/:documentId/download', (req: Request, res: Response) => {
    const doc = getDocumentDetail(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    if (doc.storagePath) {
      const safePath = verifyStoredFilePath(doc.storagePath);
      if (safePath) {
        return res.download(safePath, doc.filename);
      }
    }

    // For pre-seeded pitch documents without binary files on disk, export clean extracted text
    const combinedText = doc.pages
      .map((p) => `--- Page ${p.pageNumber} ---\n\n${p.content}`)
      .join('\n\n');
    const exportName = doc.filename.replace(/\.(pdf|docx)$/i, '') + '.txt';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(exportName)}"`);
    return res.send(combinedText);
  });

  app.patch('/api/documents/:documentId', (req: Request, res: Response) => {
    const folderId =
      req.body?.folderId === null || req.body?.folderId === ''
        ? null
        : typeof req.body?.folderId === 'string'
        ? req.body.folderId.trim()
        : undefined;

    if (folderId === undefined) {
      return res.status(400).json({ error: 'folderId is required.' });
    }

    try {
      const updated = moveDocumentToFolder(req.params.documentId, folderId);
      if (!updated) {
        return res.status(404).json({ error: 'Document not found.' });
      }
      return res.json({ document: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to move document.';
      return res.status(400).json({ error: msg });
    }
  });

  app.post('/api/documents/:documentId/reindex', (req: Request, res: Response) => {
    const doc = getDocumentDetail(req.params.documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    if (!doc.storagePath) {
      return res.status(400).json({ error: 'This seeded document is already indexed.' });
    }
    const safePath = verifyStoredFilePath(doc.storagePath);
    if (!safePath) {
      return res.status(404).json({ error: 'Original file no longer exists on server.' });
    }

    updateDocumentStatus(doc.id, 'processing');
    setTimeout(() => {
      void indexUploadedDocument(doc.id, doc.libraryId, safePath, doc.fileType);
    }, 300);

    return res.json({ status: 'processing' });
  });

  app.delete('/api/documents/:documentId', (req: Request, res: Response) => {
    const deleted = deleteDocument(req.params.documentId);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    return res.json({ deleted: true });
  });

  // --- Evidence-First RAG Ask Endpoint ---
  app.post('/api/chat/ask', async (req: Request, res: Response) => {
    const libraryId = typeof req.body?.libraryId === 'string' ? req.body.libraryId.trim() : '';
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .filter(
            (m: unknown): m is { role: 'user' | 'assistant'; content: string } =>
              typeof m === 'object' &&
              m !== null &&
              ((m as { role?: string }).role === 'user' ||
                (m as { role?: string }).role === 'assistant') &&
              typeof (m as { content?: string }).content === 'string'
          )
          .slice(-6)
      : [];

    if (!libraryId) {
      return res.status(400).json({ error: 'Please select a knowledge library before asking a question.' });
    }
    if (!question || question.length > 2000) {
      return res.status(400).json({ error: 'Question must be between 1 and 2000 characters.' });
    }

    try {
      const result = await askKnowledgeLibrary(libraryId, question, history);
      return res.json(result);
    } catch (err: unknown) {
      console.error('RAG query failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while searching the selected knowledge library.';
      return res.status(500).json({ error: message });
    }
  });

  // Multer & API error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the 25 MB maximum size limit.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  });

  // Frontend serving: Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Business IQ — KnowledgeBase AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
