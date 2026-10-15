-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "project_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'bank',
    "reference" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "server_rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_date_idx" ON "supplier_payments"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "supplier_payments_company_id_server_rev_idx" ON "supplier_payments"("company_id", "server_rev");

-- Every table with server_rev gets the sync trigger (see the init migration).
CREATE TRIGGER "set_server_rev" BEFORE INSERT OR UPDATE ON "supplier_payments" FOR EACH ROW EXECUTE FUNCTION "set_server_rev"();
