export default function ReadingRunMetrics({ missingSourceReadings, pendingSourceReviews, readingCount, remainingReadings }) {
  return (
    <section className="reading-operations-metrics" aria-label="Reading run snapshot">
      <div><small>Still due</small><strong>{remainingReadings.toLocaleString()}</strong><span>Active customer meters</span></div>
      <div><small>Reading register</small><strong>{readingCount.toLocaleString()}</strong><span>Current filter</span></div>
      <div><small>Source checks</small><strong>{missingSourceReadings.toLocaleString()}</strong><span>Backup readings due</span></div>
      <div><small>Pending reviews</small><strong>{pendingSourceReviews.toLocaleString()}</strong><span>Source billing exceptions</span></div>
    </section>
  );
}
