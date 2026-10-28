export default function Loading() {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <div className="loader" aria-hidden="true" />
      <span>Loading MbioTrade…</span>
    </div>
  );
}
