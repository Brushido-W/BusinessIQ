import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Menu, X } from 'lucide-react';
import {
  ChatMessage,
  Citation,
  DocumentDetail,
  DocumentRecord,
  Folder,
  KnowledgeLibrary,
  SystemStatus,
} from './types/knowledge.ts';
import { api } from './lib/api.ts';
import { formatChatTime } from './lib/format.ts';
import { BusinessIQLogo } from './components/BrandIcons.tsx';
import { NavSection, Sidebar } from './components/Sidebar.tsx';
import { AskAIScreen } from './components/AskAIScreen.tsx';
import { LibrariesScreen } from './components/LibrariesScreen.tsx';
import { LibraryDetailScreen } from './components/LibraryDetailScreen.tsx';
import { DocumentViewerScreen } from './components/DocumentViewerScreen.tsx';
import { SettingsScreen } from './components/SettingsScreen.tsx';
import {
  ConfirmModal,
  FolderModal,
  LibraryModal,
  UploadDocumentsModal,
} from './components/Modals.tsx';

type ViewMode =
  | { type: 'ask' }
  | { type: 'libraries' }
  | { type: 'library-detail'; libraryId: string }
  | { type: 'document-viewer'; documentId: string; citation: Citation | null; fromAsk: boolean }
  | { type: 'settings' };

interface ToastNotice {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

export default function App() {
  const [view, setView] = useState<ViewMode>({ type: 'ask' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [operatorName, setOperatorName] = useState('John Doe');

  // Data state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [libraries, setLibraries] = useState<KnowledgeLibrary[]>([]);
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [selectedAskLibraryId, setSelectedAskLibraryId] = useState<string | null>(null);

  // Library Detail state
  const [activeLibraryDetail, setActiveLibraryDetail] = useState<KnowledgeLibrary | null>(null);
  const [activeFolders, setActiveFolders] = useState<Folder[]>([]);
  const [activeDocuments, setActiveDocuments] = useState<DocumentRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Document Viewer state
  const [activeDocumentDetail, setActiveDocumentDetail] = useState<DocumentDetail | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);

  // Ask AI state (scoped cleanly per library so switching libraries never mixes answers)
  const [messagesByLibrary, setMessagesByLibrary] = useState<Record<string, ChatMessage[]>>({});
  const [isAsking, setIsAsking] = useState(false);

  // Quick Upload state (when triggered from Ask AI or Library Detail)
  const [uploadModalState, setUploadModalState] = useState<{
    open: boolean;
    libraryId: string;
    libraryName: string;
    folders: Folder[];
    defaultFolderId: string | null;
  }>({
    open: false,
    libraryId: '',
    libraryName: '',
    folders: [],
    defaultFolderId: null,
  });

  // Modals state
  const [libraryModal, setLibraryModal] = useState<{
    open: boolean;
    mode: 'create' | 'rename';
    target: KnowledgeLibrary | null;
  }>({ open: false, mode: 'create', target: null });

  const [folderModal, setFolderModal] = useState<{
    open: boolean;
    mode: 'create' | 'rename';
    target: Folder | null;
  }>({ open: false, mode: 'create', target: null });

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {},
  });

  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    const id = Date.now();
    setToast({ id, kind, message });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  }, []);

  const refreshLibraries = useCallback(async () => {
    try {
      const res = await api.listLibraries();
      setLibraries(res.libraries);
      setSelectedAskLibraryId((prev) => {
        if (prev && res.libraries.some((l) => l.id === prev)) return prev;
        return res.libraries[0]?.id || null;
      });
    } catch (err: unknown) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to load knowledge libraries.'
      );
    } finally {
      setLoadingLibraries(false);
    }
  }, [showToast]);

  const loadLibraryDetail = useCallback(
    async (libraryId: string, silent = false) => {
      if (!silent) setLoadingDetail(true);
      try {
        const res = await api.getLibraryDetail(libraryId);
        setActiveLibraryDetail(res.library);
        setActiveFolders(res.folders);
        setActiveDocuments(res.documents);
      } catch (err: unknown) {
        if (!silent) {
          showToast(
            'error',
            err instanceof Error ? err.message : 'Unable to load library details.'
          );
          setView({ type: 'libraries' });
        }
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [showToast]
  );

  const loadDocumentDetail = useCallback(
    async (documentId: string) => {
      setLoadingDocument(true);
      try {
        const res = await api.getDocument(documentId);
        setActiveDocumentDetail(res.document);
      } catch (err: unknown) {
        showToast('error', err instanceof Error ? err.message : 'Unable to open document.');
        setView({ type: 'libraries' });
      } finally {
        setLoadingDocument(false);
      }
    },
    [showToast]
  );

  // Initial load
  useEffect(() => {
    void refreshLibraries();
    void api
      .getSystemStatus()
      .then(setSystemStatus)
      .catch(() => {
        // Non-blocking
      });
  }, [refreshLibraries]);

  // Load detail when entering library-detail view
  useEffect(() => {
    if (view.type === 'library-detail') {
      setSelectedFolderId(null);
      void loadLibraryDetail(view.libraryId);
    } else if (view.type === 'document-viewer') {
      void loadDocumentDetail(view.documentId);
    }
  }, [view, loadLibraryDetail, loadDocumentDetail]);

  // Poll automatically while any document is uploading or processing
  useEffect(() => {
    const anyLibraryProcessing = libraries.some(
      (l) => (l.processingDocumentCount ?? 0) > 0
    );
    const anyDetailProcessing = activeDocuments.some(
      (d) => d.status === 'processing' || d.status === 'uploading'
    );

    if (!anyLibraryProcessing && !anyDetailProcessing) return;

    const timer = setInterval(() => {
      void refreshLibraries();
      if (view.type === 'library-detail') {
        void loadLibraryDetail(view.libraryId, true);
      }
    }, 1400);

    return () => clearInterval(timer);
  }, [libraries, activeDocuments, view, refreshLibraries, loadLibraryDetail]);

  const activeNavSection: NavSection =
    view.type === 'ask'
      ? 'ask'
      : view.type === 'settings'
      ? 'settings'
      : 'libraries';

  const handleSelectNav = (section: NavSection) => {
    if (section === 'ask') {
      setView({ type: 'ask' });
    } else if (section === 'libraries') {
      setView({ type: 'libraries' });
      void refreshLibraries();
    } else {
      setView({ type: 'settings' });
    }
  };

  // --- Ask AI Handlers ---
  const handleSendQuestion = async (question: string) => {
    if (!selectedAskLibraryId) return;
    const lib = libraries.find((l) => l.id === selectedAskLibraryId);
    if (!lib) return;

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: formatChatTime(),
      libraryId: lib.id,
      libraryName: lib.name,
    };

    const existingMessages = messagesByLibrary[lib.id] || [];
    setMessagesByLibrary((prev) => ({
      ...prev,
      [lib.id]: [...existingMessages, userMsg],
    }));

    setIsAsking(true);
    try {
      const history = existingMessages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await api.askQuestion({
        libraryId: lib.id,
        question,
        history,
      });

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: formatChatTime(),
        libraryId: res.libraryId,
        libraryName: res.libraryName,
        citations: res.citations,
        insufficientEvidence: res.insufficientEvidence,
        processingWarning: res.processingWarning,
      };

      setMessagesByLibrary((prev) => ({
        ...prev,
        [lib.id]: [...(prev[lib.id] || []), assistantMsg],
      }));
    } catch (err: unknown) {
      const errorText =
        err instanceof Error
          ? err.message
          : 'Network error while querying the selected knowledge library.';
      const errMsg: ChatMessage = {
        id: `msg_e_${Date.now()}`,
        role: 'assistant',
        content: errorText,
        timestamp: formatChatTime(),
        libraryId: lib.id,
        libraryName: lib.name,
        isError: true,
      };
      setMessagesByLibrary((prev) => ({
        ...prev,
        [lib.id]: [...(prev[lib.id] || []), errMsg],
      }));
    } finally {
      setIsAsking(false);
    }
  };

  const handleClearChat = () => {
    if (!selectedAskLibraryId) return;
    setMessagesByLibrary((prev) => ({
      ...prev,
      [selectedAskLibraryId]: [],
    }));
  };

  const handleOpenQuickUploadFromAsk = async () => {
    if (!selectedAskLibraryId) return;
    try {
      const detail = await api.getLibraryDetail(selectedAskLibraryId);
      setUploadModalState({
        open: true,
        libraryId: detail.library.id,
        libraryName: detail.library.name,
        folders: detail.folders,
        defaultFolderId: null,
      });
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Unable to open upload dialog.');
    }
  };

  // --- CRUD Handlers ---
  const handleSaveLibrary = async (name: string, description: string) => {
    if (libraryModal.mode === 'create') {
      const res = await api.createLibrary({ name, description });
      await refreshLibraries();
      setSelectedAskLibraryId(res.library.id);
      showToast('success', `Created library "${res.library.name}".`);
    } else if (libraryModal.target) {
      const res = await api.updateLibrary(libraryModal.target.id, { name, description });
      await refreshLibraries();
      if (view.type === 'library-detail' && view.libraryId === libraryModal.target.id) {
        setActiveLibraryDetail(res.library);
      }
      showToast('success', `Updated library "${res.library.name}".`);
    }
  };

  const requestDeleteLibrary = (library: KnowledgeLibrary) => {
    setConfirmModal({
      open: true,
      title: `Delete "${library.name}"?`,
      description:
        'This will permanently remove the knowledge library, its folders, uploaded documents, and vector store index. This action cannot be undone.',
      confirmLabel: 'Delete Library',
      danger: true,
      onConfirm: async () => {
        await api.deleteLibrary(library.id);
        setMessagesByLibrary((prev) => {
          const copy = { ...prev };
          delete copy[library.id];
          return copy;
        });
        await refreshLibraries();
        if (view.type === 'library-detail' && view.libraryId === library.id) {
          setView({ type: 'libraries' });
        }
        showToast('success', `Deleted library "${library.name}".`);
      },
    });
  };

  const handleSaveFolder = async (name: string) => {
    if (folderModal.mode === 'create' && activeLibraryDetail) {
      await api.createFolder(activeLibraryDetail.id, name);
      await loadLibraryDetail(activeLibraryDetail.id, true);
      showToast('success', `Created folder "${name}".`);
    } else if (folderModal.mode === 'rename' && folderModal.target && activeLibraryDetail) {
      await api.renameFolder(folderModal.target.id, name);
      await loadLibraryDetail(activeLibraryDetail.id, true);
      showToast('success', `Renamed folder to "${name}".`);
    }
  };

  const requestDeleteFolder = (folder: Folder) => {
    setConfirmModal({
      open: true,
      title: `Delete folder "${folder.name}"?`,
      description:
        'The folder will be removed. Any documents inside it will remain in the library as Unfiled.',
      confirmLabel: 'Delete Folder',
      danger: true,
      onConfirm: async () => {
        await api.deleteFolder(folder.id);
        if (selectedFolderId === folder.id) {
          setSelectedFolderId(null);
        }
        if (activeLibraryDetail) {
          await loadLibraryDetail(activeLibraryDetail.id, true);
        }
        showToast('success', `Deleted folder "${folder.name}".`);
      },
    });
  };

  const handleUploadDocuments = async (files: File[], folderId: string | null) => {
    const targetLibId = uploadModalState.libraryId;
    if (!targetLibId) return;
    await api.uploadDocuments(targetLibId, files, folderId);
    await refreshLibraries();
    if (view.type === 'library-detail' && view.libraryId === targetLibId) {
      await loadLibraryDetail(targetLibId, true);
    }
    showToast(
      'success',
      `Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. Indexing in progress...`
    );
  };

  const requestDeleteDocument = (doc: { id: string; filename: string; libraryId: string }) => {
    setConfirmModal({
      open: true,
      title: `Delete "${doc.filename}"?`,
      description:
        'This document and its indexed passages will be permanently deleted from this library.',
      confirmLabel: 'Delete Document',
      danger: true,
      onConfirm: async () => {
        await api.deleteDocument(doc.id);
        await refreshLibraries();
        if (view.type === 'document-viewer') {
          setView({ type: 'library-detail', libraryId: doc.libraryId });
        } else if (view.type === 'library-detail') {
          await loadLibraryDetail(doc.libraryId, true);
        }
        showToast('success', `Deleted "${doc.filename}".`);
      },
    });
  };

  const handleMoveDocument = async (docId: string, folderId: string | null) => {
    try {
      await api.moveDocument(docId, folderId);
      if (activeLibraryDetail) {
        await loadLibraryDetail(activeLibraryDetail.id, true);
      }
      showToast('success', 'Moved document to folder.');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Unable to move document.');
    }
  };

  const handleReindexDocument = async (docId: string) => {
    try {
      await api.reindexDocument(docId);
      if (activeLibraryDetail) {
        await loadLibraryDetail(activeLibraryDetail.id, true);
      }
      showToast('success', 'Re-indexing started.');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Unable to re-index document.');
    }
  };

  const requestResetDemo = () => {
    setConfirmModal({
      open: true,
      title: 'Reset prototype demo data?',
      description:
        'This will restore the 4 default Business IQ libraries (SOPs & Procedures, Policies, HR Resources, IT Documentation) and remove any uploaded test files.',
      confirmLabel: 'Reset Data',
      danger: false,
      onConfirm: async () => {
        const res = await api.resetDemo();
        setLibraries(res.libraries);
        setSelectedAskLibraryId(res.libraries[0]?.id || null);
        setMessagesByLibrary({});
        setActiveLibraryDetail(null);
        setActiveDocumentDetail(null);
        setView({ type: 'ask' });
        showToast('success', 'Restored default prototype libraries.');
      },
    });
  };

  const currentAskMessages = selectedAskLibraryId
    ? messagesByLibrary[selectedAskLibraryId] || []
    : [];

  return (
    <div className="min-h-screen h-screen flex flex-col md:flex-row bg-white text-[#0F172A] overflow-hidden">
      {/* Compact Mobile Top Header (Hidden on Desktop for 1:1 Reference Match) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-[#0F1829] text-white shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-[8px] text-[#CBD5E1] hover:text-white hover:bg-white/10"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BusinessIQLogo className="w-6 h-6" />
          <span className="text-[16px] font-bold tracking-[-0.02em]">Business IQ</span>
        </div>
        <span className="text-[11.5px] text-[#94A3B8]">KnowledgeBase AI</span>
      </header>

      {/* Dark Navy Sidebar Shell */}
      <Sidebar
        activeSection={activeNavSection}
        onSelectSection={handleSelectNav}
        operatorName={operatorName}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden relative bg-white">
        {view.type === 'ask' && (
          <AskAIScreen
            libraries={libraries}
            selectedLibraryId={selectedAskLibraryId}
            onSelectLibrary={setSelectedAskLibraryId}
            messages={currentAskMessages}
            isAsking={isAsking}
            onSendQuestion={handleSendQuestion}
            onClearChat={handleClearChat}
            onOpenCitation={(citation) =>
              setView({
                type: 'document-viewer',
                documentId: citation.documentId,
                citation,
                fromAsk: true,
              })
            }
            onOpenQuickUpload={() => void handleOpenQuickUploadFromAsk()}
            onNavigateToLibraries={() => setView({ type: 'libraries' })}
            geminiConfigured={systemStatus ? systemStatus.geminiConfigured : true}
          />
        )}

        {view.type === 'libraries' && (
          <LibrariesScreen
            libraries={libraries}
            loading={loadingLibraries}
            onOpenLibrary={(libraryId) =>
              setView({ type: 'library-detail', libraryId })
            }
            onCreateClick={() =>
              setLibraryModal({ open: true, mode: 'create', target: null })
            }
            onRenameClick={(library) =>
              setLibraryModal({ open: true, mode: 'rename', target: library })
            }
            onDeleteClick={requestDeleteLibrary}
          />
        )}

        {view.type === 'library-detail' && (
          loadingDetail && !activeLibraryDetail ? (
            <div className="h-full flex items-center justify-center text-[#64748B] gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span className="text-[14px]">Loading library...</span>
            </div>
          ) : activeLibraryDetail ? (
            <LibraryDetailScreen
              library={activeLibraryDetail}
              folders={activeFolders}
              documents={activeDocuments}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onBack={() => {
                setView({ type: 'libraries' });
                void refreshLibraries();
              }}
              onRenameLibrary={() =>
                setLibraryModal({
                  open: true,
                  mode: 'rename',
                  target: activeLibraryDetail,
                })
              }
              onDeleteLibrary={() => requestDeleteLibrary(activeLibraryDetail)}
              onAskAboutLibrary={() => {
                setSelectedAskLibraryId(activeLibraryDetail.id);
                setView({ type: 'ask' });
              }}
              onCreateFolder={() =>
                setFolderModal({ open: true, mode: 'create', target: null })
              }
              onRenameFolder={(folder) =>
                setFolderModal({ open: true, mode: 'rename', target: folder })
              }
              onDeleteFolder={requestDeleteFolder}
              onUploadClick={() =>
                setUploadModalState({
                  open: true,
                  libraryId: activeLibraryDetail.id,
                  libraryName: activeLibraryDetail.name,
                  folders: activeFolders,
                  defaultFolderId: selectedFolderId,
                })
              }
              onOpenDocument={(documentId) =>
                setView({
                  type: 'document-viewer',
                  documentId,
                  citation: null,
                  fromAsk: false,
                })
              }
              onDeleteDocument={requestDeleteDocument}
              onMoveDocument={handleMoveDocument}
              onReindexDocument={handleReindexDocument}
            />
          ) : null
        )}

        {view.type === 'document-viewer' && (
          loadingDocument || !activeDocumentDetail ? (
            <div className="h-full flex items-center justify-center text-[#64748B] gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span className="text-[14px]">Loading document...</span>
            </div>
          ) : (
            <DocumentViewerScreen
              document={activeDocumentDetail}
              activeCitation={view.citation}
              openedFromAsk={view.fromAsk}
              onBackToLibrary={() =>
                setView({
                  type: 'library-detail',
                  libraryId: activeDocumentDetail.libraryId,
                })
              }
              onBackToAsk={() => setView({ type: 'ask' })}
              onDeleteDocument={() =>
                requestDeleteDocument({
                  id: activeDocumentDetail.id,
                  filename: activeDocumentDetail.filename,
                  libraryId: activeDocumentDetail.libraryId,
                })
              }
            />
          )
        )}

        {view.type === 'settings' && (
          <SettingsScreen
            operatorName={operatorName}
            onUpdateOperatorName={setOperatorName}
            systemStatus={systemStatus}
            onResetDemoClick={requestResetDemo}
          />
        )}

        {/* Crisp Toast Notification */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 max-w-[380px] flex items-center gap-2.5 px-4 py-3 rounded-[10px] border shadow-[0_8px_24px_rgba(15,23,42,0.12)] bg-white border-[#E2E8F0]">
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
            )}
            <span className="text-[13px] font-medium text-[#0F172A]">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-0.5 text-[#94A3B8] hover:text-[#475569] ml-1"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      <LibraryModal
        open={libraryModal.open}
        mode={libraryModal.mode}
        initialName={libraryModal.target?.name || ''}
        initialDescription={libraryModal.target?.description || ''}
        onClose={() => setLibraryModal({ open: false, mode: 'create', target: null })}
        onSubmit={handleSaveLibrary}
      />

      <FolderModal
        open={folderModal.open}
        mode={folderModal.mode}
        initialName={folderModal.target?.name || ''}
        onClose={() => setFolderModal({ open: false, mode: 'create', target: null })}
        onSubmit={handleSaveFolder}
      />

      <UploadDocumentsModal
        open={uploadModalState.open}
        libraryName={uploadModalState.libraryName}
        folders={uploadModalState.folders}
        defaultFolderId={uploadModalState.defaultFolderId}
        onClose={() =>
          setUploadModalState((prev) => ({ ...prev, open: false }))
        }
        onUpload={handleUploadDocuments}
      />

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        danger={confirmModal.danger}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
