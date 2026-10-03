import ReviewDialog from "./ReviewDialog";

function PaymentReviewDialogs({
  customers,
  importPreview,
  importing,
  importReviewOpen,
  importSourceName,
  money,
  onCloseImportReview,
  onClosePaymentReview,
  onCommitImport,
  onConfirmPaymentSubmission,
  onConfirmPaymentReview,
  onReapplyCustomerChange,
  reapplyCustomerId,
  reviewAction,
  reviewBusy,
  reviewError,
  adjustmentReview,
  adjustmentReviewBusy,
  onCloseAdjustmentReview,
  onConfirmAdjustmentReview,
  paymentSubmissionReview,
  paymentSubmitting,
  onClosePaymentSubmission
}) {
  const validImportRows = Number(importPreview?.summary?.valid || 0).toLocaleString();

  return (
    <>
      <ReviewDialog
        open={Boolean(adjustmentReview)}
        eyebrow="Manual adjustment review"
        title={adjustmentReview?.status === "approved" ? `Approve ${adjustmentReview.adjustment.adjustment_type} adjustment` : `Reject ${adjustmentReview?.adjustment.adjustment_type || "manual"} adjustment`}
        description={
          adjustmentReview?.status === "approved"
            ? adjustmentReview.adjustment.adjustment_type === "credit"
              ? "Approval creates a manual-adjustment receipt and applies it under the existing payment-allocation rules."
              : "Approval creates a debit bill for the customer. It does not post a cash or bank receipt."
            : "Rejection closes this request without creating a receipt, bill, payment allocation, or balance change."
        }
        confirmLabel={adjustmentReview?.status === "approved" ? "Approve adjustment" : "Reject adjustment"}
        cancelLabel="Keep pending"
        reasonLabel={adjustmentReview?.status === "approved" ? "Approval note" : "Rejection reason"}
        reasonPlaceholder={adjustmentReview?.status === "approved" ? "Record the authority or evidence for this adjustment" : "Explain why this request cannot be approved"}
        reasonRequired
        busy={adjustmentReviewBusy}
        busyLabel={adjustmentReview?.status === "approved" ? "Approving..." : "Rejecting..."}
        danger={adjustmentReview?.status === "rejected"}
        onCancel={onCloseAdjustmentReview}
        onConfirm={onConfirmAdjustmentReview}
      >
        <div className="review-summary-grid">
          <div><span>Customer</span><strong>{adjustmentReview?.adjustment.customer_name || "-"}</strong><small>{adjustmentReview?.adjustment.acc_number || "-"}</small></div>
          <div><span>Type</span><strong>{adjustmentReview?.adjustment.adjustment_type || "-"}</strong></div>
          <div><span>Amount</span><strong>{money(adjustmentReview?.adjustment.amount)}</strong></div>
          <div><span>Adjustment date</span><strong>{adjustmentReview?.adjustment.adjustment_date?.slice(0, 10) || "-"}</strong></div>
        </div>
        <div className="review-message-preview"><span>Requested reason</span><p>{adjustmentReview?.adjustment.reason || "-"}</p></div>
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(paymentSubmissionReview)}
        eyebrow="Payment allocation review"
        title={paymentSubmissionReview?.editingId ? "Save payment correction" : "Record payment"}
        description={
          paymentSubmissionReview
            ? paymentSubmissionReview.editingId
              ? "This updates the posted receipt using the reviewed values. The correction reason is retained in the payment audit trail."
              : paymentSubmissionReview.allocationAccounts?.length
                ? "This creates one receipt and applies the reviewed shares oldest-first to each selected customer account."
                : "This creates a receipt and applies the reviewed amount to the customer's payable balance. Any remainder becomes customer credit."
            : ""
        }
        confirmLabel={paymentSubmissionReview?.editingId ? "Save correction" : "Record payment"}
        cancelLabel="Return to payment"
        reasonLabel={null}
        busy={paymentSubmitting}
        busyLabel={paymentSubmissionReview?.editingId ? "Saving..." : "Posting..."}
        onCancel={onClosePaymentSubmission}
        onConfirm={onConfirmPaymentSubmission}
      >
        <div className="review-summary-grid">
          <div><span>Customer</span><strong>{paymentSubmissionReview?.customer?.name || "-"}</strong><small>{paymentSubmissionReview?.customer?.acc_number || "-"}</small></div>
          <div><span>Amount due before</span><strong>{money(paymentSubmissionReview?.balanceDue)}</strong></div>
          <div><span>Receipt amount</span><strong>{money(paymentSubmissionReview?.amount)}</strong></div>
          <div><span>{paymentSubmissionReview?.allocationAccounts?.length ? `${paymentSubmissionReview.customer.acc_number} applied to due` : "Applied to due"}</span><strong>{money(paymentSubmissionReview?.amountToBalance)}</strong></div>
          <div><span>{paymentSubmissionReview?.allocationAccounts?.length ? `${paymentSubmissionReview.customer.acc_number} credit` : "Customer credit"}</span><strong>{money(paymentSubmissionReview?.amountToCredit)}</strong></div>
          <div><span>Channel</span><strong>{String(paymentSubmissionReview?.form?.payment_channel || "-").replaceAll("_", " ")}</strong></div>
          <div><span>Payment date</span><strong>{paymentSubmissionReview?.form?.payment_date || "-"}</strong></div>
          <div><span>Reference</span><strong>{paymentSubmissionReview?.form?.external_reference || paymentSubmissionReview?.form?.receipt_number || "Auto-generated"}</strong></div>
        </div>
        {paymentSubmissionReview?.allocationAccounts?.length ? (
          <div className="review-message-preview">
            <span>Account allocation plan</span>
            <p>{paymentSubmissionReview.allocationAccounts.map((allocation) => `${allocation.acc_number}: ${money(allocation.amount)}`).join(" | ")}</p>
          </div>
        ) : null}
        {paymentSubmissionReview?.editingId ? <div className="review-message-preview"><span>Correction reason</span><p>{paymentSubmissionReview.form.correction_reason || "-"}</p></div> : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(reviewAction)}
        eyebrow={reviewAction?.type === "reapply" ? "Resolve suspense" : "Review payment action"}
        title={reviewAction?.type === "void" ? `Void receipt ${reviewAction.item.receipt_number || reviewAction.item.id}` : reviewAction?.type === "reapply" ? `Reapply suspense item #${reviewAction.item.id}` : `Discard suspense item #${reviewAction?.item.id}`}
        description={reviewAction?.type === "void" ? `This moves ${money(reviewAction.item.amount)} to suspense and removes it from the customer's posted payments.` : reviewAction?.type === "reapply" ? `Create a new ${money(reviewAction.item.amount)} payment against the selected customer account.` : reviewAction ? `This permanently resolves the held ${money(reviewAction.item.amount)} item without creating a new payment.` : ""}
        confirmLabel={reviewAction?.type === "void" ? "Void payment" : reviewAction?.type === "reapply" ? "Reapply payment" : "Discard item"}
        reasonLabel={reviewAction?.type === "reapply" ? "Reapplication notes" : "Audit reason"}
        reasonPlaceholder={reviewAction?.type === "reapply" ? "Add optional context for this reapplication" : "Explain why this action is required"}
        initialReason={reviewAction?.type === "reapply" ? `Reapplied suspense item #${reviewAction.item.id}` : ""}
        reasonRequired={reviewAction?.type !== "reapply"}
        busy={reviewBusy}
        danger={reviewAction?.type !== "reapply"}
        onCancel={onClosePaymentReview}
        onConfirm={onConfirmPaymentReview}
      >
        {reviewAction?.type === "reapply" ? (
          <label>
            Customer account
            <select value={reapplyCustomerId} onChange={(event) => onReapplyCustomerChange(event.target.value)} disabled={reviewBusy} required>
              <option value="">Select customer account</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.acc_number} - {customer.name}</option>)}
            </select>
          </label>
        ) : null}
        {reviewError ? <p className="form-error" role="alert">{reviewError}</p> : null}
      </ReviewDialog>
      <ReviewDialog
        open={importReviewOpen}
        eyebrow="Commit payment batch"
        title={`Post ${validImportRows} payment(s)?`}
        description="This creates receipts, allocates the payments to payable bills, and records an immutable batch summary. Revalidation runs again before posting."
        confirmLabel={`Post ${validImportRows} payment(s)`}
        reasonLabel={null}
        busy={importing}
        busyLabel="Posting batch..."
        onCancel={onCloseImportReview}
        onConfirm={onCommitImport}
      >
        <div className="reading-context">
          <div><span>Validated rows</span><strong>{validImportRows}</strong></div>
          <div><span>Payment total</span><strong>{money(importPreview?.summary?.totalAmount)}</strong></div>
          <div><span>Source</span><strong>{importSourceName()}</strong></div>
        </div>
      </ReviewDialog>
    </>
  );
}

export default PaymentReviewDialogs;
