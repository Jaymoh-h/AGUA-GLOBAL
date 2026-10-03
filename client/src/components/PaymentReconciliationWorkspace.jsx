import { FileUp, RotateCcw, Save } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import PaymentReconciliationHistory from "./PaymentReconciliationHistory";
import PaymentReconciliationMapping from "./PaymentReconciliationMapping";
import PaymentReconciliationReview from "./PaymentReconciliationReview";
import PaymentReconciliationSource from "./PaymentReconciliationSource";
import PaymentReconciliationValidation from "./PaymentReconciliationValidation";

const bankFieldOptions = [
  { key: "", label: "Select field" },
  { key: "payment_date", label: "Payment date" },
  { key: "amount", label: "Amount paid" },
  { key: "acc_number", label: "Customer account number" },
  { key: "external_reference", label: "Reference / transaction ID" },
  { key: "transaction_status", label: "Transaction status" },
  { key: "received_from", label: "Payer name" },
  { key: "narration", label: "Narration / description" },
  { key: "receipt_number", label: "Receipt number" },
  { key: "notes", label: "Notes" }
];

const bankFlowStages = ["Source", "Map columns", "Match customers", "Validate & import"];

function PaymentReconciliationWorkspace({
  bankCsvText,
  bankHeaders,
  bankImportHistory,
  bankMapping,
  bankPaymentChannel,
  bankPdfFile,
  bankPdfNeedsPassword,
  bankPdfPassword,
  bankProfileName,
  bankProfileSaving,
  bankProfiles,
  bankReviewRows,
  bankRows,
  bankSourceName,
  bankStage,
  customers,
  date,
  importing,
  importPreview,
  importReady,
  money,
  mpesaIntegration,
  onAccountChange,
  onChannelChange,
  onCsvChange,
  onDetect,
  onFileChange,
  onIgnoreUnresolved,
  onMappingChange,
  onPdfPasswordChange,
  onPreview,
  onProfileChange,
  onProfileNameChange,
  onReadPdf,
  onRequestCommit,
  onReset,
  onReview,
  onRowChange,
  onRestoreIgnored,
  onSaveTemplate,
  onStageChange,
  onUseRows,
  statementConfidenceLabel,
  statementRowStatus
}) {
  const readyCount = bankReviewRows.filter((row) => statementRowStatus(row) === "ready").length;

  return (
    <CollapsibleSection
      actions={
        <div className="row-actions">
          <button type="button" onClick={onReset}>
            <RotateCcw size={16} />
            Start over
          </button>
          {bankStage === 2 ? (
            <button type="button" onClick={onSaveTemplate} disabled={!bankHeaders.length || bankProfileSaving}>
              <Save size={16} />
              {bankProfileSaving ? "Saving..." : "Save mapping"}
            </button>
          ) : null}
        </div>
      }
      className="form-grid bank-trainer-panel"
      defaultOpen={bankStage > 1 || Boolean(bankHeaders.length || bankReviewRows.length)}
      icon={<FileUp size={18} />}
      summary={`Step ${bankStage} of 4 | ${bankRows.length.toLocaleString()} row(s) | ${readyCount.toLocaleString()} ready`}
      title="Reconcile Incoming Payments"
    >
      <div className="bank-flow-steps" role="list" aria-label="Bank reconciliation progress">
        {bankFlowStages.map((stageLabel, index) => {
          const step = index + 1;
          return (
            <button
              className={step === bankStage ? "active" : step < bankStage ? "complete" : ""}
              type="button"
              key={stageLabel}
              onClick={() => onStageChange(step)}
              disabled={step > bankStage}
              aria-current={step === bankStage ? "step" : undefined}
            >
              <span>{step}</span>
              {stageLabel}
            </button>
          );
        })}
      </div>

      {bankStage === 1 ? (
        <PaymentReconciliationSource
          bankCsvText={bankCsvText}
          bankPaymentChannel={bankPaymentChannel}
          bankPdfFile={bankPdfFile}
          bankPdfNeedsPassword={bankPdfNeedsPassword}
          bankPdfPassword={bankPdfPassword}
          bankProfileName={bankProfileName}
          bankProfiles={bankProfiles}
          mpesaIntegration={mpesaIntegration}
          onChannelChange={onChannelChange}
          onCsvChange={onCsvChange}
          onDetect={onDetect}
          onFileChange={onFileChange}
          onPdfPasswordChange={onPdfPasswordChange}
          onProfileChange={onProfileChange}
          onProfileNameChange={onProfileNameChange}
          onReadPdf={onReadPdf}
        />
      ) : null}

      {bankStage === 2 && bankHeaders.length ? (
        <PaymentReconciliationMapping
          bankHeaders={bankHeaders}
          bankMapping={bankMapping}
          fieldOptions={bankFieldOptions}
          onBack={() => onStageChange(1)}
          onMappingChange={onMappingChange}
          onReview={onReview}
        />
      ) : null}

      {bankStage === 3 && bankReviewRows.length ? (
        <PaymentReconciliationReview
          bankReviewRows={bankReviewRows}
          customers={customers}
          onAccountChange={onAccountChange}
          onBack={() => onStageChange(2)}
            onIgnoreUnresolved={onIgnoreUnresolved}
          onRowChange={onRowChange}
          onRestoreIgnored={onRestoreIgnored}
          onValidate={onUseRows}
          statementConfidenceLabel={statementConfidenceLabel}
          statementRowStatus={statementRowStatus}
        />
      ) : null}

      {bankStage === 4 ? (
        <PaymentReconciliationValidation
          bankReviewRows={bankReviewRows}
          importing={importing}
          importPreview={importPreview}
          importReady={importReady}
          money={money}
          onBack={() => onStageChange(3)}
          onPreview={onPreview}
          onRequestCommit={onRequestCommit}
          sourceName={bankSourceName}
          statementRowStatus={statementRowStatus}
        />
      ) : null}

      {bankStage === 1 ? <PaymentReconciliationHistory date={date} history={bankImportHistory} money={money} /> : null}
    </CollapsibleSection>
  );
}

export default PaymentReconciliationWorkspace;
