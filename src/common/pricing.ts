/** Shared landing-cost pricing (mirrors frontend domain/pricing.ts). */

export const DEFAULT_SHIPPING_RATE_PER_KG = 4_500;

export const DEFAULT_SERVICE_FEE_RULE = {
  base: 15_000,
  percentOfProduct: 0.08,
  min: 25_000,
  max: 350_000,
} as const;

export function calculateServiceFee(productCost: number): number {
  const rule = DEFAULT_SERVICE_FEE_RULE;
  const raw = rule.base + productCost * rule.percentOfProduct;
  const floored = Math.max(raw, rule.min);
  return Math.round(Math.min(floored, rule.max));
}

export function calculateQuoteBreakdown(input: {
  unitPrice: number;
  quantity: number;
  weightKgPerUnit: number;
}) {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const productCost = Math.round(input.unitPrice * quantity);
  const weightKg = Number((input.weightKgPerUnit * quantity).toFixed(2));
  const freightEstimate = Math.round(weightKg * DEFAULT_SHIPPING_RATE_PER_KG);
  const serviceFee = calculateServiceFee(productCost);
  const totalCost = productCost + freightEstimate + serviceFee;

  return {
    unitPrice: input.unitPrice,
    quantity,
    productCost,
    weightKg,
    freightEstimate,
    serviceFee,
    totalCost,
    leadTimeDays: null as number | null,
  };
}
