import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  Info,
  RotateCcw,
  Server,
  Shield,
  User,
} from 'lucide-react';
import { SystemStatus } from '../types/knowledge.ts';

interface SettingsScreenProps {
  operatorName: string;
  onUpdateOperatorName: (name: string) => void;
  systemStatus: SystemStatus | null;
  onResetDemoClick: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  operatorName,
  onUpdateOperatorName,
  systemStatus,
  onResetDemoClick,
}) => {
  const [nameInput, setNameInput] = useState(operatorName);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim();
    if (!cleaned) return;
    onUpdateOperatorName(cleaned);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-[820px] mx-auto px-5 sm:px-9 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.025em] text-[#0F172A] leading-tight">
            Settings
          </h1>
          <p className="text-[14.5px] text-[#475569] mt-1">
            Manage operator preferences, workspace scope, and prototype data.
          </p>
        </div>

        {/* Single-Operator Scope Notice (Requirement #11) */}
        <div className="flex items-start gap-3 p-4 rounded-[12px] bg-[#EFF6FF] border border-[#BFDBFE]">
          <Info className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
          <div className="text-[13.5px] text-[#1E3A8A] leading-relaxed">
            <strong className="font-semibold text-[#0F172A]">Single-Operator Prototype MVP</strong>
            <p className="mt-0.5 text-[#334155]">
              This workspace runs in single-operator presentation mode without multi-tenant user
              authentication. It is designed for product demonstrations and internal evaluation
              rather than public multi-user deployment.
            </p>
          </div>
        </div>

        {/* Operator Profile */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <User className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">Operator Profile</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-[420px]">
            <div>
              <label
                htmlFor="operator-name"
                className="block text-[13px] font-semibold text-[#0F172A] mb-1.5"
              >
                Display Name
              </label>
              <input
                id="operator-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={60}
                className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px] transition-colors"
              >
                Save Profile
              </button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#15803D]">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </section>

        {/* RAG & Security Guardrails */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Shield className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">
              Retrieval &amp; Grounding Guardrails
            </h2>
          </div>

          <div className="divide-y divide-[#F1F5F9] text-[13.5px]">
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Active RAG Engine</span>
              <span className="text-[#475569]">
                {systemStatus?.activeRagEngine || 'Server-side Gemini RAG'}
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Library Isolation</span>
              <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Enforced server-side per vector store
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Untrusted Document Defense</span>
              <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Evidence-first prompt isolation active
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Supported File Types</span>
              <span className="text-[#475569]">
                {(systemStatus?.supportedExtensions || ['PDF', 'DOCX', 'TXT', 'MD']).join(', ')} (Max{' '}
                {systemStatus?.maxUploadSizeMb || 25} MB)
              </span>
            </div>
          </div>
        </section>

        {/* Persistence & Presentation Controls */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <Database className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">Persistence &amp; Demo Data</h2>
          </div>

          <div className="flex items-start gap-2.5 text-[13.5px] text-[#475569] leading-relaxed">
            <Server className="w-4 h-4 text-[#64748B] shrink-0 mt-1" />
            <p>
              Currently storing libraries, folders, extracted pages, and indexed chunks in{' '}
              <strong className="text-[#0F172A]">
                {systemStatus?.activePersistence || 'Local Server File Store (Prototype Mode)'}
              </strong>
              . All records persist across page reloads. A production PostgreSQL migration script is
              included in the repository for post-pitch deployment.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13.5px] font-semibold text-[#0F172A]">
                Restore Default Pitch Libraries
              </div>
              <div className="text-[12.5px] text-[#64748B]">
                Resets all libraries back to the 4 default Business IQ demo libraries and removes
                test uploads.
              </div>
            </div>
            <button
              type="button"
              onClick={onResetDemoClick}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-[8px] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 text-[#64748B]" />
              Reset Demo Data
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
