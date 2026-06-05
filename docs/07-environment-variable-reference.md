# Environment Variable Reference

This document lists environment variables used by the AGUA Global client and server.

## Client Variables

Defined in `client/.env`.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | Yes | `http://localhost:5000/api` | Base URL for API requests from the React client |

## Server Core Variables

Defined in `server/.env`.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Local Express port |
| `DATABASE_URL` | Yes | `postgres://user:pass@host:5432/agua_global` | PostgreSQL connection string |
| `DATABASE_SSL` | Production | `true` | Enables SSL for managed databases |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | `false` | Controls certificate validation for SSL connections |
| `JWT_SECRET` | Yes | `<long-random-secret>` | Token signing secret |
| `JWT_EXPIRES_IN` | No | `8h` | JWT lifetime |
| `CLIENT_ORIGIN` | Yes | `http://localhost:5173` | Allowed CORS origin |
| `PASSWORD_RESET_MINUTES` | No | `60` | Password reset token lifetime |
| `LOGO_STORAGE_MODE` | No | `filesystem` or `data-url` | Logo storage strategy |

Production note: set `LOGO_STORAGE_MODE=data-url` on Vercel so uploaded logos survive serverless deployments.

## Email Variables

| Variable | Required For Email | Example | Purpose |
| --- | --- | --- | --- |
| `SMTP_HOST` | Yes | `smtp.example.com` | SMTP server |
| `SMTP_PORT` | Yes | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | Use TLS immediately |
| `SMTP_USER` | Yes | `billing@example.com` | SMTP username |
| `SMTP_PASS` | Yes | `<secret>` | SMTP password |
| `SMTP_FROM` | Yes | `billing@example.com` | Sender address |

## SMS Variables

| Variable | Required For SMS | Example | Purpose |
| --- | --- | --- | --- |
| `SMS_PROVIDER` | Yes | `twilio`, `africastalking`, or `none` | Selects SMS provider |
| `SMS_DEFAULT_COUNTRY_CODE` | No | `254` | Default country code for local phone formatting |
| `TWILIO_ACCOUNT_SID` | Twilio | `AC...` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio | `<secret>` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio | `+123456789` | Twilio sender number |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional Twilio | `MG...` | Twilio messaging service |
| `AT_USERNAME` | Africa's Talking | `sandbox` | Africa's Talking username |
| `AT_API_KEY` | Africa's Talking | `<secret>` | Africa's Talking API key |
| `AT_SENDER_ID` | Optional | `AGUA` | Sender ID |

## WhatsApp Variables

| Variable | Required For WhatsApp | Example | Purpose |
| --- | --- | --- | --- |
| `WHATSAPP_PROVIDER` | Yes | `twilio`, `meta`, or `none` | Selects WhatsApp provider |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | No | `254` | Default country code |
| `TWILIO_WHATSAPP_FROM` | Twilio | `whatsapp:+14155238886` | Twilio WhatsApp sender |
| `WHATSAPP_TWILIO_ACCOUNT_SID` | Optional Twilio | `AC...` | Overrides SMS Twilio SID |
| `WHATSAPP_TWILIO_AUTH_TOKEN` | Optional Twilio | `<secret>` | Overrides SMS Twilio token |
| `WHATSAPP_TWILIO_FROM` | Twilio | `whatsapp:+...` | Twilio WhatsApp sender |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta | `123456789` | Meta phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta | `<secret>` | Meta Cloud API token |
| `WHATSAPP_API_VERSION` | Meta | `v20.0` | Meta API version |

## Secret Handling Rules

- Never commit `.env` files.
- Rotate `JWT_SECRET` before production launch.
- Store production secrets only in the deployment provider dashboard.
- Use separate secrets for staging and production.
- Review environment variables after every provider integration change.
