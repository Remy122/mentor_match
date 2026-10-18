import Link from "next/link";
import BrandLogo, { BrandMark } from "../components/BrandLogo";

export default function NotFound() {
  return (
    <div className="not-found-page">
      <header className="site-header not-found-header">
        <div className="site-shell site-header-inner not-found-header-inner">
          <Link href="/" className="site-brand-link" aria-label="Young Caregiver Community home">
            <BrandLogo tagline="Peer support for young caregivers" />
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
              <BrandMark />
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
