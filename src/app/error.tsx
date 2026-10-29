"use client";

/**
 * This error boundary must remain a Client Component in Next.js App Router.
 * The first directive is required by Next.js App Router (including in production).
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="error-card" role="alert">
      <h2>mbioTraders hit an unexpected error</h2>
      <p>
        Your saved settings remain intact. Try this screen again; if the issue
        continues, reload the application.
      </p>
      <button type="button" className="btn primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
