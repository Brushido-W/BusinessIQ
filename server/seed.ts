import { DocumentChunk, DocumentFileType, DocumentPage, DocumentRecord, Folder, KnowledgeLibrary } from '../src/types/knowledge.ts';

export interface DatabaseState {
  version: number;
  libraries: KnowledgeLibrary[];
  folders: Folder[];
  documents: DocumentRecord[];
  pages: Record<string, DocumentPage[]>;
  chunks: DocumentChunk[];
}

export function chunkDocumentPages(
  documentId: string,
  libraryId: string,
  pages: DocumentPage[]
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const rawBlocks = page.content
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    let currentSection: string | null = null;
    let buffer = '';

    const flush = () => {
      const cleaned = buffer.trim();
      if (!cleaned) return;
      chunks.push({
        id: `chk_${documentId}_${chunkIndex}`,
        documentId,
        libraryId,
        pageNumber: page.pageNumber,
        sectionTitle: currentSection,
        chunkIndex,
        content: cleaned,
      });
      chunkIndex += 1;
      buffer = '';
    };

    for (const block of rawBlocks) {
      const firstLine = block.split('\n')[0].trim();
      const looksLikeHeading =
        /^(\d+\.\s+[A-Z]|#{1,4}\s+)/.test(firstLine) && firstLine.length <= 90;

      if (looksLikeHeading) {
        if (buffer.length > 180) {
          flush();
        }
        currentSection = firstLine.replace(/^#+\s*/, '');
      }

      if (buffer.length + block.length > 900 && buffer.length > 0) {
        flush();
      }

      buffer = buffer ? `${buffer}\n\n${block}` : block;
    }

    flush();
  }

  return chunks;
}

function makeSeedDoc(
  params: {
    id: string;
    libraryId: string;
    vectorStoreId: string;
    folderId: string;
    filename: string;
    fileType: DocumentFileType;
    sizeBytes: number;
    createdAt: string;
    pages: DocumentPage[];
  }
): { doc: DocumentRecord; pages: DocumentPage[]; chunks: DocumentChunk[] } {
  const mimeMap: Record<DocumentFileType, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
  };

  const chunks = chunkDocumentPages(params.id, params.libraryId, params.pages);

  const doc: DocumentRecord = {
    id: params.id,
    libraryId: params.libraryId,
    folderId: params.folderId,
    filename: params.filename,
    fileType: params.fileType,
    mimeType: mimeMap[params.fileType],
    sizeBytes: params.sizeBytes,
    pageCount: params.pages.length,
    storagePath: null,
    providerFileId: `file_biq_${params.id}`,
    vectorStoreId: params.vectorStoreId,
    status: 'ready',
    errorMessage: null,
    chunkCount: chunks.length,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
  };

  return { doc, pages: params.pages, chunks };
}

export function createInitialSeedState(): DatabaseState {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();

  const libraries: KnowledgeLibrary[] = [
    {
      id: 'lib_sops',
      name: 'SOPs & Procedures',
      description: 'Standard operating procedures and process documentation.',
      vectorStoreId: 'vs_biq_sops_procedures',
      createdAt: daysAgo(30),
      updatedAt: hoursAgo(2),
    },
    {
      id: 'lib_policies',
      name: 'Policies',
      description: 'Company policies, compliance, and guidelines.',
      vectorStoreId: 'vs_biq_company_policies',
      createdAt: daysAgo(28),
      updatedAt: daysAgo(1),
    },
    {
      id: 'lib_hr',
      name: 'HR Resources',
      description: 'HR forms, onboarding, and employee resources.',
      vectorStoreId: 'vs_biq_hr_resources',
      createdAt: daysAgo(25),
      updatedAt: daysAgo(3),
    },
    {
      id: 'lib_it',
      name: 'IT Documentation',
      description: 'System guides, troubleshooting, and technical resources.',
      vectorStoreId: 'vs_biq_it_documentation',
      createdAt: daysAgo(20),
      updatedAt: daysAgo(5),
    },
  ];

  const folders: Folder[] = [
    // SOPs & Procedures
    { id: 'fld_onboarding', libraryId: 'lib_sops', name: 'Onboarding', createdAt: daysAgo(30), updatedAt: hoursAgo(2) },
    { id: 'fld_operations', libraryId: 'lib_sops', name: 'Operations', createdAt: daysAgo(30), updatedAt: daysAgo(1) },
    { id: 'fld_compliance', libraryId: 'lib_sops', name: 'Compliance', createdAt: daysAgo(29), updatedAt: daysAgo(1) },
    { id: 'fld_training', libraryId: 'lib_sops', name: 'Training', createdAt: daysAgo(28), updatedAt: daysAgo(2) },

    // Policies
    { id: 'fld_workplace', libraryId: 'lib_policies', name: 'Workplace', createdAt: daysAgo(28), updatedAt: daysAgo(1) },
    { id: 'fld_finance', libraryId: 'lib_policies', name: 'Finance & Travel', createdAt: daysAgo(26), updatedAt: daysAgo(2) },
    { id: 'fld_infosec', libraryId: 'lib_policies', name: 'Information Security', createdAt: daysAgo(24), updatedAt: daysAgo(3) },

    // HR Resources
    { id: 'fld_benefits', libraryId: 'lib_hr', name: 'Benefits', createdAt: daysAgo(25), updatedAt: daysAgo(3) },
    { id: 'fld_leave', libraryId: 'lib_hr', name: 'Leave & PTO', createdAt: daysAgo(24), updatedAt: daysAgo(4) },

    // IT Documentation
    { id: 'fld_identity', libraryId: 'lib_it', name: 'Access & Identity', createdAt: daysAgo(20), updatedAt: daysAgo(5) },
    { id: 'fld_runbooks', libraryId: 'lib_it', name: 'Security Runbooks', createdAt: daysAgo(19), updatedAt: daysAgo(5) },
  ];

  const seedDocs = [
    // --- LIBRARY 1: SOPs & Procedures ---
    makeSeedDoc({
      id: 'doc_onboarding_sop',
      libraryId: 'lib_sops',
      vectorStoreId: 'vs_biq_sops_procedures',
      folderId: 'fld_onboarding',
      filename: 'Employee Onboarding SOP.pdf',
      fileType: 'pdf',
      sizeBytes: 1258291,
      createdAt: '2025-01-26T09:15:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Purpose & Scope

This Standard Operating Procedure (SOP-HR-104) establishes the uniform onboarding workflow for all full-time, part-time, and contract employees joining the organization.

The objective is to ensure every new hire receives timely workstation provisioning, compliant HR documentation, cultural orientation, and role-specific training within their first five business days.`,
        },
        {
          pageNumber: 2,
          content: `2. Onboarding Procedure

The onboarding process for a new employee consists of the following key steps:

1. Prepare the employee's workstation and system access.
2. Complete the required HR documentation (e.g., employment forms, tax forms).
3. Conduct a company orientation, including policies and key resources.
4. Set up initial training with the employee's manager.

3. Responsibilities

The HR team is responsible for coordinating the onboarding process and ensuring all required steps are completed. IT Operations provisions laptops, SSO credentials, and role-based software licenses at least 48 hours prior to the start date.`,
        },
        {
          pageNumber: 3,
          content: `4. Day One Orientation Agenda

New hires attend a 90-minute live orientation session at 10:00 AM local time on their first day. Topics include organizational structure, core operating values, workplace safety protocols, and an overview of internal knowledge libraries.

5. First-Week Checkpoints

Managers must hold a 30-minute check-in on Day 3 and Day 5 to confirm tool access, review initial deliverables, and pair the new hire with a peer onboarding buddy.`,
        },
        {
          pageNumber: 4,
          content: `6. Security & Compliance Attestation

Within 7 calendar days of hire, every employee must complete mandatory Security Awareness training and sign the Acceptable Use and Confidentiality acknowledgments inside the HR portal.`,
        },
        {
          pageNumber: 5,
          content: `7. Document Control & Revision History

Document Owner: People Operations Lead
Review Cadence: Semi-annual
Last Reviewed: January 2025
Approval Authority: VP of Operations`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_newhire_checklist',
      libraryId: 'lib_sops',
      vectorStoreId: 'vs_biq_sops_procedures',
      folderId: 'fld_onboarding',
      filename: 'New Hire Checklist.pdf',
      fileType: 'pdf',
      sizeBytes: 482300,
      createdAt: '2025-01-26T08:40:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Pre-Start Checklist (T-5 Business Days)

- Verify signed offer letter and background check clearance in HRIS.
- Submit IT Hardware Provisioning ticket (laptop, monitor, security key).
- Assign an onboarding buddy from the hiring department.
- Send welcome email with Day 1 schedule and building access instructions.`,
        },
        {
          pageNumber: 2,
          content: `2. Day 1 to Day 5 Verification

- Confirm I-9 employment eligibility verification within 3 business days of start date.
- Verify payroll direct deposit and W-4 / local tax withholding submission.
- Confirm enrollment in company Slack channels, email groups, and project tracking tools.
- Schedule 30-day goal alignment meeting with direct manager.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_ops_manual',
      libraryId: 'lib_sops',
      vectorStoreId: 'vs_biq_sops_procedures',
      folderId: 'fld_operations',
      filename: 'Operations Manual.docx',
      fileType: 'docx',
      sizeBytes: 942080,
      createdAt: '2025-01-25T14:20:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Daily Operations & SLA Escalation Matrix

All customer-facing operational tickets are categorized into three priority tiers:
- Priority 1 (Critical Outage): Initial acknowledgment within 15 minutes; engineering escalation within 30 minutes; status updates every 30 minutes until resolved.
- Priority 2 (Degraded Workflow): Initial acknowledgment within 2 hours; resolution target within 1 business day.
- Priority 3 (Standard Request): Initial acknowledgment within 1 business day; resolution target within 3 business days.`,
        },
        {
          pageNumber: 2,
          content: `2. Vendor Onboarding & Procurement Approval

Before engaging any new software or operational vendor:
1. Procurement must collect a W-9 / W-8BEN form and Certificate of Insurance.
2. Information Security conducts a vendor risk review if the vendor processes customer or internal confidential data.
3. Purchase orders between $5,000 and $25,000 require Department Director approval.
4. Purchase orders exceeding $25,000 require CFO sign-off.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_compliance_guidelines',
      libraryId: 'lib_sops',
      vectorStoreId: 'vs_biq_sops_procedures',
      folderId: 'fld_compliance',
      filename: 'Compliance Guidelines.pdf',
      fileType: 'pdf',
      sizeBytes: 1640210,
      createdAt: '2025-01-26T10:05:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Quarterly Access Reviews

In accordance with SOC 2 Type II controls, system administrators must perform quarterly user access reviews across production databases, cloud infrastructure, and payroll systems. Unused accounts inactive for more than 45 days must be suspended immediately and deprovisioned within 5 business days.`,
        },
        {
          pageNumber: 2,
          content: `2. Audit Evidence & Record Retention

Financial records and executed customer contracts must be retained for 7 years in immutable archive storage. Access review sign-offs and incident postmortems must be retained for a minimum of 3 years.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_training_plan',
      libraryId: 'lib_sops',
      vectorStoreId: 'vs_biq_sops_procedures',
      folderId: 'fld_training',
      filename: 'Training Plan.pdf',
      fileType: 'pdf',
      sizeBytes: 715400,
      createdAt: '2025-01-24T11:30:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. 30-60-90 Day Role Ramp-Up Plan

Days 1–30 (Foundation): Complete product fundamentals curriculum, shadow 5 live customer or operational workflows, and pass the internal systems readiness quiz with a score of 85% or higher.

Days 31–60 (Execution): Own scoped deliverables with weekly peer review and document at least two process improvements in the team library.

Days 61–90 (Autonomy): Operate independently against quarterly KPIs and participate in formal 90-day probation review.`,
        },
      ],
    }),

    // --- LIBRARY 2: Policies ---
    makeSeedDoc({
      id: 'doc_remote_work_policy',
      libraryId: 'lib_policies',
      vectorStoreId: 'vs_biq_company_policies',
      folderId: 'fld_workplace',
      filename: 'Remote Work Policy.pdf',
      fileType: 'pdf',
      sizeBytes: 540120,
      createdAt: '2025-01-22T16:10:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Hybrid & Remote Work Eligibility

Employees in eligible roles may work remotely up to 3 days per week under the standard hybrid schedule, or full-time remote with written VP approval. Core collaboration hours are 10:00 AM to 3:00 PM in the employee's primary hub time zone.

2. Home Office Stipend

All full-time employees receive a one-time $750 home office ergonomic stipend upon joining, plus $50 per month toward high-speed internet service. Receipts must be submitted through the expense portal.`,
        },
        {
          pageNumber: 2,
          content: `3. Temporary International Remote Work

Employees may work from an approved international location for up to 30 calendar days per rolling 12-month period, provided they submit a Remote Travel Request at least 14 days in advance for tax and IT security verification.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_expense_policy',
      libraryId: 'lib_policies',
      vectorStoreId: 'vs_biq_company_policies',
      folderId: 'fld_finance',
      filename: 'Expense Reimbursement Policy.pdf',
      fileType: 'pdf',
      sizeBytes: 628900,
      createdAt: '2025-01-20T09:00:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Travel & Meal Allowances

When traveling on approved company business:
- Meals are reimbursed up to $75 per day (itemized receipts required for any single charge over $25).
- Lodging must be booked at standard business-class rates not exceeding $275/night in standard metros or $375/night in Tier-1 cities (New York, San Francisco, London).
- Airfare must be booked in economy class at least 14 days prior to departure where feasible.`,
        },
        {
          pageNumber: 2,
          content: `2. Approval Thresholds & Submission Window

All expense reports must be submitted within 14 calendar days of incurring the expense. Expenses under $500 are approved by the employee's direct manager. Single expenses or trip totals exceeding $500 require Finance Controller review. Reimbursements are issued via payroll direct deposit within 10 business days of final approval.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_data_classification',
      libraryId: 'lib_policies',
      vectorStoreId: 'vs_biq_company_policies',
      folderId: 'fld_infosec',
      filename: 'Data Classification Policy.md',
      fileType: 'md',
      sizeBytes: 18420,
      createdAt: '2025-01-18T13:45:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `# Data Classification Tiers

1. Public: Approved external marketing materials, press releases, and published product documentation.
2. Internal: General operational docs, internal announcements, and non-sensitive meeting notes.
3. Confidential: Customer lists, financial forecasts, pricing models, and employee HR records. Must be encrypted at rest and never shared externally without an NDA.
4. Restricted: Production credentials, encryption keys, payment card data, and personal tax IDs. Strictly limited to least-privilege personnel with MFA enforced.`,
        },
      ],
    }),

    // --- LIBRARY 3: HR Resources ---
    makeSeedDoc({
      id: 'doc_pto_handbook',
      libraryId: 'lib_hr',
      vectorStoreId: 'vs_biq_hr_resources',
      folderId: 'fld_leave',
      filename: 'Annual PTO & Leave Handbook.pdf',
      fileType: 'pdf',
      sizeBytes: 812000,
      createdAt: '2025-01-19T10:30:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Paid Time Off (PTO) Accrual

Full-time employees accrue 20 days (160 hours) of Paid Time Off per calendar year, accrued evenly each pay period. Up to 5 unused PTO days may carry over into the following calendar year.

2. Sick & Wellness Leave

Employees receive 10 paid sick and mental health days annually, granted in full on January 1st. Sick leave does not roll over year-to-year.`,
        },
        {
          pageNumber: 2,
          content: `3. Parental Leave

Eligible employees with at least 6 months of continuous service receive 12 weeks of 100% paid parental leave following the birth, adoption, or foster placement of a child. Leave may be taken continuously or in two blocks within 12 months of the qualifying event.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_benefits_guide',
      libraryId: 'lib_hr',
      vectorStoreId: 'vs_biq_hr_resources',
      folderId: 'fld_benefits',
      filename: 'Benefits Enrollment Guide.docx',
      fileType: 'docx',
      sizeBytes: 590400,
      createdAt: '2025-01-17T15:00:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Health, Dental & Vision Coverage

The company covers 90% of medical, dental, and vision premiums for employees and 75% for eligible dependents. Coverage begins on the first day of the month following the hire date. Annual Open Enrollment runs from November 1 through November 15.

2. Retirement 401(k) Match

Employees are eligible to contribute immediately upon hire. The company matches 100% of employee contributions up to 4% of eligible base salary, with immediate 100% vesting.`,
        },
      ],
    }),

    // --- LIBRARY 4: IT Documentation ---
    makeSeedDoc({
      id: 'doc_vpn_sso_guide',
      libraryId: 'lib_it',
      vectorStoreId: 'vs_biq_it_documentation',
      folderId: 'fld_identity',
      filename: 'VPN & SSO Setup Guide.md',
      fileType: 'md',
      sizeBytes: 14200,
      createdAt: '2025-01-16T11:20:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `# SSO & Multi-Factor Authentication Setup

1. Activate your corporate Okta account via the welcome link sent to your personal onboarding email.
2. Enroll a hardware FIDO2 security key (YubiKey) or Okta Verify biometric push as your primary MFA factor. SMS-based MFA is disabled for all engineering and finance accounts.

# Corporate VPN Connection

Install the managed WireGuard client from Self-Service Software Center and connect to the gateway profile matching your region (us-east.vpn.internal or eu-west.vpn.internal). Split-tunneling is disabled for production database access.`,
        },
      ],
    }),

    makeSeedDoc({
      id: 'doc_incident_runbook',
      libraryId: 'lib_it',
      vectorStoreId: 'vs_biq_it_documentation',
      folderId: 'fld_runbooks',
      filename: 'Security Incident Runbook.pdf',
      fileType: 'pdf',
      sizeBytes: 1120500,
      createdAt: '2025-01-15T17:45:00.000Z',
      pages: [
        {
          pageNumber: 1,
          content: `1. Incident Severity Classification & Initial Response

Severity 1 (Active Breach or Confirmed Data Exfiltration):
- Trigger the PagerDuty "SecOps-Sev1" escalation policy immediately.
- Incident Commander must be assigned within 15 minutes.
- Isolate affected endpoints via EDR containment and revoke active SSO refresh tokens for impacted identities.
- Notify Legal Counsel and Executive Leadership within 60 minutes.`,
        },
        {
          pageNumber: 2,
          content: `2. Post-Incident Review

Within 72 hours of incident containment and resolution, the Incident Commander must publish a blameless Root Cause Analysis (RCA) documenting the detection timeline, affected assets, containment actions, and tracked remediation tickets.`,
        },
      ],
    }),
  ];

  const documents: DocumentRecord[] = [];
  const pages: Record<string, DocumentPage[]> = {};
  const chunks: DocumentChunk[] = [];

  for (const item of seedDocs) {
    documents.push(item.doc);
    pages[item.doc.id] = item.pages;
    chunks.push(...item.chunks);
  }

  return {
    version: 1,
    libraries,
    folders,
    documents,
    pages,
    chunks,
  };
}
