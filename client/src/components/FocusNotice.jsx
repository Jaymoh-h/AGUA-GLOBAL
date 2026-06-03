function FocusNotice({ title, detail, onClear }) {
  if (!title) return null;

  return (
    <div className="focus-notice screen-only">
      <div>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      {onClear ? (
        <button type="button" onClick={onClear}>
          Clear focus
        </button>
      ) : null}
    </div>
  );
}

export default FocusNotice;
