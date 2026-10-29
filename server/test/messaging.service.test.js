const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const { sms, whatsapp } = require("../src/config/env");
const { sendSms } = require("../src/services/sms.service");
const { sendWhatsApp, getWhatsAppStatus } = require("../src/services/whatsapp.service");
const originalFetch = global.fetch;
const originalSms = { provider: sms.provider, africasTalking: { ...sms.africasTalking } };
const originalWhatsApp = { provider: whatsapp.provider, defaultCountryCode: whatsapp.defaultCountryCode, africasTalking: { ...whatsapp.africasTalking } };

afterEach(() => {
  global.fetch = originalFetch;
  sms.provider = originalSms.provider;
  Object.assign(sms.africasTalking, originalSms.africasTalking);
  whatsapp.provider = originalWhatsApp.provider;
  whatsapp.defaultCountryCode = originalWhatsApp.defaultCountryCode;
  Object.assign(whatsapp.africasTalking, originalWhatsApp.africasTalking);
});

test("Africa's Talking SMS uses sandbox and rejects recipient-level failures", async () => {
  sms.provider = "africastalking";
  Object.assign(sms.africasTalking, { username: "sandbox", apiKey: "test-key", from: "AGUA" });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ SMSMessageData: { Recipients: [{ status: "Success", statusCode: 101, messageId: "sms-1" }] } }) };
  };
  assert.equal((await sendSms({ to: "0712345678", message: "Hello" })).messageId, "sms-1");
  assert.equal(request.url, "https://api.sandbox.africastalking.com/version1/messaging");
  assert.equal(request.options.body.get("to"), "+254712345678");
  assert.equal(request.options.body.get("from"), "AGUA");
  global.fetch = async () => ({ ok: true, json: async () => ({ SMSMessageData: { Recipients: [{ status: "InsufficientBalance", statusCode: 405 }] } }) });
  await assert.rejects(sendSms({ to: "0712345678", message: "Hello" }), /InsufficientBalance/);
  global.fetch = async () => ({ ok: true, json: async () => ({ SMSMessageData: { Recipients: [] } }) });
  await assert.rejects(sendSms({ to: "0712345678", message: "Hello" }), /did not accept/);
});

test("Africa's Talking WhatsApp sends an approved template with ordered body variables", async () => {
  whatsapp.provider = "africastalking";
  whatsapp.defaultCountryCode = "254";
  Object.assign(whatsapp.africasTalking, { username: "live-user", apiKey: "test-key", from: "+254700000000", templateHeaderValue: "AGUA" });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: "Queued", messageId: "wa-1" }) };
  };
  assert.equal(getWhatsAppStatus().configured, true);
  const result = await sendWhatsApp({ to: "0712345678", message: "unused", template: { name: "template-id", parameters: ["Jane", "100"] } });
  assert.equal(result.messageId, "wa-1");
  assert.equal(request.url, "https://chat.africastalking.com/whatsapp/message/send");
  assert.equal(request.options.headers.apiKey, "test-key");
  assert.deepEqual(JSON.parse(request.options.body), {
    username: "live-user", waNumber: "+254700000000", phoneNumber: "+254712345678",
    body: { templateId: "template-id", headerValue: "AGUA", bodyValues: ["Jane", "100"] }
  });
});

test("Africa's Talking WhatsApp handles sandbox, missing configuration and provider rejection", async () => {
  whatsapp.provider = "africastalking";
  Object.assign(whatsapp.africasTalking, { username: "sandbox", apiKey: "test-key", from: "" });
  assert.equal(getWhatsAppStatus().configured, false);
  assert.equal((await sendWhatsApp({ to: "+254712345678", message: "Hello" })).skipped, true);
  whatsapp.africasTalking.from = "+254700000000";
  whatsapp.africasTalking.templateHeaderValue = "";
  await assert.rejects(sendWhatsApp({ to: "+254712345678", template: { name: "template-id" } }), /AT_WHATSAPP_TEMPLATE_HEADER_VALUE/);
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: "Rejected", message: "Outside service window" }) };
  };
  await assert.rejects(sendWhatsApp({ to: "+254712345678", message: "Hello" }), /Outside service window/);
  assert.equal(request.url, "https://chat.sandbox.africastalking.com/whatsapp/message/send");
  assert.deepEqual(JSON.parse(request.options.body).body, { message: "Hello" });
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(sendWhatsApp({ to: "+254712345678", message: "Hello" }), /did not confirm/);
});
