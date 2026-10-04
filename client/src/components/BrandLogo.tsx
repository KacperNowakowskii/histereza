const variants = {
  horizontal: 'histereza-logo-poziom.svg',
  vertical: 'histereza-logo-pion.svg',
  wordmark: 'histereza-wordmark.svg',
  symbol: 'histereza-znak.svg',
};

/** Original artwork: proportions and colours are preserved. */
export function BrandLogo({ variant = 'horizontal', className = '' }: {
  variant?: keyof typeof variants;
  className?: string;
}) {
  return <img src={`/brand/${variants[variant]}`} alt="Histereza" className={`brand-logo brand-logo-${variant} ${className}`} />;
}
