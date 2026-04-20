// ─── Tally Prime XML Generation ──────────────────────────
// Step 18: Download XML only. Step 22 adds direct push.

function escXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatTallyDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 10).replace(/-/g, '');
}

export function getCreditLedger(paymentMode, config) {
  if (paymentMode === 'Cash') return config.cash_ledger || 'Cash';
  if (paymentMode === 'UPI') return config.upi_ledger || 'UPI';
  if (paymentMode === 'Account Transfer') return config.bank_ledger || 'Bank Account';
  return config.bank_ledger || 'Bank Account';
}

export function buildNarration(voucher) {
  let base = voucher.narration || `Payment to ${voucher.payee_name} via ${voucher.payment_mode}`;

  const items = voucher.narration_items;
  if (Array.isArray(items) && items.length > 0) {
    const itemStr = items.map((i) => `${i.description}: ₹${i.amount}`).join(', ');
    base += ' | Items: ' + itemStr;
  }

  if (voucher.head_of_account) {
    base += ' | Head: ' + voucher.head_of_account;
    if (voucher.sub_head_of_account) base += ' / ' + voucher.sub_head_of_account;
  }

  return base;
}

export function generateTallyXml(vouchers, config) {
  if (!config?.tally_company_name) {
    throw new Error('Tally company name is required in tally_config');
  }

  const voucherBlocks = vouchers.map((v) => {
    const date = formatTallyDate(v.approved_at || v.completed_at);
    const narration = escXml(buildNarration(v));
    const payeeName = escXml(v.payee_name);
    const creditLedger = escXml(getCreditLedger(v.payment_mode, config));
    const amount = (parseFloat(v.amount) || 0).toFixed(2);
    const serialNo = escXml(v.serial_number);

    return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Payment" ACTION="Create" OBJVIEW="Payment Voucher View">
        <DATE>${date}</DATE>
        <NARRATION>${narration}</NARRATION>
        <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${serialNo}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${payeeName}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${payeeName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${creditLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escXml(config.tally_company_name)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${voucherBlocks.join('\n')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

export function downloadXmlFile(xmlString, companyShort) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const batchShort = crypto.randomUUID().slice(0, 8);
  const filename = `Tally_Export_${companyShort}_${dateStr}_${batchShort}.xml`;
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
