const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBillPdfAttachment,
  buildPayslipPdfAttachment,
  buildReceiptPdfAttachment
} = require("../src/services/styledPdf.service");

const business = {
  business_name: "AGUA Global",
  legal_name: "AGUA Global Water Services Ltd",
  physical_address: "Nairobi, Kenya",
  phone: "+254700000000",
  email: "billing@agua.test",
  tax_pin: "P012345678A",
  paybill_number: "123456",
  default_currency: "KES",
  print_page_size: "A5",
  print_orientation: "landscape",
  print_margin_mm: 12,
  print_scale_percent: 100
};

const assertPdf = (attachment, expectedText = []) => {
  assert.equal(attachment.contentType, "application/pdf");
  assert.ok(attachment.filename.endsWith(".pdf"));
  assert.ok(Buffer.isBuffer(attachment.content));

  const content = attachment.content.toString("latin1");
  assert.ok(content.startsWith("%PDF-1.4"));
  assert.match(content, /\/MediaBox \[0 0 595\.28 419\.53\]/);
  assert.match(content, /xref\n0 \d+/);
  assert.match(content, /%%EOF$/);
  expectedText.forEach((value) => assert.ok(content.includes(value), `Expected PDF content to include: ${value}`));
};

describe("styled PDF attachments", () => {
  it("renders a branded bill with charge, tariff, and balance evidence", () => {
    const attachment = buildBillPdfAttachment({
      business,
      bill: {
        id: 41,
        bill_number: "AG-BILL-0041",
        customer_name: "Amina Wanjiku",
        acc_number: "AG-10041",
        phone: "+254711000041",
        billing_period_name: "September 2026",
        billing_month: "2026-09-01",
        due_date: "2026-09-30",
        status: "issued",
        previous_reading: 120,
        current_reading: 143,
        units_used: 23,
        rate: 45,
        subtotal_amount: 1035,
        fixed_charge_amount: 120,
        vat_amount: 185.6,
        total_amount: 1340.6,
        paid_amount: 300,
        balance_amount: 1040.6,
        tariff_snapshot: JSON.stringify({
          name: "Residential standard",
          effective_from: "2026-01-01",
          version_id: 8,
          tariff_type: "block",
          blocks: [{ min_units: 0, max_units: 20, unit_rate: 40 }]
        })
      }
    });

    assertPdf(attachment, ["AGUA Global", "AG-BILL-0041", "Reading Summary", "Charge Breakdown", "Calculation Basis", "Amount due"]);
  });

  it("renders a service charge invoice without consumption or tariff sections", () => {
    const attachment = buildBillPdfAttachment({
      business,
      bill: {
        id: 52,
        bill_number: "AG-SC-0052",
        bill_origin: "service_charge",
        customer_name: "Amina Wanjiku",
        acc_number: "AG-10041",
        phone: "+254711000041",
        charge_number: "SC-000052",
        charge_type: "meter_replacement",
        service_charge_description: "Replacement of damaged customer meter.",
        billing_month: "2026-09-20",
        due_date: "2026-09-30",
        status: "unpaid",
        total_amount: 2500,
        paid_amount: 0,
        balance_amount: 2500
      }
    });

    assertPdf(attachment, ["Service Charge Invoice", "SC-000052", "Service Charge Details", "Replacement of damaged customer meter."]);
    const content = attachment.content.toString("latin1");
    assert.equal(content.includes("Reading Summary"), false);
    assert.equal(content.includes("Calculation Basis"), false);
  });

  it("renders a payment receipt with allocation and customer-position detail", () => {
    const attachment = buildReceiptPdfAttachment({
      business,
      customerBalance: -250,
      payment: {
        id: 71,
        receipt_number: "AG-RCPT-0071",
        payment_date: "2026-09-14",
        customer_name: "Amina Wanjiku",
        received_from: "Amina Wanjiku",
        acc_number: "AG-10041",
        payment_channel: "mpesa",
        external_reference: "TSTPAY0071",
        amount: 1500,
        total_allocated_amount: 1250,
        unallocated_amount: 250,
        recorded_by_name: "Finance User"
      },
      allocations: [
        {
          bill_id: 41,
          bill_number: "AG-BILL-0041",
          billing_month: "2026-09-01",
          bill_total: 1340.6,
          amount: 1250,
          balance_amount: 90.6
        }
      ]
    });

    assertPdf(attachment, ["AG-RCPT-0071", "Receipt Allocations", "TSTPAY0071", "Total received", "Customer credit"]);
  });

  it("renders a payslip with earnings, deductions, and payment record", () => {
    const attachment = buildPayslipPdfAttachment({
      business,
      payrollLine: {
        id: 91,
        payroll_run_id: 12,
        name: "Peter Otieno",
        code: "EMP-0091",
        title: "Field Supervisor",
        payee_type: "employee",
        run_name: "September 2026 Payroll",
        status: "paid",
        run_status: "approved",
        payment_channel: "bank_transfer",
        paid_at: "2026-09-14",
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        source_units: 22,
        rate_basis: "days",
        gross_amount: 48000,
        additions: 2500,
        deductions: 6300,
        net_amount: 44200,
        notes: "Field allowance",
        expense_reference: "EXP-2026-09-44",
        paid_by_name: "Finance User"
      }
    });

    assertPdf(attachment, ["PAYSLIP-12-91", "Earnings And Deductions", "Net pay", "Payment Record", "EXP-2026-09-44"]);
  });
});
