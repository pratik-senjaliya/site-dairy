// Live stock per site = received − issued ± transfers. The ledger stores signed deltas;
// these helpers are the only place that turns movements into deltas or deltas into stock.

export type StockSource = 'grn' | 'issue' | 'transfer_out' | 'transfer_in' | 'adjustment';

export function stockDelta(source: StockSource, qty: number): number {
  if (qty < 0) throw new RangeError('Quantity cannot be negative');
  return source === 'issue' || source === 'transfer_out' ? -qty : qty;
}

/** Accepted quantity of a GRN line: what arrived minus what was rejected at the gate. */
export function acceptedQty(qty: number, rejectedQty: number): number {
  if (rejectedQty > qty) throw new RangeError('Rejected quantity is more than received');
  return roundQty(qty - rejectedQty);
}

export function stockOnHand(deltas: number[]): number {
  return roundQty(deltas.reduce((sum, d) => sum + d, 0));
}

export function isLowStock(onHand: number, minStock: number | null | undefined): boolean {
  return minStock != null && minStock > 0 && onHand < minStock;
}

/** Quantities are decimal(12,3): keep three places and avoid float dust. */
export function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}
