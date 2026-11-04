-- CreateTable
CREATE TABLE "contract_works" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "contract_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_measures" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "place" TEXT,
    "note" TEXT,
    "settlement_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "work_measures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_stages" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "reached_on" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "pay_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_works_project_id_contractor_id_idx" ON "contract_works"("project_id", "contractor_id");

-- CreateIndex
CREATE INDEX "contract_works_company_id_server_rev_idx" ON "contract_works"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "work_measures_project_id_contractor_id_date_idx" ON "work_measures"("project_id", "contractor_id", "date");

-- CreateIndex
CREATE INDEX "work_measures_work_id_idx" ON "work_measures"("work_id");

-- CreateIndex
CREATE INDEX "work_measures_company_id_server_rev_idx" ON "work_measures"("company_id", "server_rev");

-- CreateIndex
CREATE INDEX "pay_stages_project_id_idx" ON "pay_stages"("project_id");

-- CreateIndex
CREATE INDEX "pay_stages_company_id_server_rev_idx" ON "pay_stages"("company_id", "server_rev");

-- Every table with server_rev gets the sync trigger (see the init migration).
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "contract_works" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "work_measures" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "pay_stages" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();

-- Tenant isolation, as in the row_level_security migration.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_works', 'work_measures', 'pay_stages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (app_sees_company(company_id)) WITH CHECK (app_sees_company(company_id))', t);
  END LOOP;
END $$;
