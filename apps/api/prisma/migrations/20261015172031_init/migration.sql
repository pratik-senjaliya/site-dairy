-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'engineer', 'supervisor', 'store', 'accountant');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('gu', 'en', 'hi');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('rcc_frame', 'load_bearing', 'bungalow');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'on_hold', 'completed');

-- CreateEnum
CREATE TYPE "StructureKind" AS ENUM ('tower', 'floor', 'unit');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('daily', 'lump_sum', 'per_unit');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'upi', 'bank');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paid');

-- CreateEnum
CREATE TYPE "IndentStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'closed');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'sent', 'partly_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('sent', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "StockSource" AS ENUM ('grn', 'issue', 'transfer_out', 'transfer_in', 'adjustment');

-- CreateEnum
CREATE TYPE "DayMarker" AS ENUM ('work', 'weather', 'holiday', 'no_work');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ReportChannel" AS ENUM ('whatsapp', 'share', 'in_app');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "logo_url" TEXT,
    "language" "Language" NOT NULL DEFAULT 'gu',
    "plan" TEXT NOT NULL DEFAULT 'pilot',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'gu',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sites" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "user_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "rera_no" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "budget_paise" BIGINT,
    "type" "ProjectType" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_nodes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "StructureKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "structure_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_templates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "name_gu" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "work_item_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID,
    "name_gu" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractors" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "trade" TEXT,
    "rate_type" "RateType" NOT NULL DEFAULT 'daily',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name_gu" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "daily_rate_paise" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "contractor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "skill_id" UUID,
    "phone" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "contractor_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "half_day_count" INTEGER NOT NULL DEFAULT 0,
    "ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "photo_id" UUID,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "worker_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'cash',
    "given_by" UUID,
    "settlement_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_settlements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "gross_paise" BIGINT NOT NULL,
    "advances_paise" BIGINT NOT NULL,
    "net_paise" BIGINT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "paid_mode" "PaymentMode",
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "wage_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name_gu" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_material_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "min_stock" DECIMAL(12,3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "site_material_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "gstin" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "IndentStatus" NOT NULL DEFAULT 'submitted',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "needed_by" DATE,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "indents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indent_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "indent_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "indent_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "indent_id" UUID,
    "po_no" TEXT,
    "status" "PoStatus" NOT NULL DEFAULT 'draft',
    "total_paise" BIGINT NOT NULL DEFAULT 0,
    "approved_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "po_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grns" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "supplier_id" UUID,
    "po_id" UUID,
    "challan_no" TEXT,
    "vehicle_no" TEXT,
    "date" DATE NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rate_paise" BIGINT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issues" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "work_item_id" UUID,
    "structure_node_id" UUID,
    "date" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "from_project" UUID NOT NULL,
    "to_project" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'sent',
    "received_by" UUID,
    "received_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty_delta" DECIMAL(12,3) NOT NULL,
    "source_type" "StockSource" NOT NULL,
    "source_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_days" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "marker" "DayMarker" NOT NULL DEFAULT 'work',
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "site_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_progress" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "work_item_id" UUID NOT NULL,
    "structure_node_id" UUID,
    "percent" INTEGER NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "daily_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "assigned_to" UUID,
    "status" "IssueStatus" NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "uploaded" BOOLEAN NOT NULL DEFAULT false,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "proposal" JSONB,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "pdf_key" TEXT,
    "channel" "ReportChannel" NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "company_id" UUID,
    "user_id" UUID,
    "device_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_company_id_server_rev_idx" ON "users"("company_id", "server_rev");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_phone_key" ON "users"("company_id", "phone");

-- CreateIndex
CREATE INDEX "user_sites_company_id_server_rev_idx" ON "user_sites"("company_id", "server_rev");

-- CreateIndex
CREATE UNIQUE INDEX "user_sites_user_id_project_id_key" ON "user_sites"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "projects_company_id_server_rev_idx" ON "projects"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "structure_nodes_project_id_parent_id_idx" ON "structure_nodes"("project_id", "parent_id");

-- CreateIndex
CREATE INDEX "structure_nodes_company_id_server_rev_idx" ON "structure_nodes"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "work_item_templates_company_id_project_type_idx" ON "work_item_templates"("company_id", "project_type");

-- CreateIndex
CREATE INDEX "work_items_company_id_server_rev_idx" ON "work_items"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "contractors_company_id_server_rev_idx" ON "contractors"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "skills_company_id_server_rev_idx" ON "skills"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "contractor_rates_contractor_id_skill_id_effective_from_idx" ON "contractor_rates"("contractor_id", "skill_id", "effective_from");

-- CreateIndex
CREATE INDEX "contractor_rates_company_id_server_rev_idx" ON "contractor_rates"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "workers_company_id_server_rev_idx" ON "workers"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "attendance_entries_company_id_server_rev_idx" ON "attendance_entries"("company_id", "server_rev");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_project_id_date_contractor_id_skill_id_key" ON "attendance_entries"("project_id", "date", "contractor_id", "skill_id");

-- CreateIndex
CREATE INDEX "advances_project_id_contractor_id_date_idx" ON "advances"("project_id", "contractor_id", "date");

-- CreateIndex
CREATE INDEX "advances_company_id_server_rev_idx" ON "advances"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "wage_settlements_company_id_server_rev_idx" ON "wage_settlements"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "materials_company_id_server_rev_idx" ON "materials"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "site_material_settings_company_id_server_rev_idx" ON "site_material_settings"("company_id", "server_rev");

-- CreateIndex
CREATE UNIQUE INDEX "site_material_settings_project_id_material_id_key" ON "site_material_settings"("project_id", "material_id");

-- CreateIndex
CREATE INDEX "suppliers_company_id_server_rev_idx" ON "suppliers"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "indents_company_id_server_rev_idx" ON "indents"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "indent_lines_company_id_server_rev_idx" ON "indent_lines"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "purchase_orders_company_id_server_rev_idx" ON "purchase_orders"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "po_lines_company_id_server_rev_idx" ON "po_lines"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "grns_project_id_date_idx" ON "grns"("project_id", "date");

-- CreateIndex
CREATE INDEX "grns_company_id_server_rev_idx" ON "grns"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "grn_lines_company_id_server_rev_idx" ON "grn_lines"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "material_issues_project_id_date_idx" ON "material_issues"("project_id", "date");

-- CreateIndex
CREATE INDEX "material_issues_company_id_server_rev_idx" ON "material_issues"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "stock_transfers_company_id_server_rev_idx" ON "stock_transfers"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "stock_ledger_project_id_material_id_idx" ON "stock_ledger"("project_id", "material_id");

-- CreateIndex
CREATE INDEX "stock_ledger_source_type_source_id_idx" ON "stock_ledger"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "stock_ledger_company_id_server_rev_idx" ON "stock_ledger"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "site_days_company_id_server_rev_idx" ON "site_days"("company_id", "server_rev");

-- CreateIndex
CREATE UNIQUE INDEX "site_days_project_id_date_key" ON "site_days"("project_id", "date");

-- CreateIndex
CREATE INDEX "daily_progress_project_id_date_idx" ON "daily_progress"("project_id", "date");

-- CreateIndex
CREATE INDEX "daily_progress_company_id_server_rev_idx" ON "daily_progress"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "issues_company_id_server_rev_idx" ON "issues"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "photos_source_type_source_id_idx" ON "photos"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "photos_company_id_server_rev_idx" ON "photos"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "approvals_company_id_status_idx" ON "approvals"("company_id", "status");

-- CreateIndex
CREATE INDEX "approvals_entity_type_entity_id_idx" ON "approvals"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approvals_company_id_server_rev_idx" ON "approvals"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "reports_company_id_date_idx" ON "reports"("company_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "reports_user_id_date_channel_key" ON "reports"("user_id", "date", "channel");

-- CreateIndex
CREATE INDEX "audit_log_company_id_at_idx" ON "audit_log"("company_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_nodes" ADD CONSTRAINT "structure_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_nodes" ADD CONSTRAINT "structure_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "structure_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_rates" ADD CONSTRAINT "contractor_rates_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "indents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sync revision: one global sequence. Every insert or update on a synced table takes the next
-- value, so a phone can pull "everything with server_rev > my last pull" across all tables.
CREATE SEQUENCE "server_rev_seq";

CREATE FUNCTION "set_server_rev"() RETURNS trigger AS $$
BEGIN
  NEW."server_rev" := nextval('server_rev_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'server_rev'
  LOOP
    EXECUTE format('CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION "set_server_rev"()', t);
  END LOOP;
END $$;

-- The audit log is append-only: nobody, the owner included, can change or remove history.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();
