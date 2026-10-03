import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Customer360Panel from "../src/components/Customer360Panel.jsx";
import PortalReadingSubmissionWorkspace from "../src/components/PortalReadingSubmissionWorkspace.jsx";
import PortalServiceRequestWorkspace from "../src/components/PortalServiceRequestWorkspace.jsx";
import { useTableControls } from "../src/components/TableControls.jsx";
import ToastProvider from "../src/components/ToastProvider.jsx";
import { api } from "../src/services/api.js";

const date = (value) => String(value || "").slice(0, 10) || "-";
const label = (value) => String(value || "").replaceAll("_", " ");
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

function ServiceRequestHarness({ onSubmit = vi.fn() }) {
  const [requestForm, setRequestForm] = useState({ category: "leak", priority: "normal", description: "" });
  const [connectionRequest, setConnectionRequest] = useState({ request_type: "new_connection", site_location: "", landmark: "", preferred_inspection_date: "", access_contact_name: "", access_contact_phone: "", access_notes: "" });
  const table = useTableControls([]);

  return (
    <PortalServiceRequestWorkspace
      bills={[]}
      billingDispute={{ bill_id: "", reason: "usage" }}
      connectionRequest={connectionRequest}
      currentDate="2026-09-22"
      customerId={1}
      date={date}
      label={label}
      money={money}
      onBillingDisputeChange={vi.fn()}
      onCategoryChange={(category) => setRequestForm((current) => ({ ...current, category }))}
      onCloseRequest={vi.fn()}
      onConnectionChange={(field, value) => setConnectionRequest((current) => ({ ...current, [field]: value }))}
      onPaymentPlanChange={vi.fn()}
      onRequestFieldChange={(field, value) => setRequestForm((current) => ({ ...current, [field]: value }))}
      onSelectRequest={vi.fn()}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ requestForm, connectionRequest });
      }}
      openBalance={0}
      paymentPlanProposal={{ installment_amount: "", frequency: "monthly", preferred_first_due_date: "" }}
      requestForm={requestForm}
      saving={false}
      selectedRequest={null}
      table={table}
    />
  );
}

function ReadingSubmissionHarness({ activeMeter = true, onSubmit = vi.fn() }) {
  const [form, setForm] = useState({ reading_value: "", reading_date: "2026-09-22", notes: "" });
  const table = useTableControls([]);
  const data = activeMeter
    ? { activeMeter: { meter_number: "MTR-100" }, latestReading: { reading_value: 100, reading_date: "2026-08-31" } }
    : { activeMeter: null, latestReading: null };

  return (
    <PortalReadingSubmissionWorkspace
      customerId={1}
      currentDate="2026-09-22"
      data={data}
      date={date}
      form={form}
      number={(value) => Number(value || 0).toLocaleString()}
      onCloseEvidence={vi.fn()}
      onEvidence={vi.fn()}
      onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      saving={false}
      selectedSubmission={null}
      table={table}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Customer portal safeguards", () => {
  it("requires connection site evidence before a request can be submitted", () => {
    const onSubmit = vi.fn();
    render(<ServiceRequestHarness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "connection" } });
    expect(screen.getByText("Request a connection inspection")).toBeInTheDocument();
    expect(screen.getByText(/does not create a new account/i)).toBeInTheDocument();
    const site = screen.getByLabelText("Site or location");
    expect(site).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(site, { target: { value: "Plot 42, Kijani Estate" } });
    fireEvent.change(screen.getByLabelText("Supporting details"), { target: { value: "Request an inspection before a connection quote." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      requestForm: expect.objectContaining({ category: "connection" }),
      connectionRequest: expect.objectContaining({ site_location: "Plot 42, Kijani Estate" })
    }));
  });

  it("holds a customer meter reading for review and prevents submission without an active meter", () => {
    const noMeterSubmit = vi.fn();
    const { rerender } = render(<ReadingSubmissionHarness activeMeter={false} onSubmit={noMeterSubmit} />);

    const submit = screen.getByRole("button", { name: "Submit reading for review" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Submissions are reviewed before they affect billing.")).toBeInTheDocument();

    const activeSubmit = vi.fn();
    rerender(<ReadingSubmissionHarness activeMeter onSubmit={activeSubmit} />);
    expect(screen.getByRole("button", { name: "Submit reading for review" })).toBeEnabled();
    expect(screen.getByLabelText("Current meter reading")).toHaveAttribute("min", "100");

    fireEvent.change(screen.getByLabelText("Current meter reading"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit reading for review" }));
    expect(activeSubmit).toHaveBeenCalledWith(expect.objectContaining({ reading_value: "120" }));
  });

  it("keeps Customer 360 account context when opening payment and reading workflows", async () => {
    const customer = { id: 1, name: "Green Valley School", acc_number: "AG-0001", balance_due: 4500, status: "active", zone_name: "Central", email: "", phone: "" };
    vi.spyOn(api.customers, "overview").mockResolvedValue({
      customer,
      meters: [{ id: 10, meter_number: "MTR-100", status: "active", latest_reading_value: 100 }],
      readings: [],
      bills: [],
      payments: [],
      requests: [],
      documents: [],
      audit_events: []
    });
    vi.spyOn(api.standingOrders, "list").mockResolvedValue([]);
    const onNavigate = vi.fn();

    render(
      <ToastProvider>
        <Customer360Panel
          customer={customer}
          onClose={vi.fn()}
          onCloseAccount={vi.fn()}
          onEdit={vi.fn()}
          onNavigate={onNavigate}
          onServiceCharges={vi.fn()}
          onStatement={vi.fn()}
        />
      </ToastProvider>
    );

    expect(await screen.findByRole("button", { name: "Repair delivery" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post payment" }));
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      page: "payments",
      focus: "prepare_payment",
      customer_id: 1,
      return_target: expect.objectContaining({ page: "customers", customer_id: 1 })
    }));

    fireEvent.click(screen.getByRole("button", { name: "Capture reading" }));
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      page: "readings",
      focus: "capture_reading",
      customer_id: 1,
      return_target: expect.objectContaining({ label: "AG-0001" })
    }));
  });
});
