const { sms } = require("../config/env");

const normalizePhoneNumber = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith(sms.defaultCountryCode)) return `+${digits}`;
  if (digits.startsWith("0")) return `+${sms.defaultCountryCode}${digits.slice(1)}`;
  return `+${digits}`;
};

const sendAfricaTalkingSms = async ({ to, message }) => {
  const { username, apiKey, from } = sms.africasTalking;
  if (!username || !apiKey) {
    return { skipped: true, error: "Africa's Talking SMS credentials are not configured." };
  }

  const body = new URLSearchParams({
    username,
    to,
    message
  });
  if (from) body.set("from", from);

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.errorMessage || payload.message || "SMS provider rejected the request.");
  }

  const recipient = payload.SMSMessageData?.Recipients?.[0] || {};
  const providerStatus = recipient.status || payload.SMSMessageData?.Message || "sent";
  const messageId = recipient.messageId || recipient.message_id || null;
  if (/fail|reject|invalid/i.test(providerStatus)) {
    throw new Error(providerStatus);
  }
  return { skipped: false, messageId, providerStatus };
};

const sendTwilioSms = async ({ to, message }) => {
  const { accountSid, authToken, from, messagingServiceSid } = sms.twilio;
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return { skipped: true, error: "Twilio SMS credentials are not configured." };
  }

  const body = new URLSearchParams({
    To: to,
    Body: message
  });
  if (messagingServiceSid) {
    body.set("MessagingServiceSid", messagingServiceSid);
  } else {
    body.set("From", from);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error_message || "Twilio rejected the SMS request.");
  }

  return {
    skipped: false,
    messageId: payload.sid || null,
    providerStatus: payload.status || "queued"
  };
};

const sendSms = async ({ to, message }) => {
  const normalizedTo = normalizePhoneNumber(to);
  if (!normalizedTo) {
    throw new Error("A valid phone number is required.");
  }

  const provider = String(sms.provider || "none").toLowerCase().replace(/[\s_-]+/g, "");
  if (provider === "africastalking") {
    return sendAfricaTalkingSms({ to: normalizedTo, message });
  }
  if (provider === "twilio") {
    return sendTwilioSms({ to: normalizedTo, message });
  }

  console.log(`SMS not sent because SMS_PROVIDER is not configured. To: ${normalizedTo}; Message: ${message}`);
  return { skipped: true, error: "SMS provider is not configured." };
};

module.exports = {
  normalizePhoneNumber,
  sendSms
};
