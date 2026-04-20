// Number-to-words converters
// TWO systems as per reference HTML files:
//   PO  → Indian numbering (Crore, Lakh, Thousand) — amtWordsIndian()
//   INV → International numbering (Million, Thousand) — amtWordsIntl()
// DO NOT change these formulas — they match the reference exactly.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

// Convert 0–999 to words
function chunk(n) {
  let r = '';
  if (n >= 100) {
    r += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    r += TENS[Math.floor(n / 10)] + ' ';
    n %= 10;
  }
  if (n > 0) r += ONES[n] + ' ';
  return r.trim();
}

// ─── INDIAN NUMBERING (Crore / Lakh / Thousand) ─────────
// Used for Purchase Orders
function n2wIndian(n) {
  if (n === 0) return 'Zero';
  let r = '';
  if (n >= 10000000) {
    r += chunk(Math.floor(n / 10000000)) + ' Crore ';
    n %= 10000000;
  }
  if (n >= 100000) {
    r += chunk(Math.floor(n / 100000)) + ' Lakh ';
    n %= 100000;
  }
  if (n >= 1000) {
    r += chunk(Math.floor(n / 1000)) + ' Thousand ';
    n %= 1000;
  }
  if (n > 0) r += chunk(Math.floor(n));
  return r.trim();
}

// PO amount in words: "One Lakh Fifty Thousand and 67 Paise INR Only"
export function amtWordsIndian(total, currency = 'INR') {
  const w = n2wIndian(Math.floor(total));
  const p = Math.round((total % 1) * 100);
  return w + (p > 0 ? ' and ' + n2wIndian(p) + ' Paise' : '') + ' ' + currency + ' Only';
}

// ─── INTERNATIONAL NUMBERING (Million / Thousand) ────────
// Used for Invoices
function n2wIntl(n) {
  if (n === 0) return 'Zero';
  let r = '';
  if (n >= 1000000) {
    r += chunk(Math.floor(n / 1000000)) + ' Million ';
    n %= 1000000;
  }
  if (n >= 1000) {
    r += chunk(Math.floor(n / 1000)) + ' Thousand ';
    n %= 1000;
  }
  if (n > 0) r += chunk(Math.floor(n));
  return r.trim();
}

// Invoice amount in words: "One Million Two Hundred Thirty Four and 89/100 USD Only"
export function amtWordsIntl(total, currency = 'USD') {
  const w = n2wIntl(Math.floor(total));
  const cents = Math.round((total % 1) * 100);
  return w + (cents > 0 ? ' and ' + n2wIntl(cents) + '/100' : ' and 00/100') + ' ' + currency + ' Only';
}
