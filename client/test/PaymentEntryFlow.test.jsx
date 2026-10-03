import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaymentEntryFlow from "../src/components/PaymentEntryFlow.jsx";
import PaymentReviewDialogs from "../src/components/PaymentReviewDialogs.jsx";

const customer = {
  id: 1,
  acc_number: "AG-0001",
  balance_due: 100,
  name: "Green Valley School",
  phone: "0700000000"
};
const relatedCustomer = {
  id: 2,
  acc_number: "AG-0002",
  balance_due: 80,
  name: "Kiptoo Stores",
  phone: "0700000001"
};

function PaymentFlowHarness({ customers = [customer], editingId, initialForm, onSubmit = vi.fn() }) {
  const [form, setForm] = useState(initialForm);

  return (
    <PaymentEntryFlow
      form={form}
      customers={customers}
      editingId={editingId}
      onCancelEdit={vi.fn()}
      onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    />
  );
}

afterEach(cleanup);

describe("Payment entry safeguards", () => {
  it("shows the due allocation and customer-credit remainder before review", () => {
    render(
      <PaymentFlowHarness
        initialForm={{ customer_id: "1", amount: "125", payment_channel: "cash", payment_date: "2026-09-20" }}
      />
    );

    const allocation = screen.getByLabelText("Payment allocation preview");
    expect(within(allocation).getByText("Applied to balance").parentElement).toHaveTextContent("Ksh 100.00");
    expect(within(allocation).getByText("Customer credit").parentElement).toHaveTextContent("Ksh 25.00");
  });

  it("requires an external reference for M-Pesa before payment review", () => {
    const onSubmit = vi.fn();
    render(
      <PaymentFlowHarness
        initialForm={{ customer_id: "1", amount: "100", payment_channel: "cash", payment_date: "2026-09-20" }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue to payment details" }));
    fireEvent.click(screen.getByRole("button", { name: "M-Pesa" }));

    const submit = screen.getByRole("button", { name: "Record payment" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("M-Pesa transaction code"), { target: { value: "QWE123XYZ" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ external_reference: "QWE123XYZ", payment_channel: "mpesa_paybill" }));
  });

  it("requires an audit reason before saving a payment correction", () => {
    render(
      <PaymentFlowHarness
        editingId={41}
        initialForm={{ customer_id: "1", amount: "100", payment_channel: "bank", payment_date: "2026-09-20", external_reference: "BANK-41", correction_reason: "" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue to payment details" }));
    const submit = screen.getByRole("button", { name: "Save payment" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: /Correction reason/ }), { target: { value: "Correct bank reference" } });
    expect(submit).toBeEnabled();
  });

  it("holds a split receipt to its entered amount and exposes the recipient account", () => {
    render(
      <PaymentFlowHarness
        customers={[customer, relatedCustomer]}
        initialForm={{ customer_id: "1", amount: "100", payment_channel: "cash", payment_date: "2026-09-20" }}
      />
    );

    fireEvent.click(screen.getByText("Split across other customer accounts"));
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByLabelText("Customer account")).toHaveValue("2");

    const splitAmountInput = screen.getAllByLabelText("Amount")[1];
    fireEvent.change(splitAmountInput, { target: { value: "101" } });
    expect(screen.getByText("Split amounts cannot exceed the payment amount.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to payment details" })).toBeDisabled();

    fireEvent.change(splitAmountInput, { target: { value: "40" } });
    expect(screen.getByText("AG-0001 remains on this receipt").parentElement).toHaveTextContent("Ksh 60.00");
    expect(screen.getByRole("button", { name: "Continue to payment details" })).toBeEnabled();
  });

  it("shows the reviewed allocation and only confirms through the explicit review dialog", () => {
    const onConfirm = vi.fn();
    render(
      <PaymentReviewDialogs
        customers={[customer]}
        money={(amount) => `KES ${Number(amount || 0).toFixed(2)}`}
        onCloseAdjustmentReview={vi.fn()}
        onCloseImportReview={vi.fn()}
        onClosePaymentReview={vi.fn()}
        onClosePaymentSubmission={vi.fn()}
        onCommitImport={vi.fn()}
        onConfirmAdjustmentReview={vi.fn()}
        onConfirmPaymentReview={vi.fn()}
        onConfirmPaymentSubmission={onConfirm}
        onReapplyCustomerChange={vi.fn()}
        importSourceName={() => "CSV payment import"}
        paymentSubmissionReview={{
          customer,
          amount: 125,
          balanceDue: 100,
          amountToBalance: 100,
          amountToCredit: 25,
          form: { payment_channel: "mpesa_paybill", payment_date: "2026-09-20", external_reference: "QWE123XYZ" }
        }}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Record payment" });
    expect(dialog).toHaveTextContent("Applied to dueKES 100.00");
    expect(dialog).toHaveTextContent("Customer creditKES 25.00");
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
    expect(onConfirm).toHaveBeenCalledWith("");
  });
});
