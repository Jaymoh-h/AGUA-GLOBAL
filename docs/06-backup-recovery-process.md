# Backup And Recovery Process

This document defines the minimum operational process for protecting AGUA Global production data.

## What Must Be Backed Up

- PostgreSQL database.
- Vercel environment variables.
- GitHub repository.
- Uploaded business logo data if using filesystem storage locally.
- Supporting document files if using local filesystem document storage.
- Knowledge base SOP/manual files stored in PostgreSQL.
- Provider configuration records and approved WhatsApp template names.

In production, use `LOGO_STORAGE_MODE=data-url` so business logos are stored in PostgreSQL and included in database backups.

Supporting documents are tracked in PostgreSQL metadata but stored as files. If production uses filesystem document storage, back up both the database and the document storage directory together so metadata and files stay consistent.

Knowledge base documents are stored in PostgreSQL and are included in database backups and operational JSON exports as base64 file data. Treat every operational backup export as sensitive.

## Backup Frequency

Recommended minimum:

- Daily automated database backups.
- Weekly manual export retained separately.
- Backup before every production migration.
- Backup before bulk imports or risky correction exercises.

Retention baseline:

- Daily backups: keep 30 days.
- Weekly backups: keep 12 weeks.
- Monthly backups: keep 24 months.
- Pre-migration backups: keep until the next successful month-end close.
- Restore drill: run at least quarterly.

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

## Operational JSON Export

Admins can download an operational backup pack from Business Settings. The same export can be generated from a server workspace:

```powershell
cd server
npm.cmd run db:backup
```

Monthly run with pruning:

```powershell
cd server
npm.cmd run db:backup:monthly
```

Optional environment variables:

```text
BACKUP_DIR=J:\AGUA-BACKUPS
BACKUP_RETENTION_DAYS=180
```

The JSON export is useful for continuity review, migration safety, and small restore/reconciliation tasks. For full disaster recovery, also keep managed PostgreSQL backups or `pg_dump` backups.

## Monthly Automation

Vercel serverless functions should not be treated as durable backup storage. Run monthly backup automation from a durable place such as:

- Windows Task Scheduler on an office/server machine.
- GitHub Actions with encrypted secrets and an artifact/storage destination.
- Neon/provider scheduled backups where available.
- A small VPS or operations machine with PostgreSQL tools installed.

Example Windows Task Scheduler action:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "cd J:\PROJECTS\AGUA-GLOBAL\server; npm.cmd run db:backup:monthly"
```

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
5. Run `npm.cmd run db:migrate:status`.
6. Log in as admin.
7. Confirm customers, bills, payments, reports, portal data, and knowledge base documents exist.
8. Document the restore time and any issues.

After the drill, record the evidence in Business Settings > Data Backup Pack > Record Restore Drill. The app stores the backup reference, restore target, status, duration, findings, and follow-up actions in the database so future backup status checks show the last drill and the next quarterly due date.

## Replication Baseline

True database replication is handled by the PostgreSQL provider, not by the Vercel API. For Neon or another managed PostgreSQL host, enable provider-native options where available:

- Point-in-time restore or continuous backup.
- Read replica or branch for reporting/test restores.
- Region/provider redundancy if the plan supports it.
- Alerting for failed backups, storage pressure, and connection errors.

Keep the application-side restore drill ledger even when provider replication is enabled. Replication proves another copy exists; a restore drill proves the team can actually recover and verify the app.

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

Knowledge base documents are restored with the database because their file bytes are stored in PostgreSQL.

## Incident Recovery Checklist

- Identify whether the issue is code, database, environment, or provider outage.
- Pause risky user activity if billing or payments are affected.
- Export current database before attempting repair.
- Restore from last known-good backup only if repair is unsafe.
- Reapply any valid transactions that happened after the restored backup.
- Record incident, cause, recovery action, and data reconciliation notes.
