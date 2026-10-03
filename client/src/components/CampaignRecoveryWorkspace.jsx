import { Eye } from "lucide-react";
import { EmptyTableRow } from "./EmptyState";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import TableControls from "./TableControls";

function CampaignRecoveryWorkspace({
  campaignDeliveryCause,
  campaignRetryPolicy,
  campaignRecipientCounts,
  campaignRecipientTarget,
  campaignTable,
  dateTime,
  onCloseCampaign,
  onNavigate,
  onRecipientOutcomeChange,
  onRefresh,
  onViewCampaign,
  recipientOutcome,
  recipientTable,
  selectedCampaign
}) {
  return (
    <>
      <div className="panel communications-campaign-panel">
        <div className="panel-heading">
          <h3>Campaign History</h3>
          <button type="button" onClick={onRefresh}>Refresh</button>
        </div>
        <TableControls table={campaignTable} label="campaigns" placeholder="Search campaigns" />
        <div className="table-wrap campaign-history-wrap">
          <table>
            <thead><tr><th>Name</th><th>Date</th><th>Medium</th><th>Status</th><th>Total</th><th>Sent</th><th>Skipped</th><th>Failed</th><th>By</th><th>Action</th></tr></thead>
            <tbody>
              {campaignTable.visibleRows.length ? campaignTable.visibleRows.map((campaign) => (
                <tr key={campaign.id}>
                  <td><strong>{campaign.campaign_name || "-"}</strong><small>{campaign.alert_type?.replace(/_/g, " ") || "-"}</small><small>{campaign.zone_name || "Selected accounts"}</small></td>
                  <td>{dateTime(campaign.created_at)}</td>
                  <td>{campaign.medium}</td>
                  <td><StatusBadge status={campaign.status} /></td>
                  <td>{campaign.total_count}</td>
                  <td>{campaign.sent_count}</td>
                  <td>{campaign.skipped_count}</td>
                  <td>{campaign.failed_count}</td>
                  <td>{campaign.created_by_name || "-"}</td>
                  <td><button type="button" onClick={() => onViewCampaign(campaign.id)}><Eye size={14} />View</button></td>
                </tr>
              )) : <EmptyTableRow colSpan={10} title="No campaign history found" detail="Bulk sends will appear here." />}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCampaign ? (
        <div className="panel">
          <div className="panel-heading"><h3>Campaign Results</h3><button type="button" onClick={onCloseCampaign}>Close</button></div>
          <div className="campaign-summary-grid">
            <StatCard label="Medium" value={selectedCampaign.campaign.medium} />
            <StatCard label="Status" value={selectedCampaign.campaign.status} />
            <StatCard label="Sent" value={selectedCampaign.campaign.sent_count} />
            <StatCard label="Needs action" value={campaignRecipientCounts.attention} />
          </div>
          <div className="campaign-results-toolbar">
            <label>
              Recipient outcome
              <select value={recipientOutcome} onChange={(event) => onRecipientOutcomeChange(event.target.value)}>
                <option value="all">All recipients ({campaignRecipientCounts.all})</option>
                <option value="attention">Needs action ({campaignRecipientCounts.attention})</option>
                <option value="skipped">Skipped ({campaignRecipientCounts.skipped})</option>
                <option value="failed">Failed ({campaignRecipientCounts.failed})</option>
                <option value="sent">Sent ({campaignRecipientCounts.sent})</option>
              </select>
            </label>
            <small>{recipientOutcome === "attention" ? "Showing recipients that need deliberate recovery work. Automatic retries are disabled." : "Filter recipients without changing campaign history."}</small>
          </div>
          <TableControls table={recipientTable} label="recipients" placeholder="Search recipients" />
          <div className="table-wrap campaign-results-wrap">
            <table>
            <thead><tr><th>Customer</th><th>Recipient</th><th>Bill</th><th>Status</th><th>Cause</th><th>Retry policy</th><th>Provider</th><th>Detail</th><th>Logged</th><th>Next step</th></tr></thead>
              <tbody>
                {recipientTable.visibleRows.length ? recipientTable.visibleRows.map((recipient) => {
                  const target = campaignRecipientTarget(recipient);
                  const deliveryCause = campaignDeliveryCause(recipient);
                  return (
                    <tr key={recipient.id}>
                      <td><strong>{recipient.customer_name || "-"}</strong><small>{recipient.acc_number || "-"}</small></td>
                      <td>{recipient.recipient || "-"}</td>
                      <td>{recipient.bill_number || recipient.bill_id || "-"}</td>
                      <td><StatusBadge status={recipient.status} /></td>
                      <td><StatusBadge status={deliveryCause.toLowerCase().replace(/\s+/g, "_")} /><small>{deliveryCause}</small></td>
                      <td><small>{campaignRetryPolicy(recipient)}</small></td>
                      <td>{recipient.provider_message_id || "-"}</td>
                      <td>{recipient.delivery_error_message || recipient.error_message || "No provider detail recorded"}</td>
                      <td>{dateTime(recipient.created_at)}</td>
                      <td>{target ? <button type="button" onClick={() => onNavigate?.(target.target)}><Eye size={14} />{target.label}</button> : <span className="muted">Unavailable</span>}</td>
                    </tr>
                  );
                }) : <EmptyTableRow colSpan={10} title="No recipients found" detail="This campaign has no recorded recipients." />}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default CampaignRecoveryWorkspace;
