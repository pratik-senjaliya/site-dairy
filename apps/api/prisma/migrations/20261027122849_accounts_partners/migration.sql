-- CreateEnum
CREATE TYPE "MoneyDirection" AS ENUM ('in', 'out');

-- AlterEnum
ALTER TYPE "PaymentMode" ADD VALUE 'cheque';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'partner';

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "buyer_name" TEXT,
    "buyer_phone" TEXT,
    "deal_paise" BIGINT,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID,
    "direction" "MoneyDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "unit_id" UUID,
    "party" TEXT,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "note" TEXT,
    "deleted_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "money_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_project_id_idx" ON "units"("project_id");

-- CreateIndex
CREATE INDEX "units_company_id_server_rev_idx" ON "units"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "money_entries_company_id_project_id_date_idx" ON "money_entries"("company_id", "project_id", "date");

-- CreateIndex
CREATE INDEX "money_entries_unit_id_idx" ON "money_entries"("unit_id");

-- CreateIndex
CREATE INDEX "money_entries_company_id_server_rev_idx" ON "money_entries"("company_id", "server_rev");

-- Every table with server_rev gets the sync trigger (see the init migration).
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "units" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "money_entries" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();

-- Tenant isolation, as in the row_level_security migration.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units', 'money_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (app_sees_company(company_id)) WITH CHECK (app_sees_company(company_id))', t);
  END LOOP;
END $$;
