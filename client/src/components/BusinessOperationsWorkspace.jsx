import { Activity, Bell, CheckCircle2, Clock, Download, MailCheck, RefreshCw, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import ReviewDialog from "./ReviewDialog";
import StatCard from "./StatCard";

function BusinessOperationsWorkspace({
  backupLoading,
  backupStatus,
  browserDateTime,
  canEdit,
  canSendReminders,
  canViewMonitoring,
  label,
  localNow,
  monitoring,
  monitoringAlertSnapshot,
  monitoringLoading,
  monitoringSummary,
  number,
  onDownloadBackup,
  onLoadMonitoring,
  onLoadReminders,
  onRecordRestoreDrill,
  onResolveMonitoringEvent,
  onRefreshBackupStatus,
  onSendMonitoringTestAlert,
  onSendReminders,
  onSetRestoreDrillField,
  reminderLoading,
  reminderLogs,
  reminderPreview,
  reminderSending,
  restoreDrillForm,
  restoreDrills,
  shortDateTime
}) {
  const [reminderReviewOpen, setReminderReviewOpen] = useState(false);
  const [monitoringEventToResolve, setMonitoringEventToResolve] = useState(null);
  const [resolvingMonitoringEvent, setResolvingMonitoringEvent] = useState(false);
  const dueReminders = useMemo(
    () => (reminderPreview?.reminders || []).filter((item) => item.hasWork && item.dueToday),
    [reminderPreview]
  );
  const dueItemCount = dueReminders.reduce((sum, item) => sum + Number(item.count || 0), 0);

  const confirmReminderSend = async () => {
    const completed = await onSendReminders();
    if (completed) setReminderReviewOpen(false);
  };

  const confirmMonitoringResolution = async (resolutionNotes) => {
    if (!monitoringEventToResolve) return;
    setResolvingMonitoringEvent(true);
    try {
      const resolved = await onResolveMonitoringEvent(monitoringEventToResolve, resolutionNotes);
      if (resolved) setMonitoringEventToResolve(null);
    } finally {
      setResolvingMonitoringEvent(false);
    }
  };

  return (
    <div className="business-ops-grid wide-panel">
      {canViewMonitoring ? (
        <CollapsibleSection
          actions={
            <>
              <div className="browser-clock" title="Current browser/computer time">
                <Clock size={14} />
                <span>{browserDateTime(localNow)}</span>
              </div>
              <button type="button" onClick={onLoadMonitoring} disabled={monitoringLoading}>
                <RefreshCw size={17} />
                {monitoringLoading ? "Loading..." : "Refresh"}
              </button>
              {canEdit ? (
                <button type="button" onClick={onSendMonitoringTestAlert}>
                  <Bell size={17} />
                  Test alert
                </button>
              ) : null}
            </>
          }
          className="business-monitoring-panel"
          defaultOpen={Number(monitoringSummary?.unresolved_errors || 0) > 0}
          icon={<Activity size={18} />}
          summary={monitoring ? `API ${monitoring.api} | DB ${monitoring.database} | ${number(monitoringSummary.errors_24h)} errors 24h` : "Loading status"}
          title="Application Monitoring"
        >
          <p className="muted">{monitoring ? `Checked ${browserDateTime(monitoring.checked_at)}` : "Monitoring summary is loading."}</p>
          <div className="stat-grid compact-stat-grid">
            <StatCard label="Errors 24h" value={number(monitoringSummary.errors_24h)} detail={`${number(monitoringSummary.unresolved_errors)} unresolved`} />
            <StatCard label="Login Failures" value={number(monitoringSummary.login_failures_24h)} detail="Last 24 hours" />
            <StatCard label="API Errors" value={number(monitoringSummary.api_errors_24h)} detail="Server-side failures" />
            <StatCard label="Page Crashes" value={number(monitoringSummary.client_errors_24h)} detail="Client-side reports" />
            {canEdit ? <StatCard label="Alert Window" value={monitoringAlertSnapshot?.status || "-"} detail={`${number(monitoringAlertSnapshot?.event_count)} event(s), DB ${monitoringAlertSnapshot?.database || "-"}`} /> : null}
          </div>
          <div className="table-wrap monitoring-events-table">
            <table>
              <thead><tr><th>Time</th><th>Event</th><th>Severity</th><th>Source</th><th>Path</th><th>Message</th><th>Review</th></tr></thead>
              <tbody>
                {monitoring?.recent_events?.length ? monitoring.recent_events.slice(0, 10).map((event) => (
                  <tr key={event.id}>
                    <td>{browserDateTime(event.created_at)}</td>
                    <td>{label(event.event_type)}</td>
                    <td><span className={`status status-${event.severity}`}>{event.severity}</span></td>
                    <td>{label(event.source)}</td>
                    <td>{event.path || "-"}</td>
                    <td>{event.message}{event.actor_name ? <small>{event.actor_name}</small> : null}{event.resolved_at ? <small>Resolved {browserDateTime(event.resolved_at)} by {event.resolved_by_name || "administrator"}: {event.resolution_notes || "-"}</small> : null}</td>
                    <td>{event.resolved_at ? <span className="status status-ready">Resolved</span> : canEdit && ["warning", "error", "critical"].includes(event.severity) ? <button type="button" onClick={() => setMonitoringEventToResolve(event)}><CheckCircle2 size={15} />Resolve</button> : <span className="status status-pending">Open</span>}</td>
                  </tr>
                )) : <EmptyTableRow colSpan={7} title="No monitoring events" detail="Server errors, login failures, and page crashes will appear here." />}
              </tbody>
            </table>
          </div>
          <ReviewDialog
            busy={resolvingMonitoringEvent}
            busyLabel="Resolving event..."
            confirmLabel="Resolve event"
            description={monitoringEventToResolve ? `This acknowledges the ${label(monitoringEventToResolve.event_type)} event from ${browserDateTime(monitoringEventToResolve.created_at)}. It preserves the event, its cause, and your resolution note in the audit history.` : ""}
            eyebrow="Monitoring review"
            onCancel={() => !resolvingMonitoringEvent && setMonitoringEventToResolve(null)}
            onConfirm={confirmMonitoringResolution}
            open={Boolean(monitoringEventToResolve)}
            reasonLabel="Resolution note"
            reasonPlaceholder="State what was verified, corrected, or accepted"
            title="Resolve monitoring event"
          >
            {monitoringEventToResolve ? <div className="reading-context"><div><span>Severity</span><strong>{monitoringEventToResolve.severity}</strong></div><div><span>Source</span><strong>{label(monitoringEventToResolve.source)}</strong></div></div> : null}
          </ReviewDialog>
        </CollapsibleSection>
      ) : null}

      {canSendReminders ? (
        <CollapsibleSection
          actions={
            <>
              <button type="button" onClick={onLoadReminders} disabled={reminderLoading}><RefreshCw size={17} />{reminderLoading ? "Loading..." : "Refresh"}</button>
              <button type="button" onClick={() => setReminderReviewOpen(true)} disabled={reminderSending || !dueReminders.length}><Send size={17} />Review due</button>
            </>
          }
          className="business-reminders-panel"
          icon={<Bell size={18} />}
          summary={`${number(reminderPreview?.reminders?.reduce((sum, item) => sum + Number(item.count || 0), 0))} pending item(s)`}
          title="Operational Reminders"
        >
          <p className="muted">Email nudges for pending work, meter readings, billing, and payroll preparation.</p>
          {reminderPreview?.reminders?.length ? (
            <>
              <div className="reading-context">
                <div><span>Due groups</span><strong>{reminderPreview.reminders.filter((item) => item.hasWork && item.dueToday).length.toLocaleString()}</strong></div>
                <div><span>Total items</span><strong>{reminderPreview.reminders.reduce((sum, item) => sum + Number(item.count || 0), 0).toLocaleString()}</strong></div>
                <div><span>Last checked</span><strong>{shortDateTime(reminderPreview.generated_at)}</strong></div>
              </div>
              <div className="reminder-card-grid">
                {reminderPreview.reminders.map((item) => (
                  <div className={`reminder-card ${item.hasWork && item.dueToday ? "active" : ""}`} key={item.type}>
                    <div><Bell size={16} /><strong>{item.label}</strong></div>
                    <span>{Number(item.count || 0).toLocaleString()} due</span>
                    <small>{item.lines?.[0] || "No pending detail."}</small>
                    <small>{item.dueToday ? "Scheduled today" : item.schedule?.cadence || "Not scheduled today"}</small>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="empty-state">Refresh to preview current reminder work.</p>}
          <div className="panel-heading compact-heading"><div><h3>Recent Reminder Emails</h3><p className="muted">Daily duplicate sends are skipped per reminder type and recipient.</p></div><MailCheck size={18} /></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reminder</th><th>Recipient</th><th>Status</th><th>Sent</th></tr></thead>
              <tbody>
                {reminderLogs.length ? reminderLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.reminder_type}<small>{log.subject}</small></td>
                    <td>{log.recipient_name || log.recipient_email}<small>{log.recipient_email}</small></td>
                    <td>{log.status}</td><td>{shortDateTime(log.sent_at)}</td>
                  </tr>
                )) : <tr><td colSpan="4">No reminder emails have been recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      ) : null}

      {canEdit ? (
        <CollapsibleSection
          actions={
            <>
              <button type="button" onClick={onRefreshBackupStatus}><RefreshCw size={17} />Status</button>
              <button type="button" onClick={onDownloadBackup} disabled={backupLoading}><Download size={17} />{backupLoading ? "Preparing..." : "Download"}</button>
            </>
          }
          className="business-backup-panel"
          icon={<Download size={18} />}
          summary={`${backupStatus?.status || "status pending"} | ${number(backupStatus?.dataset_count)} dataset(s) | drill ${backupStatus?.restore_drill_status || "missing"}`}
          title="Data Backup Pack"
        >
          <p className="muted">Server-generated operational export. Password hashes and reset tokens are excluded.</p>
          {backupStatus ? (
            <>
              <div className="reading-context">
                <div><span>Backup status</span><strong>{backupStatus.status}</strong></div><div><span>Datasets</span><strong>{Number(backupStatus.dataset_count || 0).toLocaleString()}</strong></div>
                <div><span>Last export</span><strong>{backupStatus.last_export?.created_at?.slice(0, 10) || "None"}</strong></div><div><span>Missing optional</span><strong>{Number(backupStatus.missing_optional_datasets?.length || 0).toLocaleString()}</strong></div>
                <div><span>Restore drill</span><strong>{backupStatus.restore_drill_status || "missing"}</strong></div><div><span>Next drill due</span><strong>{backupStatus.next_restore_drill_due || "Schedule now"}</strong></div>
              </div>
              <div className="table-wrap"><table><tbody>
                <tr><td>Daily retention</td><td>{backupStatus.retention_policy?.daily || "30 days"}</td></tr><tr><td>Weekly retention</td><td>{backupStatus.retention_policy?.weekly || "12 weeks"}</td></tr><tr><td>Monthly retention</td><td>{backupStatus.retention_policy?.monthly || "24 months"}</td></tr>
                <tr><td>Restore drill</td><td>{backupStatus.retention_policy?.restore_drill || "Quarterly"}<small>{backupStatus.last_restore_drill ? `Last ${backupStatus.last_restore_drill.status} on ${backupStatus.last_restore_drill.drill_date?.slice(0, 10)}` : "No restore drill has been recorded."}</small></td></tr>
              </tbody></table></div>
            </>
          ) : null}
          <form className="form-grid compact-form" onSubmit={onRecordRestoreDrill}>
            <div className="panel-heading compact-heading"><h3>Record Restore Drill</h3></div>
            <label>Drill date<input type="date" value={restoreDrillForm.drill_date} onChange={(event) => onSetRestoreDrillField("drill_date", event.target.value)} /></label>
            <label>Environment<select value={restoreDrillForm.environment} onChange={(event) => onSetRestoreDrillField("environment", event.target.value)}><option value="local">Local</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
            <label>Status<select value={restoreDrillForm.status} onChange={(event) => onSetRestoreDrillField("status", event.target.value)}><option value="passed">Passed</option><option value="partial">Partial</option><option value="failed">Failed</option><option value="planned">Planned</option></select></label>
            <label>Duration minutes<input type="number" min="0" value={restoreDrillForm.duration_minutes} onChange={(event) => onSetRestoreDrillField("duration_minutes", event.target.value)} /></label>
            <label>Dataset count<input type="number" min="0" value={restoreDrillForm.dataset_count} onChange={(event) => onSetRestoreDrillField("dataset_count", event.target.value)} /></label>
            <label>Backup reference<input value={restoreDrillForm.backup_reference} onChange={(event) => onSetRestoreDrillField("backup_reference", event.target.value)} placeholder="Backup filename, Neon restore point, or pg_dump file" required /></label>
            <label>Restore target<input value={restoreDrillForm.restore_target} onChange={(event) => onSetRestoreDrillField("restore_target", event.target.value)} placeholder="Local DB, staging branch, or verification database" /></label>
            <label>Findings<textarea value={restoreDrillForm.findings} onChange={(event) => onSetRestoreDrillField("findings", event.target.value)} rows="3" /></label>
            <label>Follow-up actions<textarea value={restoreDrillForm.follow_up_actions} onChange={(event) => onSetRestoreDrillField("follow_up_actions", event.target.value)} rows="3" /></label>
            <button className="primary-button" type="submit"><Save size={17} />Record drill</button>
          </form>
          <div className="panel-heading compact-heading"><h3>Restore Drill History</h3></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Environment</th><th>Status</th><th>Backup</th><th>Findings</th></tr></thead>
            <tbody>{restoreDrills.length ? restoreDrills.slice(0, 8).map((drill) => (
              <tr key={drill.id}><td>{drill.drill_date?.slice(0, 10)}</td><td>{drill.environment}</td><td><span className={`status status-${drill.status}`}>{drill.status}</span></td><td>{drill.backup_reference}<small>{drill.restore_target || ""}</small></td><td>{drill.findings || "-"}<small>{drill.follow_up_actions || ""}</small></td></tr>
            )) : <tr><td colSpan="5">No restore drills have been recorded yet.</td></tr>}</tbody>
          </table></div>
        </CollapsibleSection>
      ) : null}
      <ReviewDialog
        busy={reminderSending}
        busyLabel="Processing reminders..."
        cancelLabel="Keep reviewing"
        confirmDisabled={!dueReminders.length}
        confirmLabel="Process due reminders"
        description={`This will process the ${dueReminders.length.toLocaleString()} reminder group(s) due today, covering ${dueItemCount.toLocaleString()} pending work item(s). Duplicate delivery remains blocked per reminder type and recipient.`}
        eyebrow="Reminder delivery"
        onCancel={() => !reminderSending && setReminderReviewOpen(false)}
        onConfirm={confirmReminderSend}
        open={reminderReviewOpen}
        reasonLabel={null}
        title="Review scheduled reminders"
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reminder group</th><th>Pending work</th><th>Schedule</th></tr></thead>
            <tbody>
              {dueReminders.map((item) => (
                <tr key={item.type}><td>{item.label}</td><td>{Number(item.count || 0).toLocaleString()}</td><td>{item.schedule?.cadence || "Due today"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReviewDialog>
    </div>
  );
}

export default BusinessOperationsWorkspace;
