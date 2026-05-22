function EmptyState({ title = "No records found", detail = "Try changing filters or adding records." }) {
  return (
    <div className="empty-state">
      <span>{title}</span>
      {detail ? <strong>{detail}</strong> : null}
    </div>
  );
}

export function EmptyTableRow({ colSpan, title, detail }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState title={title} detail={detail} />
      </td>
    </tr>
  );
}

export default EmptyState;
