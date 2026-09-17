export const ACCOUNT_CAPS = {
  individual: {
    label: 'Individual',
    maxBudgetNgn: 2_000_000,
    maxQuantity: 50,
  },
  business: {
    label: 'Business',
    maxBudgetNgn: 20_000_000,
    maxQuantity: 500,
  },
} as const;

export const REQUESTER_STATUS_LABELS: Record<string, string> = {
  submitted: 'Request received',
  quoted: 'Quote ready',
  approved_paid: 'Paid and confirmed',
  procured: 'Goods being bought',
  in_transit_china_warehouse: 'At the China warehouse',
  in_transit_freight: 'On its way from China',
  arrived_nigeria_warehouse: 'Arrived in Nigeria',
  delivered: 'Delivered',
};
