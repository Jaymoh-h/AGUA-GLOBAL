import { Droplets } from "lucide-react";

function BrandLoader({ label = "Loading", compact = false, decorative = false }) {
  return (
    <span
      className={`brand-loader${compact ? " brand-loader-compact" : ""}`}
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative ? true : undefined}
    >
      <span className="brand-loader-ring" aria-hidden="true" />
      <span className="brand-loader-mark" aria-hidden="true"><Droplets /></span>
      {!decorative ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default BrandLoader;
