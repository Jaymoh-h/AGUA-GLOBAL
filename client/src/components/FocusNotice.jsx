function FocusNotice({ title, detail, actionLabel, onAction, onClear }) {
  if (!title) return null;

  return (
    <div className="focus-notice screen-only">
      <div>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <div className="focus-notice-actions">
        {onAction && actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}
        {onClear ? <button type="button" onClick={onClear}>Clear focus</button> : null}
      </div>
    </div>
  );
}

export default FocusNotice;
