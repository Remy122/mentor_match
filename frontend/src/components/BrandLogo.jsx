export function BrandMark({ inverted = false }) {
  return (
    <span
      aria-hidden="true"
      className={`brand-mark${inverted ? " brand-mark-inverted" : ""}`}
    >
      <svg viewBox="0 0 48 48" fill="none">
        <rect className="brand-mark-field" x="2" y="2" width="44" height="44" rx="14" />
        <path
          className="brand-mark-link-one"
          d="m21.5 30.5-2.4 2.4a6.5 6.5 0 0 1-9.2-9.2l5.5-5.5a6.5 6.5 0 0 1 9.2 0l1.3 1.3"
        />
        <path
          className="brand-mark-link-two"
          d="m26.5 17.5 2.4-2.4a6.5 6.5 0 0 1 9.2 9.2l-5.5 5.5a6.5 6.5 0 0 1-9.2 0l-1.3-1.3"
        />
        <path className="brand-mark-bridge" d="m18.5 29.5 11-11" />
      </svg>
    </span>
  );
}

export default function BrandLogo({
  inverted = false,
  tagline = "Peer support across Ontario",
}) {
  return (
    <span className={`brand-logo${inverted ? " brand-logo-inverted" : ""}`}>
      <BrandMark inverted={inverted} />
      <span className="brand-logo-copy">
        <strong className="brand-logo-name">Young Caregiver Community</strong>
        <span className="brand-logo-tagline">{tagline}</span>
      </span>
    </span>
  );
}
