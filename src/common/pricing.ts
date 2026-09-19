/** Shared landing-cost pricing (mirrors frontend domain/pricing.ts). */

export const DEFAULT_SHIPPING_RATE_PER_KG = 4_500;

export const DEFAULT_SERVICE_FEE_RULE = {
  base: 15_000,
  percentOfProduct: 0.08,
  min: 25_000,
  max: 350_000,
} as const;

export type FeeMode = 'fixed' | 'percent';

export type LandingPriceConfig = {
  shippingRatePerKg: number;
  agentFeeMode: FeeMode;
  agentFeeValue: number;
  agentFeeMin?: number | null;
  agentFeeMax?: number | null;
  miscMode: FeeMode;
  miscValue: number;
  miscMin?: number | null;
  miscMax?: number | null;
  profitMode: FeeMode;
  profitValue: number;
  profitMin: number;
  profitMax: number;
  serviceLabel?: string;
};

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

function applyFee(
  base: number,
  mode: FeeMode,
  value: number,
  min?: number | null,
  max?: number | null,
) {
  let amount =
    mode === 'percent' ? Math.round(base * (value / 100)) : Math.round(value);
  if (min != null) amount = Math.max(amount, Math.round(min));
  if (max != null) amount = Math.min(amount, Math.round(max));
  return amount;
}

/**
 * Sourcing find landing price:
 * supplierCost + agentFee + shipping + misc + profit
 * Customer-facing "service" line = agentFee + misc + profit.
 */
export function calculateLandingPrice(input: {
  supplierCost: number;
  quantity: number;
  weightKgPerUnit: number;
  config: LandingPriceConfig;
}) {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const supplierCost = Math.round(input.supplierCost * quantity);
  const weightKg = Number((input.weightKgPerUnit * quantity).toFixed(2));
  const shipping = Math.round(weightKg * input.config.shippingRatePerKg);
  const agentFee = applyFee(
    supplierCost,
    input.config.agentFeeMode,
    input.config.agentFeeValue,
    input.config.agentFeeMin,
    input.config.agentFeeMax,
  );
  const misc = applyFee(
    supplierCost,
    input.config.miscMode,
    input.config.miscValue,
    input.config.miscMin,
    input.config.miscMax,
  );
  const profit = applyFee(
    supplierCost,
    input.config.profitMode,
    input.config.profitValue,
    input.config.profitMin,
    input.config.profitMax,
  );
  const serviceFee = agentFee + misc + profit;
  const totalCost = supplierCost + shipping + serviceFee;
  const unitPrice = Math.round(totalCost / quantity);

  return {
    quantity,
    weightKg,
    supplierCost,
    shipping,
    agentFee,
    misc,
    profit,
    serviceFee,
    productCost: supplierCost,
    freightEstimate: shipping,
    totalCost,
    unitPrice,
    serviceLabel: input.config.serviceLabel ?? 'Service & logistics',
    lines: [
      {
        label: 'Product',
        amount: supplierCost,
        hint: `Supplier cost × ${quantity}`,
      },
      {
        label: 'Shipping',
        amount: shipping,
        hint: `${weightKg} kg to Nigeria warehouse`,
      },
      {
        label: input.config.serviceLabel ?? 'Service & logistics',
        amount: serviceFee,
        hint: 'Concierge, handling, and margin',
      },
    ],
  };
}
