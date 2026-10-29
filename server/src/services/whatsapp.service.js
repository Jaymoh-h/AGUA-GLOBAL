const { whatsapp } = require("../config/env");
const { normalizePhoneNumber } = require("./sms.service");

const normalizeWhatsAppNumber = (value) => normalizePhoneNumber(value, whatsapp.defaultCountryCode);
const whatsappAddress = (value) => {
  const normalized = normalizeWhatsAppNumber(value);
  if (!normalized) return "";
  return normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;
};

const normalizedProvider = () => String(whatsapp.provider || "none").toLowerCase().replace(/[\s_-]+/g, "");

const getWhatsAppStatus = () => {
  const provider = normalizedProvider();
  const africasTalkingConfigured = Boolean(whatsapp.africasTalking.username && whatsapp.africasTalking.apiKey && whatsapp.africasTalking.from);
  const twilioConfigured = Boolean(whatsapp.twilio.accountSid && whatsapp.twilio.authToken && whatsapp.twilio.from);
  const metaConfigured = Boolean(whatsapp.meta.phoneNumberId && whatsapp.meta.accessToken);
  const configured =
    (provider === "africastalking" && africasTalkingConfigured) ||
    (provider === "twilio" && twilioConfigured) ||
    ((provider === "meta" || provider === "cloudapi" || provider === "whatsappcloud") && metaConfigured);

  return {
    provider: whatsapp.provider || "none",
    configured,
    supported_providers: ["africastalking", "twilio", "meta"],
    details: {
      africastalking: { configured: africasTalkingConfigured, has_from: Boolean(whatsapp.africasTalking.from) },
      twilio: {
        configured: twilioConfigured,
        has_from: Boolean(whatsapp.twilio.from)
      },
      meta: {
        configured: metaConfigured,
        has_phone_number_id: Boolean(whatsapp.meta.phoneNumberId),
        has_access_token: Boolean(whatsapp.meta.accessToken),
        api_version: whatsapp.meta.apiVersion
      }
    }
  };
};

const sendAfricaTalkingWhatsApp = async ({ to, message, template }) => {
  const { username, apiKey, from, templateHeaderValue } = whatsapp.africasTalking;
  if (!username || !apiKey || !from) {
    return { skipped: true, error: "Africa's Talking WhatsApp credentials or sender number are not configured." };
  }
  if (template?.name && !String(template.headerValue || templateHeaderValue).trim()) {
    throw new Error("Set AT_WHATSAPP_TEMPLATE_HEADER_VALUE before sending an Africa's Talking WhatsApp template.");
  }
  const body = template?.name
    ? { templateId: template.name, headerValue: template.headerValue || templateHeaderValue, bodyValues: (template.parameters || []).map((value) => String(value ?? "")) }
    : { message };
  const host = username.toLowerCase() === "sandbox" ? "chat.sandbox.africastalking.com" : "chat.africastalking.com";
  const response = await fetch(`https://${host}/whatsapp/message/send`, {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username, waNumber: from, phoneNumber: to, body })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || /fail|reject|invalid|error/i.test(String(payload.status || "")) || payload.error) {
    throw new Error(payload.error?.message || payload.error || payload.message || payload.status || "Africa's Talking rejected the WhatsApp request.");
  }
  if (!payload.messageId || !payload.status) {
    throw new Error("Africa's Talking did not confirm acceptance of the WhatsApp message.");
  }
  return { skipped: false, messageId: payload.messageId, providerStatus: payload.status };
};

const templateParametersToTwilioVariables = (parameters = []) =>
  parameters.reduce((values, parameter, index) => {
    values[String(index + 1)] = String(parameter ?? "");
    return values;
  }, {});

const sendTwilioWhatsApp = async ({ to, message, template }) => {
  const { accountSid, authToken, from } = whatsapp.twilio;
  if (!accountSid || !authToken || !from) {
    return { skipped: true, error: "Twilio WhatsApp credentials are not configured." };
  }

  const body = new URLSearchParams({
    To: whatsappAddress(to),
    From: whatsappAddress(from)
  });
  if (template?.name) {
    body.set("ContentSid", template.name);
    if (template.parameters?.length) {
      body.set("ContentVariables", JSON.stringify(templateParametersToTwilioVariables(template.parameters)));
    }
  } else {
    body.set("Body", message);
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
    throw new Error(payload.message || payload.error_message || "Twilio rejected the WhatsApp request.");
  }

  return {
    skipped: false,
    messageId: payload.sid || null,
    providerStatus: payload.status || "queued"
  };
};

const buildMetaMessageBody = ({ to, message, template }) => {
  const normalizedTo = normalizeWhatsAppNumber(to).replace(/^\+/, "");
  if (template?.name) {
    const components = template.parameters?.length
      ? [
          {
            type: "body",
            parameters: template.parameters.map((text) => ({ type: "text", text: String(text ?? "") }))
          }
        ]
      : [];
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedTo,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language || "en_US" },
        components
      }
    };
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedTo,
    type: "text",
    text: {
      preview_url: false,
      body: message
    }
  };
};

const sendMetaWhatsApp = async ({ to, message, template }) => {
  const { phoneNumberId, accessToken, apiVersion } = whatsapp.meta;
  if (!phoneNumberId || !accessToken) {
    return { skipped: true, error: "Meta WhatsApp credentials are not configured." };
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildMetaMessageBody({ to, message, template }))
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || "Meta rejected the WhatsApp request.");
  }

  const acceptedMessage = payload.messages?.[0] || {};
  return {
    skipped: false,
    messageId: acceptedMessage.id || null,
    providerStatus: acceptedMessage.message_status || "accepted"
  };
};

const sendWhatsApp = async ({ to, message, template = null }) => {
  const normalizedTo = normalizeWhatsAppNumber(to);
  if (!normalizedTo) {
    throw new Error("A valid WhatsApp phone number is required.");
  }

  const provider = normalizedProvider();
  if (provider === "africastalking") {
    return sendAfricaTalkingWhatsApp({ to: normalizedTo, message, template });
  }
  if (provider === "twilio") {
    return sendTwilioWhatsApp({ to: normalizedTo, message, template });
  }
  if (provider === "meta" || provider === "cloudapi" || provider === "whatsappcloud") {
    return sendMetaWhatsApp({ to: normalizedTo, message, template });
  }

  return { skipped: true, error: "WhatsApp provider is not configured." };
};

module.exports = {
  getWhatsAppStatus,
  normalizeWhatsAppNumber,
  sendWhatsApp
};
