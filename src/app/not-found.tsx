import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="error-card">
      <h2>Page not found</h2>
      <p>This MbioTrade route does not exist.</p>
      <Link className="btn primary" href="/terminal">
        Return to terminal
      </Link>
    </div>
  );
}
