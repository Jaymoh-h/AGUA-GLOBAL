const officeCategories = new Set(["billing_support", "billing_dispute", "payment_plan"]);
const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

export const dispatchSite = (request) => {
  const site = String(request.request_metadata?.connection_request?.site_location || "").trim();
  return site || String(request.customer_location || "").trim();
};

export const fieldVisits = (requests, workDate, includeFuture = false) =>
  requests.filter((request) => {
    if (!["open", "in_progress"].includes(request.status) || officeCategories.has(request.category)) return false;
    const target = String(request.target_date || "").slice(0, 10);
    return includeFuture || !target || target <= workDate;
  }).sort((left, right) => {
    const priority = (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9);
    const leftTarget = String(left.target_date || "9999-12-31").slice(0, 10);
    const rightTarget = String(right.target_date || "9999-12-31").slice(0, 10);
    return priority || leftTarget.localeCompare(rightTarget) || Number(left.id) - Number(right.id);
  });
