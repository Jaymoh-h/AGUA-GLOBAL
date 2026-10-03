import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Check,
  CircleDollarSign,
  CreditCard,
  FilePenLine,
  Plus,
  Search,
  Smartphone,
  UserRound,
  X
} from "lucide-react";

const CHANNELS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank", label: "Bank", icon: Building2 },
  { value: "mpesa_paybill", label: "M-Pesa", icon: Smartphone },
  { value: "manual_adjustment", label: "Adjustment", icon: FilePenLine }
];

const REFERENCE_LABELS = {
  cash: "Cash reference",
  bank: "Bank slip/reference",
  mpesa_paybill: "M-Pesa transaction code",
  manual_adjustment: "Adjustment reference"
};

const moneyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function customerPhone(customer) {
  return customer?.phone || customer?.phone_number || customer?.mobile || "";
}

function formatMoney(value) {
  const amount = Number(value);
  return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function customerBalance(customer) {
  const balance = Number(customer?.balance_due || 0);
  return Number.isFinite(balance) ? balance : 0;
}

export default function PaymentEntryFlow({
  form,
  customers,
  recentCustomerIds = [],
  editingId,
  submitting,
  reviewing = false,
  onFieldChange,
  onSubmit,
  onCancelEdit
}) {
  const searchId = useId();
  const [stage, setStage] = useState(form?.customer_id ? 2 : 1);
  const [customerSearch, setCustomerSearch] = useState("");

  const customerList = Array.isArray(customers) ? customers : [];
  const customerId = String(form?.customer_id ?? "");
  const selectedCustomer = customerList.find((customer) => String(customer.id) === customerId);
  const amount = Number(form?.amount || 0);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const balance = customerBalance(selectedCustomer);
  const amountToBalance = Math.min(validAmount ? amount : 0, Math.max(balance, 0));
  const amountToCredit = Math.max((validAmount ? amount : 0) - amountToBalance, 0);
  const crossAccountAllocations = Array.isArray(form?.cross_account_allocations)
    ? form.cross_account_allocations
    : [];
  const splitAmount = crossAccountAllocations.reduce((sum, allocation) => sum + Number(allocation?.amount || 0), 0);
  const primaryAllocation = Math.max((validAmount ? amount : 0) - splitAmount, 0);
  const splitOverAmount = splitAmount - (validAmount ? amount : 0) > 0.005;
  const splitHasIncompleteLine = crossAccountAllocations.some(
    (allocation) => !allocation?.customer_id || !Number.isFinite(Number(allocation?.amount)) || Number(allocation.amount) <= 0
  );
  const channel = CHANNELS.find((item) => item.value === form?.payment_channel) || CHANNELS[0];
  const referenceLabel = REFERENCE_LABELS[channel.value];

  const recentOrder = useMemo(
    () => new Map(recentCustomerIds.map((id, index) => [String(id), index])),
    [recentCustomerIds]
  );

  const matchingCustomers = useMemo(() => {
    const query = normalize(customerSearch);

    return customerList
      .filter((customer) => {
        if (!query) return true;
        return [customer.acc_number, customer.name, customerPhone(customer)]
          .some((value) => normalize(value).includes(query));
      })
      .sort((left, right) => {
        const leftRecent = recentOrder.get(String(left.id));
        const rightRecent = recentOrder.get(String(right.id));
        if (leftRecent !== undefined || rightRecent !== undefined) {
          if (leftRecent === undefined) return 1;
          if (rightRecent === undefined) return -1;
          return leftRecent - rightRecent;
        }
        return normalize(left.acc_number || left.name).localeCompare(normalize(right.acc_number || right.name));
      });
  }, [customerList, customerSearch, recentOrder]);
  const visibleCustomers = matchingCustomers.slice(0, 12);
  const referenceRequired = channel.value !== "cash";
  const correctionReason = String(form?.correction_reason ?? "");
  const correctionReasonMissing = Boolean(editingId) && !correctionReason.trim();
  const ChannelIcon = channel.icon;
  const busy = submitting || reviewing;

  useEffect(() => {
    setStage(customerId ? 2 : 1);
    setCustomerSearch("");
  }, [editingId]);

  useEffect(() => {
    setStage(customerId ? 2 : 1);
    if (!customerId) setCustomerSearch("");
  }, [customerId]);

  const selectCustomer = (customer) => {
    if (editingId) return;
    onFieldChange("customer_id", String(customer.id));
    setStage(2);
  };

  const updateSplitAllocation = (index, field, value) => {
    onFieldChange(
      "cross_account_allocations",
      crossAccountAllocations.map((allocation, allocationIndex) =>
        allocationIndex === index ? { ...allocation, [field]: value } : allocation
      )
    );
  };

  const removeSplitAllocation = (index) => {
    onFieldChange("cross_account_allocations", crossAccountAllocations.filter((_, allocationIndex) => allocationIndex !== index));
  };

  const addSplitAllocation = () => {
    const assignedIds = new Set([customerId, ...crossAccountAllocations.map((allocation) => String(allocation?.customer_id || ""))]);
    const nextCustomer = customerList.find((customer) => !assignedIds.has(String(customer.id)));
    if (!nextCustomer) return;
    onFieldChange("cross_account_allocations", [
      ...crossAccountAllocations,
      { customer_id: String(nextCustomer.id), amount: "" }
    ]);
  };

  const moveToStage = (nextStage) => {
    if (nextStage === 1 || (nextStage === 2 && selectedCustomer) || (nextStage === 3 && selectedCustomer && validAmount)) {
      setStage(nextStage);
    }
  };

  const handleAmountKeyDown = (event) => {
    if (event.key === "Enter" && validAmount) {
      event.preventDefault();
      setStage(3);
    }
  };

  return (
    <form className="form-grid payment-flow" onSubmit={onSubmit}>
      <nav className="payment-flow-steps" aria-label="Payment entry progress">
        {[
          [1, "Customer"],
          [2, "Amount"],
          [3, "Payment details"]
        ].map(([step, label]) => {
          const unavailable = (step === 2 && !selectedCustomer) || (step === 3 && (!selectedCustomer || !validAmount));
          return (
            <button
              key={step}
              type="button"
              className={`payment-flow-step${stage === step ? " active" : ""}${stage > step ? " complete" : ""}`}
              aria-current={stage === step ? "step" : undefined}
              disabled={unavailable || busy}
              onClick={() => moveToStage(step)}
            >
              <span aria-hidden="true">{stage > step ? <Check size={15} /> : step}</span>
              {label}
            </button>
          );
        })}
      </nav>

      {stage === 1 ? (
        <section className="payment-flow-stage" aria-labelledby={`${searchId}-customer-title`}>
          <header className="payment-flow-stage-header">
            <UserRound size={19} aria-hidden="true" />
            <div>
              <h3 id={`${searchId}-customer-title`}>Choose the customer account</h3>
            </div>
          </header>

          {editingId && selectedCustomer ? (
            <div className="payment-flow-selected-customer">
              <div>
                <strong>{selectedCustomer.name}</strong>
                <span>{selectedCustomer.acc_number}</span>
              </div>
              <small>Customer is fixed while editing a payment.</small>
            </div>
          ) : (
            <>
              <label htmlFor={searchId}>Find customer</label>
              <div className="payment-flow-search">
                <Search size={17} aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="Account, name, or phone"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="payment-flow-customer-list" aria-live="polite">
                {visibleCustomers.map((customer) => {
                  const phone = customerPhone(customer);
                  const customerPosition = customerBalance(customer);
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      className="payment-flow-customer"
                      onClick={() => selectCustomer(customer)}
                      disabled={busy}
                    >
                      <span>
                        <strong>{customer.name}</strong>
                        <small>{customer.acc_number}{phone ? ` | ${phone}` : ""}</small>
                      </span>
                      <span className="payment-flow-customer-balance">
                        <small>
                          {recentOrder.has(String(customer.id)) ? "Recent | " : ""}
                          {customerPosition < 0 ? "Credit" : "Due"}
                        </small>
                        <strong>{formatMoney(Math.abs(customerPosition))}</strong>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  );
                })}
                {!matchingCustomers.length ? <p className="muted">No customers match this search.</p> : null}
                {matchingCustomers.length > visibleCustomers.length ? (
                  <small className="payment-flow-result-count">{matchingCustomers.length - visibleCustomers.length} additional matches</small>
                ) : null}
              </div>
            </>
          )}

          {editingId && selectedCustomer ? (
            <button className="primary-button" type="button" onClick={() => setStage(2)} disabled={busy}>
              Continue to amount
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          ) : null}
        </section>
      ) : null}

      {stage === 2 && selectedCustomer ? (
        <section className="payment-flow-stage" aria-labelledby={`${searchId}-amount-title`}>
          <header className="payment-flow-stage-header">
            <CircleDollarSign size={19} aria-hidden="true" />
            <div>
              <h3 id={`${searchId}-amount-title`}>Enter payment amount</h3>
              <p className="muted">{selectedCustomer.name} | {selectedCustomer.acc_number}</p>
            </div>
          </header>

          <div className="balance-note payment-flow-balance">
            <span>{balance < 0 ? "Customer credit" : "Outstanding balance"}</span>
            <strong>{formatMoney(Math.abs(balance))}</strong>
          </div>

          <label>
            Amount
            <input
              value={form?.amount ?? ""}
              onChange={(event) => onFieldChange("amount", event.target.value)}
              onKeyDown={handleAmountKeyDown}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              autoFocus
            />
          </label>

          {balance > 0 ? (
            <button
              className="payment-flow-pay-balance"
              type="button"
              onClick={() => onFieldChange("amount", String(Math.round(balance * 100) / 100))}
              disabled={busy}
            >
              <CreditCard size={17} aria-hidden="true" />
              Pay full balance ({formatMoney(balance)})
            </button>
          ) : null}

          <div className="payment-flow-allocation" aria-label="Payment allocation preview">
            <div>
              <span>Applied to balance</span>
              <strong>{formatMoney(amountToBalance)}</strong>
            </div>
            <div>
              <span>Customer credit</span>
              <strong>{formatMoney(amountToCredit)}</strong>
            </div>
          </div>

          {!editingId ? (
            <details className="payment-flow-optional payment-flow-cross-account">
              <summary>Split across other customer accounts</summary>
              <div className="payment-flow-split-copy">
                <p className="muted">Use one receipt to settle payable bills for related accounts. Each share is applied oldest-first and cannot exceed that account's payable balance.</p>
                <div className="payment-flow-split-primary">
                  <span>{selectedCustomer.acc_number} remains on this receipt</span>
                  <strong>{formatMoney(primaryAllocation)}</strong>
                </div>
              </div>
              <div className="payment-flow-split-list">
                {crossAccountAllocations.map((allocation, index) => {
                  const selectedAllocationId = String(allocation?.customer_id || "");
                  return (
                    <div className="payment-flow-split-line" key={`${selectedAllocationId}-${index}`}>
                      <label>
                        Customer account
                        <select
                          value={selectedAllocationId}
                          onChange={(event) => updateSplitAllocation(index, "customer_id", event.target.value)}
                          disabled={busy}
                        >
                          {customerList
                            .filter(
                              (customer) =>
                                String(customer.id) !== customerId &&
                                (String(customer.id) === selectedAllocationId ||
                                  !crossAccountAllocations.some(
                                    (other, otherIndex) => otherIndex !== index && String(other?.customer_id || "") === String(customer.id)
                                  ))
                            )
                            .map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.acc_number} | {customer.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Amount
                        <input
                          inputMode="decimal"
                          min="0.01"
                          onChange={(event) => updateSplitAllocation(index, "amount", event.target.value)}
                          step="0.01"
                          type="number"
                          value={allocation?.amount ?? ""}
                          disabled={busy}
                        />
                      </label>
                      <button type="button" onClick={() => removeSplitAllocation(index)} disabled={busy} aria-label="Remove split account" title="Remove split account">
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className="payment-flow-add-split" type="button" onClick={addSplitAllocation} disabled={busy || crossAccountAllocations.length >= 11 || customerList.length <= 1}>
                <Plus size={16} />
                Add account
              </button>
              {splitOverAmount ? <p className="form-error">Split amounts cannot exceed the payment amount.</p> : null}
              {crossAccountAllocations.length && splitHasIncompleteLine ? <p className="form-error">Complete each split account and amount before recording the receipt.</p> : null}
            </details>
          ) : null}

          <div className="form-actions payment-flow-actions">
            <button type="button" onClick={() => setStage(1)} disabled={busy}>
              <ArrowLeft size={17} aria-hidden="true" />
              Customer
            </button>
            <button
              className="primary-button"
              type="button"
              aria-label="Continue to payment details"
              onClick={() => setStage(3)}
              disabled={!validAmount || busy || splitOverAmount || splitHasIncompleteLine}
            >
              Payment details
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {stage === 3 && selectedCustomer ? (
        <section className="payment-flow-stage" aria-labelledby={`${searchId}-details-title`}>
          <header className="payment-flow-stage-header">
            <ChannelIcon size={19} aria-hidden="true" />
            <div>
              <h3 id={`${searchId}-details-title`}>Payment details</h3>
              <p className="muted">{selectedCustomer.acc_number} | {formatMoney(amount)}</p>
            </div>
          </header>

          <fieldset className="payment-flow-channel-fieldset">
            <legend>Payment channel</legend>
            <div className="payment-flow-segments">
              {CHANNELS.map((item) => {
                const Icon = item.icon;
                const selected = item.value === channel.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={selected ? "active" : ""}
                    aria-pressed={selected}
                    onClick={() => onFieldChange("payment_channel", item.value)}
                    disabled={busy}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="payment-flow-core-fields">
            <label>
              Payment date
              <input
                value={form?.payment_date ?? ""}
                onChange={(event) => onFieldChange("payment_date", event.target.value)}
                type="date"
                required
              />
            </label>
            <label>
              {referenceLabel}
              <input
                value={form?.external_reference ?? ""}
                onChange={(event) => onFieldChange("external_reference", event.target.value)}
                required={referenceRequired}
                autoComplete="off"
              />
            </label>
          </div>

          {editingId ? (
            <label className="payment-flow-correction-reason">
              Correction reason
              <textarea
                value={correctionReason}
                onChange={(event) => onFieldChange("correction_reason", event.target.value)}
                rows="3"
                required
                aria-required="true"
                placeholder="Explain why this posted payment is being corrected"
              />
              <small className="form-note">Required for the payment audit trail.</small>
            </label>
          ) : null}

          <details className="payment-flow-optional">
            <summary>Receipt, payer, and notes</summary>
            <div className="payment-flow-optional-fields">
              <label>
                Receipt number
                <input
                  value={form?.receipt_number ?? ""}
                  onChange={(event) => onFieldChange("receipt_number", event.target.value)}
                  placeholder="Auto-generated if blank"
                  autoComplete="off"
                  disabled={Boolean(editingId)}
                />
              </label>
              <label>
                Received from
                <input
                  value={form?.received_from ?? ""}
                  onChange={(event) => onFieldChange("received_from", event.target.value)}
                  placeholder={selectedCustomer.name}
                  autoComplete="name"
                />
              </label>
              <label>
                Notes
                <textarea
                  value={form?.notes ?? ""}
                  onChange={(event) => onFieldChange("notes", event.target.value)}
                  rows="2"
                />
              </label>
            </div>
          </details>

          <div
            className="payment-flow-confirmation"
            aria-label={editingId ? "Payment correction confirmation summary" : "Payment confirmation summary"}
          >
            {editingId ? (
              <div>
                <span>Action</span>
                <strong>Correct posted payment</strong>
              </div>
            ) : null}
            <div>
              <span>Customer</span>
              <strong>{selectedCustomer.name}</strong>
              <small>{selectedCustomer.acc_number}</small>
            </div>
            <div>
              <span>Amount</span>
              <strong>{formatMoney(amount)}</strong>
            </div>
            <div>
              <span>Channel</span>
              <strong>{channel.label}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{form?.payment_date || "Not set"}</strong>
            </div>
            {amountToCredit > 0 ? (
              <p className="form-note">{formatMoney(amountToCredit)} will remain on the customer account as credit.</p>
            ) : null}
          </div>

          <div className="form-actions payment-flow-actions">
            <button type="button" onClick={() => setStage(2)} disabled={busy}>
              <ArrowLeft size={17} aria-hidden="true" />
              Amount
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={
                busy ||
                !selectedCustomer ||
                !validAmount ||
                !form?.payment_date ||
                correctionReasonMissing ||
                splitOverAmount ||
                splitHasIncompleteLine ||
                (referenceRequired && !String(form?.external_reference || "").trim())
              }
            >
              {editingId ? <FilePenLine size={17} aria-hidden="true" /> : <CircleDollarSign size={17} aria-hidden="true" />}
              {submitting ? "Saving..." : reviewing ? "Review open" : editingId ? "Save payment" : "Record payment"}
            </button>
          </div>

          {editingId ? (
            <button className="payment-flow-cancel" type="button" onClick={onCancelEdit} disabled={busy}>
              Cancel edit
            </button>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
