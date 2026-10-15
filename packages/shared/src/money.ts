// Money is always integer paise. Rupees exist only at the edges (input boxes, display).

export type Paise = number;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** ₹1,25,000 (whole rupees unless paise are present). */
export function formatPaise(paise: Paise): string {
  return (paise % 100 === 0 ? inrWhole : inr).format(paise / 100);
}

/** 1,25,000 — Indian grouping for counts and quantities. */
export function formatNumber(n: number, maxFractionDigits = 3): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxFractionDigits }).format(n);
}
