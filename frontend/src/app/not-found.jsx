import Link from "next/link";

function HeartMark() {
  return (
    <span aria-hidden="true" className="brand-heart">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M20.8 5.9c-1.7-1.8-4.6-1.8-6.4 0L12 8.3 9.6 5.9a4.5 4.5 0 0 0-6.4 6.3l2.4 2.4L12 21l6.4-6.4 2.4-2.4a4.5 4.5 0 0 0 0-6.3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function NotFound() {
  return (
    <div className="not-found-page">
      <header className="site-header not-found-header">
        <div className="site-shell site-header-inner not-found-header-inner">
          <Link href="/" className="site-brand-link" aria-label="QYCC home">
            <HeartMark />
            <div>
              <p className="site-brand-title">
                Peer support program for young caregivers
              </p>
              <p className="site-brand-subtitle">
                Made by Queen&apos;s Young Caregivers Community (QYCC)
              </p>
            </div>
          </Link>
          <Link href="/" className="not-found-header-home">
            Home
          </Link>
        </div>
      </header>

      <main className="site-shell not-found-main">
        <section className="not-found-card">
          <div className="not-found-copy">
            <p className="not-found-kicker">Error 404</p>
            <h1>This page wandered off.</h1>
            <p>
              The page you&apos;re looking for doesn&apos;t exist or may have moved.
              Let&apos;s get you back to the QYCC community.
            </p>
            <div className="not-found-actions">
              <Link href="/" className="not-found-primary-action">
                Back to home <span aria-hidden="true">→</span>
              </Link>
              <a href="mailto:youngcaregiverscommunity@clubs.queensu.ca">
                Contact QYCC
              </a>
            </div>
          </div>

          <div className="not-found-art" aria-hidden="true">
            <span className="not-found-ring not-found-ring-one" />
            <span className="not-found-ring not-found-ring-two" />
            <span className="not-found-heart">
              <HeartMark />
            </span>
            <strong>404</strong>
          </div>
        </section>
      </main>

      <footer className="not-found-footer">
        <div className="site-shell">
          © 2026 Queen&apos;s Young Caregivers Community
        </div>
      </footer>
    </div>
  );
}
