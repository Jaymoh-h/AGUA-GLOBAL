const nodemailer = require("nodemailer");
const { smtp } = require("../config/env");

const hasSmtpConfig = () => Boolean(smtp.host && smtp.user && smtp.pass);

const createTransporter = () =>
  nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });

const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  if (!hasSmtpConfig()) {
    return { skipped: true, error: "SMTP is not configured." };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text,
    html,
    attachments
  });
  return { skipped: false, messageId: info.messageId };
};

const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes }) => {
  const subject = "Reset your AGUA Global password";
  const text = [
    `Hello ${name || "there"},`,
    "",
    "Use the link below to reset your password.",
    resetUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.`
  ].join("\n");

  const result = await sendEmail({
    to,
    subject,
    text
  });
  return result;
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail
};
