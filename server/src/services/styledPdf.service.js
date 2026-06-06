const currency = (business) => business.default_currency || "KES";

const money = (value, business = {}) => `${currency(business)} ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const label = (value) => String(value || "-").replace(/_/g, " ");
const sanitizeFilename = (value) => String(value || "document.pdf").replace(/[^\w.-]+/g, "_");
const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const pdfEscape = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const hexToRgb = (hex) => {
  const clean = String(hex || "#000000").replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((char) => `${char}${char}`).join("") : clean.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
};

class PdfDocument {
  constructor() {
    this.width = 595;
    this.height = 842;
    this.margin = 42;
    this.bottomMargin = 46;
    this.contentWidth = this.width - this.margin * 2;
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.pages.push([]);
    this.y = this.margin;
  }

  current() {
    return this.pages[this.pages.length - 1];
  }

  push(command) {
    this.current().push(command);
  }

  pdfY(y, height = 0) {
    return this.height - y - height;
  }

  rgb(hex) {
    return hexToRgb(hex).map((part) => Number(part.toFixed(3))).join(" ");
  }

  rect(x, y, width, height, { fill = null, stroke = null, lineWidth = 0.6 } = {}) {
    const fillCommand = fill ? `${this.rgb(fill)} rg` : "";
    const strokeCommand = stroke ? `${this.rgb(stroke)} RG ${lineWidth} w` : "";
    const operator = fill && stroke ? "B" : fill ? "f" : "S";
    this.push(`q ${fillCommand} ${strokeCommand} ${x} ${this.pdfY(y, height)} ${width} ${height} re ${operator} Q`);
  }

  line(x1, y1, x2, y2, color = "#dde3ea", lineWidth = 0.6) {
    this.push(`q ${this.rgb(color)} RG ${lineWidth} w ${x1} ${this.pdfY(y1)} m ${x2} ${this.pdfY(y2)} l S Q`);
  }

  textWidth(value, size = 10, font = "F1") {
    const factor = font === "F2" ? 0.58 : 0.52;
    return String(value || "").length * size * factor;
  }

  wrapText(value, maxWidth, size = 10, font = "F1") {
    const words = String(value ?? "-").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (this.textWidth(candidate, size, font) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
  }

  text(value, x, y, { size = 10, font = "F1", color = "#172033", maxWidth = null, lineHeight = null, align = "left" } = {}) {
    const lines = maxWidth ? this.wrapText(value, maxWidth, size, font) : [String(value ?? "")];
    const step = lineHeight || Math.ceil(size * 1.32);
    lines.forEach((line, index) => {
      const textWidth = this.textWidth(line, size, font);
      const textX = align === "right" && maxWidth ? x + maxWidth - textWidth : x;
      this.push(`BT /${font} ${size} Tf ${this.rgb(color)} rg 1 0 0 1 ${textX} ${this.pdfY(y + index * step + size)} Tm (${pdfEscape(line)}) Tj ET`);
    });
    return lines.length * step;
  }

  ensureSpace(height) {
    if (this.y + height > this.height - this.bottomMargin) {
      this.addPage();
    }
  }

  move(height) {
    this.y += height;
  }

  brandHeader(business) {
    const x = this.margin;
    const name = business.business_name || "Water Billing";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AG";

    this.rect(x, this.y, 74, 58, { fill: "#0f766e", stroke: "#0f766e" });
    this.text(initials, x + 21, this.y + 19, { size: 18, font: "F2", color: "#ffffff" });
    this.text(name, x + 88, this.y + 2, { size: 17, font: "F2", color: "#172033", maxWidth: this.contentWidth - 88 });
    let infoY = this.y + 24;
    [business.legal_name, business.physical_address, [business.phone, business.email].filter(Boolean).join(" | "), business.tax_pin ? `PIN: ${business.tax_pin}` : null]
      .filter(Boolean)
      .forEach((line) => {
        this.text(line, x + 88, infoY, { size: 9, color: "#344256", maxWidth: this.contentWidth - 88 });
        infoY += 12;
      });
    this.move(72);
    this.line(this.margin, this.y - 2, this.margin + this.contentWidth, this.y - 2, "#172033", 1.4);
    this.move(14);
  }

  titleBoxes(left, right) {
    const gap = 10;
    const width = (this.contentWidth - gap) / 2;
    const draw = (item, x) => {
      this.rect(x, this.y, width, 48, { fill: "#ffffff", stroke: "#dde3ea" });
      this.text(item.label, x + 10, this.y + 9, { size: 7.5, font: "F2", color: "#637083", maxWidth: width - 20 });
      this.text(item.value, x + 10, this.y + 24, { size: 12, font: "F2", color: "#172033", maxWidth: width - 20 });
    };
    draw(left, this.margin);
    draw(right, this.margin + width + gap);
    this.move(62);
  }

  infoGrid(items) {
    const gap = 10;
    const columns = 2;
    const width = (this.contentWidth - gap) / columns;
    const rowHeight = 54;

    for (let index = 0; index < items.length; index += columns) {
      this.ensureSpace(rowHeight + 8);
      items.slice(index, index + columns).forEach((item, columnIndex) => {
        const x = this.margin + columnIndex * (width + gap);
        this.rect(x, this.y, width, rowHeight, { fill: "#ffffff", stroke: "#dde3ea" });
        this.text(item.label, x + 10, this.y + 9, { size: 7.5, font: "F2", color: "#637083", maxWidth: width - 20 });
        this.text(item.value, x + 10, this.y + 24, { size: 11, font: "F2", color: "#172033", maxWidth: width - 20 });
        if (item.subtext) {
          this.text(item.subtext, x + 10, this.y + 39, { size: 8, color: "#637083", maxWidth: width - 20 });
        }
      });
      this.move(rowHeight + 8);
    }
    this.move(3);
  }

  sectionTitle(title) {
    this.ensureSpace(28);
    this.text(title, this.margin, this.y, { size: 11, font: "F2", color: "#172033" });
    this.move(19);
  }

  table(columns, rows) {
    const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
    const widths = columns.map((column) => Math.floor((this.contentWidth * (column.weight || 1)) / totalWeight));
    widths[widths.length - 1] += this.contentWidth - widths.reduce((sum, width) => sum + width, 0);
    const padding = 7;
    const headerHeight = 26;

    this.ensureSpace(headerHeight + 20);
    this.rect(this.margin, this.y, this.contentWidth, headerHeight, { fill: "#172033", stroke: "#172033" });
    let x = this.margin;
    columns.forEach((column, index) => {
      this.text(column.header, x + padding, this.y + 8, { size: 8, font: "F2", color: "#ffffff", maxWidth: widths[index] - padding * 2 });
      x += widths[index];
    });
    this.move(headerHeight);

    rows.forEach((row, rowIndex) => {
      const cellLines = columns.map((column, index) =>
        this.wrapText(typeof column.value === "function" ? column.value(row) : row[column.value], widths[index] - padding * 2, 8.5)
      );
      const rowHeight = Math.max(28, Math.max(...cellLines.map((lines) => lines.length)) * 12 + padding * 2);
      this.ensureSpace(rowHeight + 8);
      this.rect(this.margin, this.y, this.contentWidth, rowHeight, {
        fill: rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc",
        stroke: "#dde3ea"
      });
      x = this.margin;
      columns.forEach((column, index) => {
        const value = cellLines[index].join(" ");
        this.text(value, x + padding, this.y + padding, {
          size: 8.5,
          color: "#172033",
          maxWidth: widths[index] - padding * 2,
          align: column.align || "left"
        });
        x += widths[index];
      });
      this.move(rowHeight);
    });
    this.move(14);
  }

  totals(rows) {
    rows.forEach((row) => {
      this.ensureSpace(40);
      const primary = row.primary;
      this.rect(this.margin, this.y, this.contentWidth, 34, { fill: primary ? "#e7f5f3" : "#ffffff", stroke: "#dde3ea" });
      this.text(row.label, this.margin + 10, this.y + 10, { size: 8, font: "F2", color: "#637083", maxWidth: this.contentWidth * 0.56 });
      this.text(row.value, this.margin + this.contentWidth * 0.58, this.y + 9, {
        size: primary ? 13 : 11,
        font: "F2",
        color: primary ? "#0f766e" : "#172033",
        maxWidth: this.contentWidth * 0.4,
        align: "right"
      });
      this.move(40);
    });
  }

  footer(lines) {
    const cleanLines = lines.filter(Boolean);
    if (!cleanLines.length) return;
    this.ensureSpace(cleanLines.length * 13 + 18);
    this.line(this.margin, this.y, this.margin + this.contentWidth, this.y, "#dde3ea");
    this.move(10);
    cleanLines.forEach((line) => {
      this.text(line, this.margin, this.y, { size: 8.5, color: "#344256", maxWidth: this.contentWidth });
      this.move(12);
    });
  }

  render() {
    const objects = [];
    const addObject = (body) => {
      objects.push(body);
      return objects.length;
    };
    const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds = [];

    this.pages.forEach((commands) => {
      const content = commands.join("\n");
      const contentId = addObject(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
      const pageId = addObject(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    });

    const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    pageIds.forEach((pageId) => {
      objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    });
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const chunks = ["%PDF-1.4\n"];
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(chunks.join("")));
      chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
    });
    const xrefOffset = Buffer.byteLength(chunks.join(""));
    chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
    chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return Buffer.from(chunks.join(""), "utf8");
  }
}

const nonZeroChargeRows = (bill, business) =>
  [
    ["Usage subtotal", bill.subtotal_amount || bill.amount],
    ["Fixed charge", bill.fixed_charge_amount],
    ["Penalty", bill.penalty_amount],
    ["VAT", bill.vat_amount],
    ["Reconnection fee", bill.reconnection_fee_amount],
    ["Adjustment", bill.adjustment_amount]
  ]
    .filter(([name, amount]) => name === "Usage subtotal" || Number(amount || 0) !== 0)
    .map(([name, amount]) => ({ name, amount: money(amount, business) }));

const buildBillPdfAttachment = ({ bill, business = {} }) => {
  const total = Number(bill.total_amount || bill.amount || 0);
  const balance = Number(bill.balance_amount ?? total - Number(bill.paid_amount || 0));
  const tariff = parseJson(bill.tariff_snapshot);
  const tariffBlocks = Array.isArray(tariff.blocks) ? tariff.blocks : [];
  const penalties = Array.isArray(bill.penalty_applications) ? bill.penalty_applications : [];
  const document = new PdfDocument();

  document.brandHeader(business);
  document.titleBoxes(
    { label: "Bill", value: bill.bill_number || `Bill ${bill.id}` },
    { label: "Due Date", value: dateOnly(bill.due_date) }
  );
  document.infoGrid([
    { label: "Customer", value: bill.customer_name || "-", subtext: bill.acc_number || "" },
    { label: "Phone", value: bill.phone || "-" },
    { label: "Billing Period", value: bill.billing_period_name || dateOnly(bill.billing_month) },
    { label: "Status", value: label(bill.status) }
  ]);

  document.sectionTitle("Reading Summary");
  document.table(
    [
      { header: "Previous", value: (row) => row.previous },
      { header: "Current", value: (row) => row.current },
      { header: "Units", value: (row) => row.units },
      { header: "Rate", value: (row) => row.rate },
      { header: "Subtotal", value: (row) => row.subtotal, align: "right", weight: 1.25 }
    ],
    [
      {
        previous: Number(bill.previous_reading || 0).toLocaleString(),
        current: Number(bill.current_reading || 0).toLocaleString(),
        units: Number(bill.units_used || 0).toLocaleString(),
        rate: money(bill.rate, business),
        subtotal: money(bill.subtotal_amount || bill.amount, business)
      }
    ]
  );

  document.sectionTitle("Charge Breakdown");
  document.table(
    [
      { header: "Charge", value: "name", weight: 1.4 },
      { header: "Amount", value: "amount", align: "right" }
    ],
    nonZeroChargeRows(bill, business)
  );

  document.sectionTitle("Calculation Basis");
  document.table(
    [
      { header: "Basis", value: "basis", weight: 1 },
      { header: "Value", value: "value", weight: 2 }
    ],
    [
      {
        basis: "Tariff",
        value: [tariff.name || "-", tariff.effective_from ? `effective ${dateOnly(tariff.effective_from)}` : null, tariff.version_id ? `version ${tariff.version_id}` : null]
          .filter(Boolean)
          .join(" | ")
      },
      { basis: "Tariff type", value: label(tariff.tariff_type || "flat") },
      {
        basis: "Usage formula",
        value: `${Number(bill.units_used || 0).toLocaleString()} units x ${money(bill.rate, business)}; subtotal ${money(
          bill.subtotal_amount || bill.amount,
          business
        )}`
      },
      ...(tariffBlocks.length
        ? [
            {
              basis: "Block rows",
              value: tariffBlocks
                .map((block) => {
                  const from = Number(block.min_units || 0).toLocaleString();
                  const to = block.max_units === null || block.max_units === undefined ? "above" : Number(block.max_units).toLocaleString();
                  return `${from}-${to}: ${money(block.unit_rate, business)}`;
                })
                .join(" | ")
            }
          ]
        : []),
      {
        basis: "Principal basis",
        value: `${money(bill.subtotal_amount || bill.amount, business)} usage + ${money(bill.fixed_charge_amount, business)} fixed; penalty and VAT shown separately.`
      }
    ]
  );

  if (penalties.length) {
    document.sectionTitle("Penalty History");
    document.table(
      [
        { header: "Penalty Month", value: (row) => dateOnly(row.application_month) },
        { header: "Principal", value: (row) => money(row.principal_amount, business), align: "right" },
        { header: "Penalty", value: (row) => money(row.penalty_amount, business), align: "right" },
        { header: "Status", value: "status" },
        { header: "Waiver", value: (row) => row.waiver_reason || row.waived_by_name || (row.waived_at ? dateOnly(row.waived_at) : "-") }
      ],
      penalties
    );
  }

  document.totals([
    { label: "Total billed", value: money(total, business), primary: true },
    { label: "Paid / credit applied", value: money(bill.paid_amount, business) },
    { label: "Amount due", value: money(balance, business) }
  ]);
  document.footer([
    business.paybill_number ? `Paybill: ${business.paybill_number}` : null,
    business.till_number ? `Till: ${business.till_number}` : null,
    business.bank_details ? `Bank details: ${business.bank_details}` : null,
    business.receipt_footer_note || "Thank you.",
    `${business.business_name || "Water Billing"} customer bill`
  ]);

  return {
    filename: sanitizeFilename(`${bill.bill_number || `bill-${bill.id}`}.pdf`),
    content: document.render(),
    contentType: "application/pdf"
  };
};

const buildReceiptPdfAttachment = ({ payment, allocations = [], customerBalance = 0, business = {} }) => {
  const document = new PdfDocument();
  const positionIsCredit = Number(customerBalance || 0) < 0;

  document.brandHeader(business);
  document.titleBoxes(
    { label: "Receipt", value: payment.receipt_number || `RCPT-${payment.id}` },
    { label: "Date", value: dateOnly(payment.payment_date) }
  );
  document.infoGrid([
    { label: "Received From", value: payment.received_from || payment.customer_name || "-" },
    { label: "Customer", value: payment.customer_name || "-", subtext: payment.acc_number || "" },
    { label: "Channel", value: label(payment.payment_channel || payment.method) },
    { label: "Reference", value: payment.external_reference || payment.reference || "-" }
  ]);

  document.sectionTitle("Receipt Allocations");
  document.table(
    [
      { header: "Bill", value: (row) => row.bill_number || (row.bill_id ? `Bill ${row.bill_id}` : row.message), weight: 1.25 },
      { header: "Billing Month", value: (row) => (row.billing_month ? dateOnly(row.billing_month) : "-") },
      { header: "Bill Total", value: (row) => (row.bill_total === undefined ? "-" : money(row.bill_total, business)), align: "right" },
      { header: "Allocated", value: (row) => (row.amount === undefined ? "-" : money(row.amount, business)), align: "right" },
      { header: "Bill Balance", value: (row) => (row.balance_amount === undefined ? "-" : money(row.balance_amount, business)), align: "right" }
    ],
    allocations.length ? allocations : [{ message: "No open bills. Full amount stored as customer credit." }]
  );

  document.totals([
    { label: "Total received", value: money(payment.amount, business), primary: true },
    { label: "Allocated to bills", value: money(payment.total_allocated_amount, business) },
    { label: "Customer credit", value: money(payment.unallocated_amount, business) },
    {
      label: `${positionIsCredit ? "Customer credit" : "Amount due"} after receipt`,
      value: `${money(Math.abs(Number(customerBalance || 0)), business)}${positionIsCredit ? " credit" : ""}`
    }
  ]);
  document.footer([
    business.paybill_number ? `Paybill: ${business.paybill_number}` : null,
    business.till_number ? `Till: ${business.till_number}` : null,
    business.bank_details ? `Bank details: ${business.bank_details}` : null,
    business.receipt_footer_note || "Thank you.",
    payment.recorded_by_name ? `Recorded by ${payment.recorded_by_name}` : null
  ]);

  return {
    filename: sanitizeFilename(`${payment.receipt_number || `receipt-${payment.id}`}.pdf`),
    content: document.render(),
    contentType: "application/pdf"
  };
};

module.exports = {
  buildBillPdfAttachment,
  buildReceiptPdfAttachment
};
