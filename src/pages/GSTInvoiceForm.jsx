import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import { fetchGSTInvoice, createGSTInvoice, updateGSTInvoice } from '../lib/gstInvoices';
import { amtWordsIndian } from '../lib/numberToWords';
import { writeAuditLog } from '../lib/auditLog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_LINE = {
  description: '',
  hsn_code: '997212',
  unit: 'Months',
  quantity: 1,
  rate: 0,
  discount: 0,
};

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── PDF Generator ────────────────────────────────────────────────────────────
function generateGSTInvoicePDF(inv) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const L = 10; // left margin
  const R = PAGE_W - 10; // right margin
  let y = 10;

  const line = (y1) => { doc.setLineWidth(0.3); doc.line(L, y1, R, y1); };
  const box = (x, y1, w, h) => { doc.setLineWidth(0.3); doc.rect(x, y1, w, h); };

  // ── Header ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(inv.lessorName, L, y);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(inv.lessorAddress, L, y);
  y += 4;
  doc.text(`GSTIN/UIN: ${inv.lessorGSTIN}   State: ${inv.lessorState}   Code: ${inv.lessorStateCode}`, L, y);

  doc.setFontSize(8);
  doc.text('Original for Recipient / Duplicate for Transporter / Triplicate for Supplier', R, 10, { align: 'right' });

  y += 6;
  line(y); y += 4;

  // Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', PAGE_W / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  y += 5;
  line(y); y += 4;

  // ── Invoice meta (two columns) ──
  doc.setFontSize(8);
  const metaY = y;
  doc.text(`Invoice No.: ${inv.invoiceNo}`, L, y);          y += 4;
  doc.text(`Invoice Date: ${inv.invoiceDate}`, L, y);        y += 4;
  doc.text(`Reverse Charge: ${inv.reverseCharge || 'No'}`, L, y); y += 4;
  doc.text(`State: ${inv.lessorState}   Code: ${inv.lessorStateCode}`, L, y);

  y = metaY;
  doc.text(`Transport Mode: ${inv.transportMode || '—'}`, 110, y);  y += 4;
  doc.text(`Vehicle No.: ${inv.vehicleNo || '—'}`, 110, y);          y += 4;
  doc.text(`Date of Supply: ${inv.dateOfSupply || '—'}`, 110, y);    y += 4;
  doc.text(`Place of Supply: ${inv.placeOfSupply || inv.lessorState}`, 110, y);

  y = metaY + 16; y += 4;
  line(y); y += 4;

  // ── Billed To / Consignee ──
  doc.setFont('helvetica', 'bold');
  doc.text('Details of Receiver / Billed To', L, y);
  doc.text('Details of Consignee / Shipped To', 110, y);
  doc.setFont('helvetica', 'normal');
  y += 4;

  const btY = y;
  doc.text(`Name: ${inv.lesseeName}`, L, y);               y += 4;
  const addrLines = doc.splitTextToSize(`Address: ${inv.lesseeAddress}`, 90);
  doc.text(addrLines, L, y);                               y += addrLines.length * 4;
  doc.text(`GSTIN/UIN: ${inv.lesseeGSTIN}`, L, y);         y += 4;
  doc.text(`State: ${inv.lesseeState}   Code: ${inv.lesseeStateCode}`, L, y);

  y = btY;
  doc.text(`Name: ${inv.consigneeName || inv.lesseeName}`, 110, y);   y += 4;
  const caddrLines = doc.splitTextToSize(`Address: ${inv.consigneeAddress || inv.lesseeAddress}`, 90);
  doc.text(caddrLines, 110, y);                                         y += caddrLines.length * 4;
  doc.text(`GSTIN/UIN: ${inv.consigneeGSTIN || inv.lesseeGSTIN}`, 110, y); y += 4;
  doc.text(`State: ${inv.consigneeState || inv.lesseeState}   Code: ${inv.consigneeStateCode || inv.lesseeStateCode}`, 110, y);

  y = btY + Math.max(16, caddrLines.length * 4 + 12); y += 4;
  line(y); y += 2;

  // ── Line Items Table ──
  const isSameState = inv.lessorStateCode === inv.lesseeStateCode;
  const GST_RATE = 18;
  const HALF = GST_RATE / 2;

  const tableBody = inv.lineItems.map((li, idx) => {
    const amount = (li.quantity * li.rate);
    const taxable = amount - (li.discount || 0);
    const cgstAmt = isSameState ? +(taxable * HALF / 100).toFixed(2) : 0;
    const sgstAmt = isSameState ? +(taxable * HALF / 100).toFixed(2) : 0;
    const igstAmt = !isSameState ? +(taxable * GST_RATE / 100).toFixed(2) : 0;
    return [
      idx + 1,
      li.description,
      li.hsn_code || '997212',
      li.unit || 'Months',
      li.quantity,
      fmt(li.rate),
      fmt(amount),
      fmt(li.discount || 0),
      fmt(taxable),
      isSameState ? `${HALF}%` : '—', fmt(cgstAmt),
      isSameState ? `${HALF}%` : '—', fmt(sgstAmt),
      !isSameState ? `${GST_RATE}%` : '—', fmt(igstAmt),
      fmt(taxable + cgstAmt + sgstAmt + igstAmt),
    ];
  });

  const totalTaxable = inv.lineItems.reduce((s, li) => s + (li.quantity * li.rate) - (li.discount || 0), 0);
  const totalCGST = isSameState ? +(totalTaxable * HALF / 100).toFixed(2) : 0;
  const totalSGST = isSameState ? +(totalTaxable * HALF / 100).toFixed(2) : 0;
  const totalIGST = !isSameState ? +(totalTaxable * GST_RATE / 100).toFixed(2) : 0;
  const grandTotal = totalTaxable + totalCGST + totalSGST + totalIGST;

  tableBody.push([
    '', 'TOTAL', '', '',
    inv.lineItems.reduce((s, li) => s + (parseFloat(li.quantity) || 0), 0),
    '',
    fmt(inv.lineItems.reduce((s, li) => s + (li.quantity * li.rate), 0)),
    fmt(inv.lineItems.reduce((s, li) => s + (li.discount || 0), 0)),
    fmt(totalTaxable),
    '', fmt(totalCGST),
    '', fmt(totalSGST),
    '', fmt(totalIGST),
    fmt(grandTotal),
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ['Sl.', 'Description of Service', 'HSN/SAC', 'UOM', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Disc. (₹)', 'Taxable Value',
        { content: 'CGST', colSpan: 2 }, '', { content: 'SGST', colSpan: 2 }, '', { content: 'IGST', colSpan: 2 }, '', 'Total (₹)'],
      ['', '', '', '', '', '', '', '', '', 'Rate', 'Amt', 'Rate', 'Amt', 'Rate', 'Amt', ''],
    ],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 6 },
      1: { cellWidth: 32 },
      2: { cellWidth: 14 },
      3: { cellWidth: 12 },
      4: { cellWidth: 8 },
      5: { cellWidth: 14 },
      6: { cellWidth: 14 },
      7: { cellWidth: 12 },
      8: { cellWidth: 16 },
      9: { cellWidth: 8 },
      10: { cellWidth: 12 },
      11: { cellWidth: 8 },
      12: { cellWidth: 12 },
      13: { cellWidth: 8 },
      14: { cellWidth: 12 },
      15: { cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ── Amount in words ──
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount Chargeable (in words):', L, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  const words = amtWordsIndian(grandTotal, 'INR');
  doc.text(`Rupees ${words}`, L, y);
  y += 6;
  line(y); y += 4;

  // ── Bank Details + Tax Summary (two columns) ──
  const colY = y;
  doc.setFont('helvetica', 'bold');
  doc.text('Bank Details:', L, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.text(`Bank: ${inv.bankName || '—'}`, L, y);          y += 4;
  doc.text(`Branch: ${inv.bankBranch || '—'}`, L, y);      y += 4;
  doc.text(`A/c No.: ${inv.bankAccountNo || '—'}`, L, y);  y += 4;
  doc.text(`IFSC: ${inv.bankIFSC || '—'}`, L, y);

  y = colY;
  doc.setFont('helvetica', 'bold');
  doc.text('Tax Summary:', 120, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.text(`Total Before Tax: ₹${fmt(totalTaxable)}`, 120, y); y += 4;
  if (isSameState) {
    doc.text(`CGST @ ${HALF}%: ₹${fmt(totalCGST)}`, 120, y); y += 4;
    doc.text(`SGST @ ${HALF}%: ₹${fmt(totalSGST)}`, 120, y); y += 4;
  } else {
    doc.text(`IGST @ ${GST_RATE}%: ₹${fmt(totalIGST)}`, 120, y); y += 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Total After Tax: ₹${fmt(grandTotal)}`, 120, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.text('GST Payable under RCM: No', 120, y);

  y = colY + 24; y += 4;
  line(y); y += 4;

  // ── Terms ──
  if (inv.termsAndConditions) {
    doc.setFont('helvetica', 'bold');
    doc.text('Terms & Conditions:', L, y);
    doc.setFont('helvetica', 'normal');
    y += 4;
    const tlines = doc.splitTextToSize(inv.termsAndConditions, PAGE_W - 20);
    doc.text(tlines, L, y);
    y += tlines.length * 4 + 4;
    line(y); y += 4;
  }

  // ── Signature ──
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${inv.lessorName}`, R, y, { align: 'right' });
  y += 14;
  line(R - 50);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorised Signatory', R, y, { align: 'right' });

  doc.save(`${inv.invoiceNo || 'GST-Invoice'}.pdf`);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GSTInvoiceForm() {
  const { id: invId } = useParams();
  const isEdit = Boolean(invId) && invId !== 'new';
  const navigate = useNavigate();
  const { activeCompany, permissions, user } = useAuth();
  const addToast = useToast();
  const canEdit = permissions.canCreateInvoice;

  const [pageLoading, setPageLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // ── Lessor (auto from active company) ──
  const [lessorName, setLessorName] = useState('');
  const [lessorAddress, setLessorAddress] = useState('');
  const [lessorGSTIN, setLessorGSTIN] = useState('');
  const [lessorState, setLessorState] = useState('');
  const [lessorStateCode, setLessorStateCode] = useState('');

  // ── Lessee ──
  const [lesseeName, setLesseeName] = useState('Peninsular Fisheries Pvt Ltd');
  const [lesseeAddress, setLesseeAddress] = useState('17/9 B1 Madhavapuram, Kanyakumari 629704, Tamil Nadu');
  const [lesseeGSTIN, setLesseeGSTIN] = useState('33AAHCP7132Q1ZZ');
  const [lesseeState, setLesseeState] = useState('Tamil Nadu');
  const [lesseeStateCode, setLesseeStateCode] = useState('33');

  // ── Consignee (defaults to same as lessee) ──
  const [sameAsLessee, setSameAsLessee] = useState(true);
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneeGSTIN, setConsigneeGSTIN] = useState('');
  const [consigneeState, setConsigneeState] = useState('');
  const [consigneeStateCode, setConsigneeStateCode] = useState('');

  // ── Invoice details ──
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [reverseCharge, setReverseCharge] = useState('No');
  const [placeOfSupply, setPlaceOfSupply] = useState('33 - Tamil Nadu');
  const [vehicleNo, setVehicleNo] = useState('');
  const [dateOfSupply, setDateOfSupply] = useState('');
  const [transportMode, setTransportMode] = useState('');

  // ── Line Items ──
  const [lines, setLines] = useState([{ ...EMPTY_LINE, description: 'Factory Lease Rental' }]);

  // ── Bank Details ──
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIFSC, setBankIFSC] = useState('');

  // ── Terms ──
  const [termsAndConditions, setTermsAndConditions] = useState(
    'Payment due within 30 days of invoice date.\nLate payment subject to 18% per annum interest.'
  );

  // Pre-fill lessor from activeCompany
  useEffect(() => {
    if (!activeCompany) return;
    setLessorName(activeCompany.name || '');
    setLessorAddress(activeCompany.address_line1 || '');
    setLessorGSTIN(activeCompany.gstin || '');
    // RFPL is Tamil Nadu (33), RHHF is Kerala (32)
    const isRFPL = activeCompany.short_name === 'RFPL' || (activeCompany.gstin || '').startsWith('33');
    setLessorState(isRFPL ? 'Tamil Nadu' : 'Kerala');
    setLessorStateCode(isRFPL ? '33' : '32');
  }, [activeCompany]);

  // Load existing invoice for edit
  useEffect(() => {
    if (!isEdit) { setPageLoading(false); return; }
    (async () => {
      try {
        const inv = await fetchGSTInvoice(invId);
        setLessorName(inv.lessor_name || '');
        setLessorAddress(inv.lessor_address || '');
        setLessorGSTIN(inv.lessor_gstin || '');
        setLessorState(inv.lessor_state || '');
        setLessorStateCode(inv.lessor_state_code || '');
        setLesseeName(inv.lessee_name || '');
        setLesseeAddress(inv.lessee_address || '');
        setLesseeGSTIN(inv.lessee_gstin || '');
        setLesseeState(inv.lessee_state || '');
        setLesseeStateCode(inv.lessee_state_code || '');
        setSameAsLessee(inv.consignee_same_as_lessee !== false);
        setConsigneeName(inv.consignee_name || '');
        setConsigneeAddress(inv.consignee_address || '');
        setConsigneeGSTIN(inv.consignee_gstin || '');
        setConsigneeState(inv.consignee_state || '');
        setConsigneeStateCode(inv.consignee_state_code || '');
        setInvoiceDate(inv.invoice_date || today());
        setReverseCharge(inv.reverse_charge || 'No');
        setPlaceOfSupply(inv.place_of_supply || '');
        setVehicleNo(inv.vehicle_no || '');
        setDateOfSupply(inv.date_of_supply || '');
        setTransportMode(inv.transport_mode || '');
        setBankName(inv.bank_name || '');
        setBankBranch(inv.bank_branch || '');
        setBankAccountNo(inv.bank_account_no || '');
        setBankIFSC(inv.bank_ifsc || '');
        setTermsAndConditions(inv.terms_conditions || '');
        if (inv.line_items?.length) {
          setLines(inv.line_items.map((li) => ({
            description: li.description || '',
            hsn_code: li.hsn_code || '997212',
            unit: li.unit || 'Months',
            quantity: li.quantity ?? 1,
            rate: li.rate ?? 0,
            discount: li.discount_percent ?? 0,
          })));
        }
      } catch (err) {
        addToast('Failed to load invoice: ' + err.message, 'error');
        navigate('/gst-invoices');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [isEdit, invId, addToast, navigate]);

  // ── Totals ──
  const isSameState = lessorStateCode === lesseeStateCode;
  const GST_RATE = 18;
  const HALF = GST_RATE / 2;

  const { totalTaxable, totalCGST, totalSGST, totalIGST, grandTotal } = useMemo(() => {
    const totalTaxable = lines.reduce((s, l) => {
      const amt = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
      return s + amt - (parseFloat(l.discount) || 0);
    }, 0);
    const totalCGST = isSameState ? +(totalTaxable * HALF / 100).toFixed(2) : 0;
    const totalSGST = isSameState ? +(totalTaxable * HALF / 100).toFixed(2) : 0;
    const totalIGST = !isSameState ? +(totalTaxable * GST_RATE / 100).toFixed(2) : 0;
    return { totalTaxable, totalCGST, totalSGST, totalIGST, grandTotal: totalTaxable + totalCGST + totalSGST + totalIGST };
  }, [lines, isSameState]);

  // ── Line helpers ──
  const updateLine = (idx, field, val) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // ── Save ──
  const handleSave = async (statusOverride) => {
    if (!activeCompany) return;
    if (!lessorName.trim()) { addToast('Lessor name is required', 'error'); return; }
    if (!lesseeName.trim()) { addToast('Lessee name is required', 'error'); return; }
    if (!lines.some((l) => l.description.trim())) { addToast('At least one line item required', 'error'); return; }

    setSaving(true);
    try {
      const invData = {
        company_id: activeCompany.id,
        doc_type: 'gst_lease',
        status: statusOverride || 'draft',
        invoice_date: invoiceDate || null,
        currency: 'INR',
        // Lessor
        lessor_name: lessorName,
        lessor_address: lessorAddress,
        lessor_gstin: lessorGSTIN,
        lessor_state: lessorState,
        lessor_state_code: lessorStateCode,
        // Lessee
        lessee_name: lesseeName,
        lessee_address: lesseeAddress,
        lessee_gstin: lesseeGSTIN,
        lessee_state: lesseeState,
        lessee_state_code: lesseeStateCode,
        // Consignee
        consignee_same_as_lessee: sameAsLessee,
        consignee_name: sameAsLessee ? null : consigneeName,
        consignee_address: sameAsLessee ? null : consigneeAddress,
        consignee_gstin: sameAsLessee ? null : consigneeGSTIN,
        consignee_state: sameAsLessee ? null : consigneeState,
        consignee_state_code: sameAsLessee ? null : consigneeStateCode,
        // Invoice details
        reverse_charge: reverseCharge,
        place_of_supply: placeOfSupply,
        vehicle_no: vehicleNo || null,
        date_of_supply: dateOfSupply || null,
        transport_mode: transportMode || null,
        // Bank
        bank_name: bankName || null,
        bank_branch: bankBranch || null,
        bank_account_no: bankAccountNo || null,
        bank_ifsc: bankIFSC || null,
        // Terms
        terms_conditions: termsAndConditions || null,
        // Totals
        subtotal: totalTaxable,
        tax_amount: totalCGST + totalSGST + totalIGST,
        total: grandTotal,
        // Stored on invoice for display/export reference
        bill_to_company: lesseeName,
        bill_to_address: lesseeAddress,
        bill_to_gstin: lesseeGSTIN,
        created_by: user?.id,
      };

      const lineItemsData = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description,
          hsn_code: l.hsn_code || '997212',
          unit: l.unit || 'Months',
          quantity: parseFloat(l.quantity) || 1,
          rate: parseFloat(l.rate) || 0,
          discount_percent: parseFloat(l.discount) || 0,
          amount: (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0) - (parseFloat(l.discount) || 0),
        }));

      if (isEdit) {
        await updateGSTInvoice(invId, invData, lineItemsData);
        writeAuditLog({ companyId: activeCompany.id, action: 'update', tableName: 'invoices', recordId: invId });
        addToast('Invoice updated', 'success');
      } else {
        const newInv = await createGSTInvoice(invData, lineItemsData, activeCompany);
        writeAuditLog({ companyId: activeCompany.id, action: 'create', tableName: 'invoices', recordId: newInv.id });
        addToast('Invoice created: ' + newInv.invoice_number, 'success');
      }
      navigate('/gst-invoices');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Download PDF ──
  const handleDownloadPDF = () => {
    const invoiceData = {
      invoiceNo: isEdit ? '—' : '(not saved yet)',
      invoiceDate,
      reverseCharge,
      placeOfSupply,
      vehicleNo,
      dateOfSupply,
      transportMode,
      lessorName, lessorAddress, lessorGSTIN, lessorState, lessorStateCode,
      lesseeName, lesseeAddress, lesseeGSTIN, lesseeState, lesseeStateCode,
      consigneeName: sameAsLessee ? lesseeName : consigneeName,
      consigneeAddress: sameAsLessee ? lesseeAddress : consigneeAddress,
      consigneeGSTIN: sameAsLessee ? lesseeGSTIN : consigneeGSTIN,
      consigneeState: sameAsLessee ? lesseeState : consigneeState,
      consigneeStateCode: sameAsLessee ? lesseeStateCode : consigneeStateCode,
      lineItems: lines.filter((l) => l.description.trim()),
      bankName, bankBranch, bankAccountNo, bankIFSC,
      termsAndConditions,
    };
    generateGSTInvoicePDF(invoiceData);
  };

  if (pageLoading) return <LoadingSpinner />;

  const inp = (label, val, setter, opts = {}) => (
    <div className={`form-group${opts.span2 ? ' form-group--span2' : ''}`}>
      <label className="form-label">{label}</label>
      {opts.textarea ? (
        <textarea className="form-input" value={val} onChange={(e) => setter(e.target.value)} rows={opts.rows || 3} readOnly={opts.readOnly} />
      ) : opts.select ? (
        <select className="form-input" value={val} onChange={(e) => setter(e.target.value)}>
          {opts.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input className="form-input" type={opts.type || 'text'} value={val} onChange={(e) => setter(e.target.value)} readOnly={opts.readOnly} placeholder={opts.placeholder} />
      )}
    </div>
  );

  return (
    <div className="gst-form">
      {/* Page Header */}
      <div className="gst-form__header">
        <div>
          <h1 className="gst-form__title">GST Tax Invoice — Lease Rental</h1>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {isEdit ? `Editing invoice` : 'New Invoice'} · HSN/SAC 997212 · {activeCompany?.short_name}
          </p>
        </div>
        <div className="gst-form__actions">
          <button type="button" className="btn" onClick={() => navigate('/gst-invoices')}>Cancel</button>
          <button type="button" className="btn" onClick={handleDownloadPDF}>⬇ Preview PDF</button>
          <button type="button" className="btn btn-primary" disabled={saving || !canEdit} onClick={() => handleSave('draft')}>
            {saving ? 'Saving…' : isEdit ? 'Update Invoice' : 'Save Invoice'}
          </button>
        </div>
      </div>

      {/* ── Section: Lessor (From) ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Lessor Details (From)</div>
        <div className="po-form__grid">
          {inp('Company Name *', lessorName, setLessorName)}
          {inp('GSTIN / UIN', lessorGSTIN, setLessorGSTIN)}
          {inp('Address', lessorAddress, setLessorAddress, { span2: true })}
          {inp('State', lessorState, setLessorState)}
          {inp('State Code', lessorStateCode, setLessorStateCode)}
        </div>
      </div>

      {/* ── Section: Invoice Details ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Invoice Details</div>
        <div className="po-form__grid">
          {inp('Invoice Date *', invoiceDate, setInvoiceDate, { type: 'date' })}
          {inp('Reverse Charge', reverseCharge, setReverseCharge, { select: true, options: ['No', 'Yes'] })}
          {inp('Place of Supply', placeOfSupply, setPlaceOfSupply, { placeholder: '33 - Tamil Nadu' })}
          {inp('Date of Supply', dateOfSupply, setDateOfSupply, { type: 'date' })}
          {inp('Vehicle No.', vehicleNo, setVehicleNo, { placeholder: 'Optional' })}
          {inp('Transport Mode', transportMode, setTransportMode, { placeholder: 'Optional' })}
        </div>
      </div>

      {/* ── Section: Lessee (Billed To) ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Lessee Details (Billed To)</div>
        <div className="po-form__grid">
          {inp('Company Name *', lesseeName, setLesseeName)}
          {inp('GSTIN / UIN', lesseeGSTIN, setLesseeGSTIN)}
          {inp('Address', lesseeAddress, setLesseeAddress, { span2: true })}
          {inp('State', lesseeState, setLesseeState)}
          {inp('State Code', lesseeStateCode, setLesseeStateCode)}
        </div>
      </div>

      {/* ── Section: Consignee (Shipped To) ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Consignee Details (Shipped To)</div>
        <label className="md-toggle" style={{ marginBottom: '1rem', display: 'block' }}>
          <input type="checkbox" checked={sameAsLessee} onChange={(e) => setSameAsLessee(e.target.checked)} />
          Same as Lessee
        </label>
        {!sameAsLessee && (
          <div className="po-form__grid">
            {inp('Company Name', consigneeName, setConsigneeName)}
            {inp('GSTIN / UIN', consigneeGSTIN, setConsigneeGSTIN)}
            {inp('Address', consigneeAddress, setConsigneeAddress, { span2: true })}
            {inp('State', consigneeState, setConsigneeState)}
            {inp('State Code', consigneeStateCode, setConsigneeStateCode)}
          </div>
        )}
        {sameAsLessee && (
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Consignee details will match Lessee — {lesseeName}</p>
        )}
      </div>

      {/* ── Section: Line Items ── */}
      <div className="card gst-section">
        <div className="gst-section__title-row">
          <div className="gst-section__title">Line Items</div>
          <button type="button" className="btn btn-sm btn-primary" onClick={addLine}>+ Add Line</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gst-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description *</th>
                <th>HSN/SAC</th>
                <th>UOM</th>
                <th>Qty</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
                <th>Discount (₹)</th>
                <th>Taxable Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const amount = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
                const taxable = amount - (parseFloat(l.discount) || 0);
                return (
                  <tr key={idx}>
                    <td className="text-center">{idx + 1}</td>
                    <td><input className="form-input form-input--sm" value={l.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} placeholder="Service description" /></td>
                    <td><input className="form-input form-input--sm" value={l.hsn_code} onChange={(e) => updateLine(idx, 'hsn_code', e.target.value)} style={{ width: '80px' }} /></td>
                    <td><input className="form-input form-input--sm" value={l.unit} onChange={(e) => updateLine(idx, 'unit', e.target.value)} style={{ width: '80px' }} /></td>
                    <td><input className="form-input form-input--sm mono" type="number" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ width: '70px' }} min="0" step="0.01" /></td>
                    <td><input className="form-input form-input--sm mono" type="number" value={l.rate} onChange={(e) => updateLine(idx, 'rate', e.target.value)} style={{ width: '110px' }} min="0" step="0.01" /></td>
                    <td className="text-right mono">₹{fmt(amount)}</td>
                    <td><input className="form-input form-input--sm mono" type="number" value={l.discount} onChange={(e) => updateLine(idx, 'discount', e.target.value)} style={{ width: '90px' }} min="0" step="0.01" /></td>
                    <td className="text-right mono">₹{fmt(taxable)}</td>
                    <td className="text-center">
                      <button type="button" className="btn btn-sm btn-danger-outline" disabled={lines.length === 1} onClick={() => removeLine(idx)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tax Summary */}
        <div className="gst-totals">
          <div className="gst-totals__left">
            <div className="gst-totals__tax-indicator">
              {isSameState
                ? <span className="badge badge--success">Intra-State → CGST {HALF}% + SGST {HALF}%</span>
                : <span className="badge badge--warning">Inter-State → IGST {GST_RATE}%</span>}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Amount in words: <strong>{amtWordsIndian(grandTotal, 'INR')}</strong>
            </p>
          </div>
          <div className="gst-totals__right">
            <div className="gst-totals__row"><span>Total Before Tax</span><span className="mono">₹{fmt(totalTaxable)}</span></div>
            {isSameState && <>
              <div className="gst-totals__row"><span>CGST @ {HALF}%</span><span className="mono">₹{fmt(totalCGST)}</span></div>
              <div className="gst-totals__row"><span>SGST @ {HALF}%</span><span className="mono">₹{fmt(totalSGST)}</span></div>
            </>}
            {!isSameState && <div className="gst-totals__row"><span>IGST @ {GST_RATE}%</span><span className="mono">₹{fmt(totalIGST)}</span></div>}
            <div className="gst-totals__row gst-totals__row--total"><span>Grand Total</span><span className="mono">₹{fmt(grandTotal)}</span></div>
          </div>
        </div>
      </div>

      {/* ── Section: Bank Details ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Bank Details</div>
        <div className="po-form__grid">
          {inp('Bank Name', bankName, setBankName)}
          {inp('Branch', bankBranch, setBankBranch)}
          {inp('Account Number', bankAccountNo, setBankAccountNo)}
          {inp('IFSC Code', bankIFSC, setBankIFSC)}
        </div>
      </div>

      {/* ── Section: Terms ── */}
      <div className="card gst-section">
        <div className="gst-section__title">Terms & Conditions</div>
        <div className="form-group">
          <textarea className="form-input" value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} rows={3} />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="gst-form__footer">
        <button type="button" className="btn" onClick={() => navigate('/gst-invoices')}>Cancel</button>
        <button type="button" className="btn" onClick={handleDownloadPDF}>⬇ Download PDF</button>
        <button type="button" className="btn btn-primary" disabled={saving || !canEdit} onClick={() => handleSave('draft')}>
          {saving ? 'Saving…' : isEdit ? 'Update Invoice' : 'Save Invoice'}
        </button>
      </div>
    </div>
  );
}
