import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CampaignRecoveryWorkspace from "../src/components/CampaignRecoveryWorkspace.jsx";
import IntegrationReadinessPanel from "../src/components/IntegrationReadinessPanel.jsx";

const dateTime = (value) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

const tableFor = (rows) => ({
  end: rows.length,
  page: 1,
  pageCount: 1,
  pageSize: 10,
  query: "",
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setQuery: vi.fn(),
  start: rows.length ? 1 : 0,
  total: rows.length,
  visibleRows: rows
});

const readiness = {
  messaging: {
    email: { configured: true, provider: "SMTP relay" },
    sms: { configured: false },
    whatsapp: { configured: false }
  },
  operations: { public_status_url_configured: false },
  payments: {
    bank_feed: { direct_feed_configured: false },
    mpesa: { direct_posting_ready: false }
  }
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Communication and integration controls", () => {
  it("keeps provider credentials out of readiness evidence and records only a reviewed commissioning outcome", async () => {
    const onRecordCheck = vi.fn().mockResolvedValue(true);
    render(
      <IntegrationReadinessPanel
        canEdit
        checksLoading={false}
        commissioningChecks={[]}
        loading={false}
        onDownloadPacket={vi.fn()}
        onPrintHandover={vi.fn()}
        onRecordCheck={onRecordCheck}
        onRefresh={vi.fn()}
        onRefreshChecks={vi.fn()}
        readiness={readiness}
      />
    );

    expect(screen.getByText(/configuration evidence is redacted/i)).toBeInTheDocument();
    expect(screen.getByText("SMTP via SMTP relay")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password|secret|api key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/smtp_pass/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "passed" } });
    fireEvent.change(screen.getByLabelText("Evidence reference"), { target: { value: "SMTP test message 1042" } });
    fireEvent.click(screen.getByRole("button", { name: "Review record" }));

    expect(screen.getByRole("dialog", { name: "Review commissioning record" })).toHaveTextContent(/does not enable a provider or alter payment processing/i);
    fireEvent.click(screen.getByRole("button", { name: "Record evidence" }));

    await waitFor(() => expect(onRecordCheck).toHaveBeenCalledWith(expect.objectContaining({
      check_key: "messaging_email",
      status: "passed",
      evidence_reference: "SMTP test message 1042"
    })));
  });

  it("shows delivery recovery as a deliberate account action rather than an automatic resend", () => {
    const onNavigate = vi.fn();
    const recipient = {
      acc_number: "AG-0042",
      bill_number: "INV-2026-0042",
      created_at: "2026-09-22T08:00:00.000Z",
      customer_name: "Kijani School",
      delivery_error_message: "Customer has disabled SMS delivery",
      id: 42,
      recipient: "+254700000042",
      status: "skipped"
    };
    render(
      <CampaignRecoveryWorkspace
        campaignDeliveryCause={() => "Delivery opted out"}
        campaignRetryPolicy={() => "No retry until the customer changes this channel preference."}
        campaignRecipientCounts={{ all: 1, attention: 1, failed: 0, sent: 0, skipped: 1 }}
        campaignRecipientTarget={() => ({ label: "Open account", target: { customer_id: 42, page: "customers" } })}
        campaignTable={tableFor([])}
        dateTime={dateTime}
        onCloseCampaign={vi.fn()}
        onNavigate={onNavigate}
        onRecipientOutcomeChange={vi.fn()}
        onRefresh={vi.fn()}
        onViewCampaign={vi.fn()}
        recipientOutcome="attention"
        recipientTable={tableFor([recipient])}
        selectedCampaign={{ campaign: { medium: "sms", sent_count: 0, status: "completed" } }}
      />
    );

    expect(screen.getByText(/automatic retries are disabled/i)).toBeInTheDocument();
    expect(screen.getByText("No retry until the customer changes this channel preference.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend|retry/i })).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open account" }));
    expect(onNavigate).toHaveBeenCalledWith({ customer_id: 42, page: "customers" });
  });
});
