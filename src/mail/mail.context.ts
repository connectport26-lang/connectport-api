export type EmailDetailRow = { label: string; value: string };

export type RequestEmailSource = {
  reference: string;
  sourceType: string;
  sourceValue: string;
  quantity: number;
  budgetMax: number;
  qualityNotes?: string | null;
  flexibility?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  budgetScope?: string | null;
  needByDate?: string | null;
  needByTimeframe?: string | null;
  references?: Array<{ kind: string; value: string }> | null;
};

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

/** Truncate for email snippet / subject context. */
export function ellipsisText(value: string, max = 120) {
  const t = value.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function shortUrl(value: string, max = 56) {
  try {
    const u = new URL(value.trim());
    const path =
      u.pathname && u.pathname !== '/'
        ? u.pathname.length > 18
          ? `${u.pathname.slice(0, 18)}…`
          : u.pathname
        : '';
    const out = `${u.hostname}${path}`;
    return out.length > max ? `${out.slice(0, max - 1)}…` : out;
  } catch {
    return ellipsisText(value, max);
  }
}

function lookingForLabel(request: RequestEmailSource) {
  const named = request.productName?.trim();
  if (named) return named;
  const desc = request.productDescription?.trim();
  if (desc) return desc;
  if (request.sourceType === 'photo') return 'Photo request';
  if (request.sourceType === 'link' || looksLikeUrl(request.sourceValue)) {
    return request.sourceValue;
  }
  return request.sourceValue?.trim() || 'Your request';
}

function requestLink(request: RequestEmailSource) {
  const ref = request.references?.find((item) => item.kind === 'link');
  if (ref?.value) return ref.value;
  if (request.sourceType === 'link') return request.sourceValue;
  const desc = request.productDescription?.trim() || request.sourceValue?.trim();
  if (desc && looksLikeUrl(desc)) return desc;
  return undefined;
}

function formatBudget(amount: number, scope?: string | null) {
  const naira = `₦${Number(amount).toLocaleString('en-NG')}`;
  if (scope === 'per_unit') return `${naira} / piece`;
  return `${naira} total`;
}

function needByLabel(request: RequestEmailSource) {
  if (request.needByDate) {
    try {
      return new Date(request.needByDate).toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return request.needByDate;
    }
  }
  if (request.needByTimeframe?.trim()) return request.needByTimeframe.trim();
  return undefined;
}

/** Highlighted snippet + structured rows for request-related emails. */
export function buildRequestEmailContext(request: RequestEmailSource): {
  snippet: string;
  details: EmailDetailRow[];
} {
  const lookingFor = lookingForLabel(request);
  const link = requestLink(request);
  const notes = request.qualityNotes?.trim();
  const needBy = needByLabel(request);

  const details: EmailDetailRow[] = [
    { label: 'Reference', value: request.reference },
    {
      label: 'Looking for',
      value: looksLikeUrl(lookingFor)
        ? shortUrl(lookingFor, 64)
        : ellipsisText(lookingFor, 160),
    },
  ];

  if (link) {
    details.push({ label: 'Link', value: shortUrl(link, 64) });
  }

  details.push(
    { label: 'Quantity', value: String(request.quantity) },
    {
      label: 'Budget',
      value: formatBudget(request.budgetMax, request.budgetScope),
    },
  );

  if (needBy) {
    details.push({ label: 'Need by', value: needBy });
  }

  if (request.flexibility) {
    details.push({
      label: 'Match',
      value: request.flexibility === 'exact' ? 'Exact match' : 'Similar OK',
    });
  }

  if (notes) {
    details.push({ label: 'Notes', value: ellipsisText(notes, 180) });
  }

  const hasPhoto =
    request.sourceType === 'photo' ||
    Boolean(request.references?.some((item) => item.kind === 'image'));
  if (hasPhoto) {
    details.push({ label: 'Photo', value: 'Attached' });
  }

  return {
    snippet: ellipsisText(
      looksLikeUrl(lookingFor) ? shortUrl(lookingFor, 72) : lookingFor,
      120,
    ),
    details,
  };
}
