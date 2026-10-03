import ReviewDialog from "./ReviewDialog";

function ReadingReviewDialogs({
  money,
  promotionDialog,
  reviewActionBusy,
  sourceReviewDialog,
  onCancelPromotion,
  onCancelSourceReview,
  onPromotionCandidateChange,
  onSubmitPromotion,
  onSubmitSourceReview
}) {
  return (
    <>
      <ReviewDialog
        open={Boolean(sourceReviewDialog)}
        eyebrow="Source billing review"
        title={sourceReviewDialog?.action === "approve" ? "Approve source-side bill" : "Reject source-side bill"}
        description={
          sourceReviewDialog
            ? `${sourceReviewDialog.request.customer_name} | ${sourceReviewDialog.request.billing_period_name || "Billing period"} | ${money(sourceReviewDialog.request.amount)}`
            : ""
        }
        confirmLabel={sourceReviewDialog?.action === "approve" ? "Approve and generate" : "Reject request"}
        reasonLabel={sourceReviewDialog?.action === "approve" ? "Approval notes" : "Rejection reason"}
        reasonPlaceholder={
          sourceReviewDialog?.action === "approve"
            ? "Add approval notes for the billing audit trail"
            : "Explain why this source-side bill is being rejected"
        }
        initialReason={sourceReviewDialog?.action === "approve" ? sourceReviewDialog.request.reason || "" : ""}
        reasonRequired={sourceReviewDialog?.action === "reject"}
        busy={reviewActionBusy}
        danger={sourceReviewDialog?.action === "reject"}
        onCancel={onCancelSourceReview}
        onConfirm={onSubmitSourceReview}
      />
      <ReviewDialog
        open={Boolean(promotionDialog)}
        eyebrow="Payment bill selection"
        title={promotionDialog?.mode === "competing" ? "Promote a client bill" : "Promote bill for payment"}
        description="The selected bill will become payable and the current payable bill will be held."
        confirmLabel="Promote bill"
        reasonLabel="Promotion reason"
        reasonPlaceholder="Explain why this bill should become payable"
        reasonRequired
        busy={reviewActionBusy}
        onCancel={onCancelPromotion}
        onConfirm={onSubmitPromotion}
      >
        {promotionDialog?.mode === "competing" ? (
          <label>
            Bill to promote
            <select
              value={promotionDialog.selectedBillId}
              onChange={(event) => onPromotionCandidateChange(event.target.value)}
              disabled={reviewActionBusy}
              required
            >
              {promotionDialog.candidates.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.bill_number || `Bill ${bill.id}`} | {money(bill.total_amount)} | {bill.bill_pay_status}
                </option>
              ))}
            </select>
          </label>
        ) : promotionDialog?.candidates[0] ? (
          <div className="reading-context">
            <div>
              <small>Bill</small>
              <strong>{promotionDialog.candidates[0].bill_number || `Bill ${promotionDialog.candidates[0].id}`}</strong>
            </div>
          </div>
        ) : null}
      </ReviewDialog>
    </>
  );
}

export default ReadingReviewDialogs;
