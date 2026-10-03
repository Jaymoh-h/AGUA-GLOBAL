const assert = require("node:assert/strict");
const { test } = require("node:test");
const { __private } = require("../src/services/email.service");

test("email delivery accepts one valid recipient", () => {
  assert.equal(
    __private.normalizeEmailAddress(" Billing@Example.com ", "recipient"),
    "billing@example.com"
  );
});

test("email delivery rejects recipient lists and header injection", () => {
  assert.throws(
    () => __private.normalizeEmailAddress("first@example.com,second@example.com", "recipient"),
    /single email address/
  );
  assert.throws(
    () => __private.normalizeHeader("Receipt\r\nBcc: hidden@example.com", "subject"),
    /invalid header value/
  );
});

test("email delivery honors an optional commissioning domain allowlist", () => {
  assert.equal(
    __private.normalizeEmailAddress("tester@agua.example", "recipient", ["agua.example"]),
    "tester@agua.example"
  );
  assert.throws(
    () => __private.normalizeEmailAddress("tester@outside.example", "recipient", ["agua.example"]),
    /approved recipient domain/
  );
});

test("email delivery only permits in-memory PDF attachments", () => {
  const attachments = __private.normalizeAttachments([
    {
      filename: "receipt-001.pdf",
      content: Buffer.from("PDF test"),
      contentType: "application/pdf"
    }
  ]);
  assert.equal(attachments.length, 1);
  assert.throws(
    () => __private.normalizeAttachments([{ filename: "receipt.pdf", path: "C:\\secrets.txt" }]),
    /in-memory PDF files/
  );
});
