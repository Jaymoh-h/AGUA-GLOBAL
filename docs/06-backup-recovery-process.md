# Backup And Recovery Process

This document defines the minimum operational process for protecting AGUA Global production data.

## What Must Be Backed Up

- PostgreSQL database.
- Vercel environment variables.
- GitHub repository.
- Uploaded business logo data if using filesystem storage locally.
- Supporting document files if using local filesystem document storage.
- Provider configuration records and approved WhatsApp template names.

In production, use `LOGO_STORAGE_MODE=data-url` so business logos are stored in PostgreSQL and included in database backups.

Supporting documents are tracked in PostgreSQL metadata but stored as files. If production uses filesystem document storage, back up both the database and the document storage directory together so metadata and files stay consistent.

## Backup Frequency

Recommended minimum:

- Daily automated database backups.
- Weekly manual export retained separately.
- Backup before every production migration.
- Backup before bulk imports or risky correction exercises.

## PostgreSQL Backup Command

Example:

```powershell
pg_dump "<DATABASE_URL>" --format=custom --file "agua-global-YYYY-MM-DD.backup"
```

For plain SQL:

```powershell
pg_dump "<DATABASE_URL>" --file "agua-global-YYYY-MM-DD.sql"
```

Use the database provider's backup interface where available.

## Restore Command

For custom-format backup:

```powershell
pg_restore --clean --if-exists --dbname "<DATABASE_URL>" "agua-global-YYYY-MM-DD.backup"
```

For plain SQL:

```powershell
psql "<DATABASE_URL>" -f "agua-global-YYYY-MM-DD.sql"
```

## Recovery Drill

At least once before production launch:

1. Create a backup from the live or staging database.
2. Restore it into a separate test database.
3. Point a local API `.env` to the restored database.
4. Run `npm.cmd run db:check`.
5. Log in as admin.
6. Confirm customers, bills, payments, reports, and portal data exist.
7. Document the restore time and any issues.

## Migration Safety Process

Before migration:

- Confirm migration file name and purpose.
- Back up database.
- Confirm no active users are posting data during high-risk migrations.

During migration:

- Run migration once.
- Capture terminal output.
- Do not rerun blindly if it fails.

After migration:

- Run API health check.
- Run affected workflow smoke test.
- Record result in implementation records.

## Supporting Document Recovery

For maintenance, expense, and contractor invoice attachments:

- Restore database rows from backup.
- Restore matching stored files from the same backup point.
- Confirm downloads work through `/api/documents/:id/download`.
- Soft-deleted documents should remain deleted unless the business explicitly approves recovery.

## Incident Recovery Checklist

- Identify whether the issue is code, database, environment, or provider outage.
- Pause risky user activity if billing or payments are affected.
- Export current database before attempting repair.
- Restore from last known-good backup only if repair is unsafe.
- Reapply any valid transactions that happened after the restored backup.
- Record incident, cause, recovery action, and data reconciliation notes.
