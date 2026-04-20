import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import {
  fetchInvoice,
  createInvoice,
  updateInvoice,
  calcInvoiceLineAmount,
  calcInvoiceTotals,
} from '../lib/invoices';
import { fetchBuyers } from '../lib/buyers';
import { fetchDeliveryAddresses } from '../lib/deliveryAddresses';
import { fetchProducts } from '../lib/products';
import { amtWordsIntl } from '../lib/numberToWords';
import { ISSUE_ADDRESS } from '../lib/supabase';
import { writeAuditLog } from '../lib/auditLog';
import LoadingSpinner from '../components/common/LoadingSpinner';

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
];

const FREIGHT_TYPES = ['Sea Freight', 'Air Freight', 'Road / Truck', 'Courier / Express', 'Ex-Works'];
const INCOTERMS = ['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'DAP', 'FCA', 'CPT'];

const PAYMENT_TERMS = [
  'Advance / TT in advance',
  '50% advance, 50% before shipment',
  'LC at sight',
  'Net 30',
  'Net 60',
  'CAD — Cash Against Documents',
  'Open account',
];

const EMPTY_LINE = { description: '', hsn_code: '', qty: '', unit: 'MT', rate: '' };
const EMPTY_PACK_LINE = { marks: '', pkgs: '', pkg_type: 'Carton', gross_wt: '', net_wt: '', dimensions: '' };

const today = () => new Date().toISOString().slice(0, 10);
const plus30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const issueAddr = [ISSUE_ADDRESS.line1, ISSUE_ADDRESS.line2, ISSUE_ADDRESS.country].filter(Boolean).join(', ');

export default function InvoiceForm() {
  const { id: invId } = useParams();
  const isEdit = Boolean(invId) && invId !== 'new';
  const navigate = useNavigate();
  const { activeCompany, hasRole } = useAuth();
  const addToast = useToast();
  const canEdit = hasRole(['super_admin', 'admin', 'operations']);

  const [step, setStep] = useState(0);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Lookups
  const [buyers, setBuyers] = useState([]);
  const [deliveryAddrs, setDeliveryAddrs] = useState([]);
  const [products, setProducts] = useState([]);

  // Doc type toggle
  const [docType, setDocType] = useState('proforma');

  // Invoice info
  const [invDate, setInvDate] = useState(today());
  const [invExpiry, setInvExpiry] = useState(plus30());
  const [currency, setCurrency] = useState('USD');
  const [custRef, setCustRef] = useState('');
  const [reasonExport, setReasonExport] = useState('');
  const [lcNumber, setLcNumber] = useState('');
  const [lcDate, setLcDate] = useState('');

  // Buyer (Bill To)
  const [buyerId, setBuyerId] = useState('');
  const [billCo, setBillCo] = useState('');
  const [billA1, setBillA1] = useState('');
  const [billA2, setBillA2] = useState('');
  const [billCity, setBillCity] = useState('');
  const [billState, setBillState] = useState('');
  const [billZip, setBillZip] = useState('');
  const [billCountry, setBillCountry] = useState('');
  const [billContact, setBillContact] = useState('');
  const [billPhone, setBillPhone] = useState('');
  const [billEmail, setBillEmail] = useState('');
  const [billGstin, setBillGstin] = useState('');

  // Ship To
  const [shipCo, setShipCo] = useState('');
  const [shipA1, setShipA1] = useState('');
  const [shipA2, setShipA2] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipZip, setShipZip] = useState('');
  const [shipCountry, setShipCountry] = useState('');
  const [notifyParty, setNotifyParty] = useState('');

  // Shipping
  const [freightType, setFreightType] = useState(FREIGHT_TYPES[0]);
  const [incoterm, setIncoterm] = useState(INCOTERMS[0]);
  const [pol, setPol] = useState('');
  const [pod, setPod] = useState('');
  const [shipDate, setShipDate] = useState('');
  const [delDate, setDelDate] = useState('');
  const [vessel, setVessel] = useState('');
  const [blNo, setBlNo] = useState('');
  const [grossWt, setGrossWt] = useState('');
  const [netWt, setNetWt] = useState('');
  const [cube, setCube] = useState('');
  const [totalPkgs, setTotalPkgs] = useState('');
  const [marks, setMarks] = useState('');
  const [countryOrigin, setCountryOrigin] = useState('');
  const [finalDest, setFinalDest] = useState('');

  // Line items
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  // Terms
  const [payTerms, setPayTerms] = useState(PAYMENT_TERMS[0]);
  const [taxRate, setTaxRate] = useState('0');
  const [extraCharges, setExtraCharges] = useState('0');
  const [bankDetails, setBankDetails] = useState('');
  const [termsText, setTermsText] = useState('');

  // Packing & Customs (commercial only)
  const [packLines, setPackLines] = useState([{ ...EMPTY_PACK_LINE }]);
  const [hsCode, setHsCode] = useState('');
  const [cooNo, setCooNo] = useState('');
  const [phytoNo, setPhytoNo] = useState('');
  const [declaration, setDeclaration] = useState('');
  const [customsRemarks, setCustomsRemarks] = useState('');

  const isComm = docType === 'commercial';

  // Steps config — step 5 (packing) only for commercial
  const STEPS = useMemo(() => {
    const base = [
      '1 · Invoice Info',
      '2 · Buyer',
      '3 · Shipping',
      '4 · Line Items',
      '5 · Terms & Totals',
    ];
    if (isComm) base.push('6 · Packing & Customs');
    base.push(isComm ? '7 · Review & Export' : '6 · Review & Export');
    return base;
  }, [isComm]);

  const reviewStep = STEPS.length - 1;
  const packStep = isComm ? 5 : -1;

  // Totals
  const totals = useMemo(() => {
    return calcInvoiceTotals(
      lines.map((l) => ({ qty: l.qty, rate: l.rate })),
      { taxRate: parseFloat(taxRate) || 0, extraCharges: parseFloat(extraCharges) || 0 }
    );
  }, [lines, taxRate, extraCharges]);

  // Load lookups
  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      fetchBuyers(activeCompany.id).catch(() => []),
      fetchDeliveryAddresses(activeCompany.id).catch(() => []),
      fetchProducts(activeCompany.id).catch(() => []),
    ]).then(([b, d, p]) => {
      setBuyers(b);
      setDeliveryAddrs(d);
      setProducts(p);
    });
  }, [activeCompany]);

  // Load existing invoice for edit
  useEffect(() => {
    if (!isEdit) { setPageLoading(false); return; }
    (async () => {
      try {
        const inv = await fetchInvoice(invId);
        setDocType(inv.invoice_type || 'proforma');
        setInvDate(inv.invoice_date || today());
        setInvExpiry(inv.expiry_date || '');
        setCurrency(inv.currency || 'USD');
        setCustRef(inv.customer_reference || '');
        setReasonExport(inv.reason_for_export || '');
        setLcNumber(inv.lc_number || '');
        setLcDate(inv.lc_date || '');

        setBuyerId(inv.buyer_id || '');
        if (inv.buyers) {
          setBillCo(inv.buyers.name || '');
          setBillA1(inv.buyers.address_line1 || '');
          setBillA2(inv.buyers.address_line2 || '');
          setBillCity(inv.buyers.city || '');
          setBillState(inv.buyers.state || '');
          setBillZip(inv.buyers.postal_code || '');
          setBillCountry(inv.buyers.country || '');
          setBillContact(inv.buyers.contact_person || '');
          setBillPhone(inv.buyers.phone || '');
          setBillEmail(inv.buyers.email || '');
          setBillGstin(inv.buyers.gstin || '');
        }

        setShipCo(inv.ship_to_name || '');
        setShipA1(inv.ship_to_address_line1 || '');
        setShipA2(inv.ship_to_address_line2 || '');
        setShipCity(inv.ship_to_city || '');
        setShipState(inv.ship_to_state || '');
        setShipZip(inv.ship_to_postal_code || '');
        setShipCountry(inv.ship_to_country || '');
        setNotifyParty(inv.notify_party || '');

        setFreightType(inv.freight_type || FREIGHT_TYPES[0]);
        setIncoterm(inv.incoterm || INCOTERMS[0]);
        setPol(inv.port_of_loading || '');
        setPod(inv.port_of_discharge || '');
        setShipDate(inv.shipment_date || '');
        setDelDate(inv.delivery_date || '');
        setVessel(inv.vessel || '');
        setBlNo(inv.bl_awb_number || '');
        setGrossWt(inv.gross_weight || '');
        setNetWt(inv.net_weight || '');
        setCube(inv.volume_cbm || '');
        setTotalPkgs(inv.total_packages || '');
        setMarks(inv.marks_numbers || '');
        setCountryOrigin(inv.country_of_origin || '');
        setFinalDest(inv.final_destination || '');

        setPayTerms(inv.payment_terms || PAYMENT_TERMS[0]);
        setTaxRate(String(inv.tax_rate ?? '0'));
        setExtraCharges(String(inv.extra_charges ?? '0'));
        setBankDetails(inv.bank_details || '');
        setTermsText(inv.terms_conditions || '');

        setHsCode(inv.hs_code || '');
        setCooNo(inv.coo_number || '');
        setPhytoNo(inv.phyto_number || '');
        setDeclaration(inv.declaration || '');
        setCustomsRemarks(inv.customs_remarks || '');

        if (inv.line_items?.length) {
          setLines(inv.line_items.map((li) => ({
            description: li.description || '',
            hsn_code: li.hsn_code || '',
            qty: String(li.quantity ?? ''),
            unit: li.unit || 'MT',
            rate: String(li.rate ?? ''),
          })));
        }
        if (inv.packing_lines?.length) {
          setPackLines(inv.packing_lines.map((pl) => ({
            marks: pl.marks || '',
            pkgs: String(pl.packages ?? ''),
            pkg_type: pl.package_type || 'Carton',
            gross_wt: String(pl.gross_weight ?? ''),
            net_wt: String(pl.net_weight ?? ''),
            dimensions: pl.dimensions || '',
          })));
        }
      } catch (err) {
        addToast('Failed to load invoice: ' + err.message, 'error');
        navigate('/invoices');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [isEdit, invId, addToast, navigate]);

  // Fill buyer from picker
  const fillBuyer = useCallback((bId) => {
    setBuyerId(bId);
    const b = buyers.find((x) => x.id === bId);
    if (!b) return;
    setBillCo(b.name || '');
    setBillA1(b.address_line1 || '');
    setBillA2(b.address_line2 || '');
    setBillCity(b.city || '');
    setBillState(b.state || '');
    setBillZip(b.postal_code || '');
    setBillCountry(b.country || '');
    setBillContact(b.contact_person || '');
    setBillPhone(b.phone || '');
    setBillEmail(b.email || '');
    setBillGstin(b.gstin || '');
  }, [buyers]);

  // Line item helpers
  const updateLine = (idx, field, value) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const lineAmount = (l) => calcInvoiceLineAmount(parseFloat(l.qty) || 0, parseFloat(l.rate) || 0);

  // Fill product into line
  const fillProduct = (idx, productId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => prev.map((l, i) =>
      i === idx ? { ...l, description: p.name || '', hsn_code: p.hsn_code || '', unit: p.unit || 'MT', rate: String(p.default_price ?? '') } : l
    ));
  };

  // Pack line helpers
  const updatePackLine = (idx, field, value) => setPackLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  const addPackLine = () => setPackLines((prev) => [...prev, { ...EMPTY_PACK_LINE }]);
  const removePackLine = (idx) => setPackLines((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  // Save
  const handleSave = async () => {
    if (!activeCompany) return;
    if (!billCo.trim()) { addToast('Buyer company name is required', 'error'); setStep(1); return; }
    if (!lines.some((l) => l.description.trim())) { addToast('Add at least one line item', 'error'); setStep(3); return; }

    setSaving(true);
    try {
      const invData = {
        company_id: activeCompany.id,
        invoice_type: docType,
        status: 'draft',
        invoice_date: invDate || null,
        expiry_date: invExpiry || null,
        currency,
        customer_reference: custRef || null,
        reason_for_export: reasonExport || null,
        lc_number: lcNumber || null,
        lc_date: lcDate || null,
        buyer_id: buyerId || null,
        buyer_name: billCo,
        buyer_address_line1: billA1 || null,
        buyer_address_line2: billA2 || null,
        buyer_city: billCity || null,
        buyer_state: billState || null,
        buyer_postal_code: billZip || null,
        buyer_country: billCountry || null,
        buyer_contact: billContact || null,
        buyer_phone: billPhone || null,
        buyer_email: billEmail || null,
        buyer_gstin: billGstin || null,
        ship_to_name: shipCo || null,
        ship_to_address_line1: shipA1 || null,
        ship_to_address_line2: shipA2 || null,
        ship_to_city: shipCity || null,
        ship_to_state: shipState || null,
        ship_to_postal_code: shipZip || null,
        ship_to_country: shipCountry || null,
        notify_party: notifyParty || null,
        freight_type: freightType || null,
        incoterm: incoterm || null,
        port_of_loading: pol || null,
        port_of_discharge: pod || null,
        shipment_date: shipDate || null,
        delivery_date: delDate || null,
        vessel: vessel || null,
        bl_awb_number: blNo || null,
        gross_weight: grossWt || null,
        net_weight: netWt || null,
        volume_cbm: cube || null,
        total_packages: totalPkgs || null,
        marks_numbers: marks || null,
        country_of_origin: countryOrigin || null,
        final_destination: finalDest || null,
        payment_terms: payTerms || null,
        tax_rate: parseFloat(taxRate) || 0,
        extra_charges: parseFloat(extraCharges) || 0,
        bank_details: bankDetails || null,
        terms_conditions: termsText || null,
        hs_code: hsCode || null,
        coo_number: cooNo || null,
        phyto_number: phytoNo || null,
        declaration: declaration || null,
        customs_remarks: customsRemarks || null,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total: totals.total,
      };

      const lineItemsData = lines.filter((l) => l.description.trim()).map((l) => ({
        description: l.description,
        hsn_code: l.hsn_code || null,
        quantity: parseFloat(l.qty) || 0,
        unit: l.unit || 'MT',
        rate: parseFloat(l.rate) || 0,
        amount: lineAmount(l),
      }));

      const packLinesData = isComm
        ? packLines.filter((p) => p.marks.trim()).map((p) => ({
            marks: p.marks,
            packages: parseInt(p.pkgs) || 0,
            package_type: p.pkg_type || 'Carton',
            gross_weight: parseFloat(p.gross_wt) || 0,
            net_weight: parseFloat(p.net_wt) || 0,
            dimensions: p.dimensions || null,
          }))
        : [];

      if (isEdit) {
        await updateInvoice(invId, invData, lineItemsData, packLinesData);
        writeAuditLog({ companyId: activeCompany.id, action: 'update', tableName: 'invoices', recordId: invId });
        addToast('Invoice updated', 'success');
      } else {
        const newInv = await createInvoice(invData, lineItemsData, packLinesData);
        writeAuditLog({ companyId: activeCompany.id, action: 'create', tableName: 'invoices', recordId: newInv.id });
        addToast('Invoice created: ' + newInv.invoice_number, 'success');
      }
      navigate('/invoices');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const goStep = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  const goAfterTerms = () => { if (isComm) goStep(5); else goStep(reviewStep); };
  const goBackFromReview = () => { if (isComm) goStep(packStep); else goStep(4); };

  if (pageLoading) return <LoadingSpinner />;

  const sellerAddr = issueAddr;
  const billAddr = [billCo, billA1, billA2, [billCity, billState, billZip].filter(Boolean).join(', '), billCountry].filter(Boolean).join(', ');
  const shipAddr = shipCo
    ? [shipCo, shipA1, shipA2, [shipCity, shipState, shipZip].filter(Boolean).join(', '), shipCountry].filter(Boolean).join(', ')
    : 'Same as billing address';
  const docLabel = isComm ? 'COMMERCIAL INVOICE' : 'PROFORMA INVOICE';

  return (
    <div className="po-form">
      {/* Doc type toggle */}
      <div className="inv-doc-toggle">
        <button type="button" className={`inv-doc-toggle__btn${!isComm ? ' inv-doc-toggle__btn--active' : ''}`} onClick={() => setDocType('proforma')}>Proforma</button>
        <button type="button" className={`inv-doc-toggle__btn${isComm ? ' inv-doc-toggle__btn--active' : ''}`} onClick={() => setDocType('commercial')}>Commercial</button>
      </div>

      {/* Progress */}
      <div className="wizard-progress">
        {STEPS.map((label, i) => (
          <button
            key={i}
            type="button"
            className={`wizard-progress__tab${i === step ? ' wizard-progress__tab--active' : ''}${i < step ? ' wizard-progress__tab--done' : ''}`}
            onClick={() => goStep(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ STEP 0 — Invoice Info ═══ */}
      {step === 0 && (
        <div className="card po-step">
          <div className="po-step__title">Invoice Details</div>
          <div className="po-form__issue-addr">
            <span className="po-form__issue-label">Issuing Address (read-only):</span>
            <span>{issueAddr}</span>
            <span className="po-form__issue-note">All documents issued from Head Office, Alappuzha</span>
          </div>
          <div className="po-form__grid">
            <div className="form-group">
              <label className="form-label">Invoice Date *</label>
              <input type="date" className="form-input" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valid Until / Expiry</label>
              <input type="date" className="form-input" value={invExpiry} onChange={(e) => setInvExpiry(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Customer Reference / Buyer PO #</label>
              <input className="form-input" placeholder="Buyer's purchase order or reference number" value={custRef} onChange={(e) => setCustRef(e.target.value)} />
            </div>
            {isComm && (
              <>
                <div className="form-group">
                  <label className="form-label">LC Number (Letter of Credit)</label>
                  <input className="form-input" placeholder="LC / BC reference number" value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">LC Date</label>
                  <input type="date" className="form-input" value={lcDate} onChange={(e) => setLcDate(e.target.value)} />
                </div>
              </>
            )}
            <div className="form-group form-group--span2">
              <label className="form-label">Reason for Export</label>
              <input className="form-input" placeholder="e.g. Sale of goods, commercial shipment" value={reasonExport} onChange={(e) => setReasonExport(e.target.value)} />
            </div>
          </div>
          <div className="po-form__nav">
            <span></span>
            <button type="button" className="btn btn-primary" onClick={() => goStep(1)}>Next: Buyer →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 1 — Buyer ═══ */}
      {step === 1 && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">Bill To — Buyer / Customer</div>
            <div className="po-form__vendor-picker">
              <select className="form-input" value={buyerId} onChange={(e) => fillBuyer(e.target.value)}>
                <option value="">— Select saved buyer —</option>
                {buyers.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <div className="po-form__grid">
              <div className="form-group form-group--span2">
                <label className="form-label">Company Name *</label>
                <input className="form-input" placeholder="Buyer's company name" value={billCo} onChange={(e) => setBillCo(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Address Line 1</label>
                <input className="form-input" placeholder="Street / Building / Unit No." value={billA1} onChange={(e) => setBillA1(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Address Line 2</label>
                <input className="form-input" placeholder="Area / District / PO Box" value={billA2} onChange={(e) => setBillA2(e.target.value)} />
              </div>
              <div className="form-group"><label className="form-label">City</label><input className="form-input" value={billCity} onChange={(e) => setBillCity(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">State / Province</label><input className="form-input" value={billState} onChange={(e) => setBillState(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Postal / PIN Code</label><input className="form-input" value={billZip} onChange={(e) => setBillZip(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Country</label><input className="form-input" value={billCountry} onChange={(e) => setBillCountry(e.target.value)} /></div>
              <div className="form-group form-group--span2"><label className="form-label">Contact Person</label><input className="form-input" value={billContact} onChange={(e) => setBillContact(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Phone / Mobile</label><input className="form-input" placeholder="+__ __ ________" value={billPhone} onChange={(e) => setBillPhone(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" placeholder="contact@company.com" value={billEmail} onChange={(e) => setBillEmail(e.target.value)} /></div>
              <div className="form-group form-group--span2"><label className="form-label">GSTIN / Tax ID / VAT Number</label><input className="form-input" placeholder="GSTIN, VAT, or Tax ID if applicable" value={billGstin} onChange={(e) => setBillGstin(e.target.value)} /></div>
            </div>
          </div>
          <div className="card">
            <div className="po-step__title">Ship To — Consignee <span className="text-muted">(leave blank if same as Bill To)</span></div>
            <div className="po-form__info">Leave all fields blank if the consignee and delivery address are the same as the buyer above.</div>
            <div className="po-form__grid">
              <div className="form-group form-group--span2"><label className="form-label">Consignee Name / Company</label><input className="form-input" value={shipCo} onChange={(e) => setShipCo(e.target.value)} /></div>
              <div className="form-group form-group--span2"><label className="form-label">Address Line 1</label><input className="form-input" value={shipA1} onChange={(e) => setShipA1(e.target.value)} /></div>
              <div className="form-group form-group--span2"><label className="form-label">Address Line 2</label><input className="form-input" value={shipA2} onChange={(e) => setShipA2(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">City</label><input className="form-input" value={shipCity} onChange={(e) => setShipCity(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">State / Province</label><input className="form-input" value={shipState} onChange={(e) => setShipState(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Postal Code</label><input className="form-input" value={shipZip} onChange={(e) => setShipZip(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Country</label><input className="form-input" value={shipCountry} onChange={(e) => setShipCountry(e.target.value)} /></div>
              {isComm && (
                <div className="form-group form-group--span2"><label className="form-label">Notify Party (if different from consignee)</label><input className="form-input" placeholder="Name and address of notify party" value={notifyParty} onChange={(e) => setNotifyParty(e.target.value)} /></div>
              )}
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(0)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(2)}>Next: Shipping →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2 — Shipping ═══ */}
      {step === 2 && (
        <div className="card po-step">
          <div className="po-step__title">Shipping & Freight Details</div>
          <div className="po-form__grid">
            <div className="form-group">
              <label className="form-label">Freight Type</label>
              <select className="form-input" value={freightType} onChange={(e) => setFreightType(e.target.value)}>
                {FREIGHT_TYPES.map((f) => (<option key={f} value={f}>{f}</option>))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Incoterm</label>
              <select className="form-input" value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
                {INCOTERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Port of Loading</label><input className="form-input" placeholder="e.g. Tuticorin, Cochin, Hong Kong" value={pol} onChange={(e) => setPol(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Port of Discharge</label><input className="form-input" placeholder="e.g. Nansha, Yokohama, Jebel Ali" value={pod} onChange={(e) => setPod(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Est. Shipment Date</label><input type="date" className="form-input" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Est. Delivery Date</label><input type="date" className="form-input" value={delDate} onChange={(e) => setDelDate(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Vessel / Flight / Conveyance</label><input className="form-input" placeholder="Vessel name or flight number" value={vessel} onChange={(e) => setVessel(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Bill of Lading / AWB No.</label><input className="form-input" placeholder="BL or AWB reference" value={blNo} onChange={(e) => setBlNo(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Gross Weight</label><input className="form-input" placeholder="e.g. 22.50 MT" value={grossWt} onChange={(e) => setGrossWt(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Net Weight</label><input className="form-input" placeholder="e.g. 22.00 MT" value={netWt} onChange={(e) => setNetWt(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Volume / CBM</label><input className="form-input" placeholder="e.g. 2.5 CBM" value={cube} onChange={(e) => setCube(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Total Packages</label><input className="form-input" placeholder="e.g. 50 cartons / 2 x 20FCL" value={totalPkgs} onChange={(e) => setTotalPkgs(e.target.value)} /></div>
            <div className="form-group form-group--span2"><label className="form-label">Container No. / Seal No. / Marks</label><input className="form-input" placeholder="Container no., seal no., shipping marks, batch" value={marks} onChange={(e) => setMarks(e.target.value)} /></div>
            {isComm && (
              <>
                <div className="form-group"><label className="form-label">Country of Origin *</label><input className="form-input" placeholder="e.g. India, China" value={countryOrigin} onChange={(e) => setCountryOrigin(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Final Destination</label><input className="form-input" placeholder="Country of final destination" value={finalDest} onChange={(e) => setFinalDest(e.target.value)} /></div>
              </>
            )}
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(1)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(3)}>Next: Line Items →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3 — Line Items ═══ */}
      {step === 3 && (
        <div className="card po-step">
          <div className="po-step__title">Line Items — Goods / Services</div>
          <div className="po-line-table-wrap">
            <table className="po-line-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Item & Description</th>
                  <th style={{ width: 78 }}>HSN Code</th>
                  <th style={{ width: 60 }}>Qty</th>
                  <th style={{ width: 52 }}>Unit</th>
                  <th style={{ width: 80 }}>Rate</th>
                  <th style={{ width: 88 }}>Amount</th>
                  <th style={{ width: 34 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="po-line-table__num">{i + 1}</td>
                    <td>
                      {products.length > 0 && (
                        <select className="form-input po-line-table__product-pick" value="" onChange={(e) => { if (e.target.value) fillProduct(i, e.target.value); }}>
                          <option value="">Pick product…</option>
                          {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                      )}
                      <input className="form-input" placeholder="Product + full specification" value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={{ minWidth: 170 }} />
                    </td>
                    <td><input className="form-input" placeholder="030739" value={l.hsn_code} onChange={(e) => updateLine(i, 'hsn_code', e.target.value)} /></td>
                    <td><input className="form-input" type="number" step="0.001" placeholder="0" value={l.qty} onChange={(e) => updateLine(i, 'qty', e.target.value)} /></td>
                    <td><input className="form-input" value={l.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)} /></td>
                    <td><input className="form-input" type="number" step="0.01" placeholder="0.00" value={l.rate} onChange={(e) => updateLine(i, 'rate', e.target.value)} /></td>
                    <td><input className="form-input po-line-table__amt" value={fmt(lineAmount(l))} readOnly /></td>
                    <td>{lines.length > 1 && (<button type="button" className="btn btn-sm btn-danger-outline" onClick={() => removeLine(i)}>✕</button>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn po-line-table__add" onClick={addLine}>+ Add line item</button>
          <div className="po-form__subtotal">Subtotal: <strong>{currency} {fmt(subtotal)}</strong></div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(2)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(4)}>Next: Terms →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 4 — Terms & Totals ═══ */}
      {step === 4 && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">Payment Terms & Charges</div>
            <div className="po-form__grid">
              <div className="form-group">
                <label className="form-label">Payment Terms</label>
                <select className="form-input" value={payTerms} onChange={(e) => setPayTerms(e.target.value)}>
                  {PAYMENT_TERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tax / GST Rate (%)</label>
                <input type="number" className="form-input" min="0" max="100" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Freight / Insurance / Other additional charges</label>
                <input type="number" className="form-input" step="0.01" placeholder="0.00" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Bank Details (for payment)</label>
                <textarea className="form-input" placeholder={"Beneficiary Name:\nBank Name:\nAccount No.:\nIFSC / SWIFT Code:\nBranch Address:"} value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} rows={4} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Terms of Sale & Other Comments</label>
                <textarea className="form-input" placeholder="e.g. All disputes subject to jurisdiction…" value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={3} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="po-step__title">Invoice Totals</div>
            <div className="po-totals">
              <span className="po-totals__label">Subtotal</span>
              <span className="po-totals__value">{currency} {fmt(totals.subtotal)}</span>
              {parseFloat(taxRate) > 0 && (<><span className="po-totals__label">Tax / GST ({taxRate}%)</span><span className="po-totals__value">{currency} {fmt(totals.tax)}</span></>)}
              {parseFloat(extraCharges) > 0 && (<><span className="po-totals__label">Freight / Other</span><span className="po-totals__value">{currency} {fmt(parseFloat(extraCharges))}</span></>)}
              <span className="po-totals__label po-totals__grand">TOTAL</span>
              <span className="po-totals__value po-totals__grand">{currency} {fmt(totals.total)}</span>
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(3)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={goAfterTerms}>Next →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 5 — Packing & Customs (commercial only) ═══ */}
      {isComm && step === packStep && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">Packing List</div>
            <div className="po-line-table-wrap">
              <table className="po-line-table">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>#</th>
                    <th>Marks & Package Description</th>
                    <th style={{ width: 70 }}>No. of Pkgs</th>
                    <th style={{ width: 70 }}>Pkg Type</th>
                    <th style={{ width: 80 }}>Gross Wt (kg)</th>
                    <th style={{ width: 80 }}>Net Wt (kg)</th>
                    <th style={{ width: 80 }}>Dimensions</th>
                    <th style={{ width: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {packLines.map((pl, i) => (
                    <tr key={i}>
                      <td className="po-line-table__num">{i + 1}</td>
                      <td><input className="form-input" placeholder="Marks / lot / batch" value={pl.marks} onChange={(e) => updatePackLine(i, 'marks', e.target.value)} style={{ minWidth: 140 }} /></td>
                      <td><input className="form-input" type="number" placeholder="0" value={pl.pkgs} onChange={(e) => updatePackLine(i, 'pkgs', e.target.value)} /></td>
                      <td><input className="form-input" value={pl.pkg_type} onChange={(e) => updatePackLine(i, 'pkg_type', e.target.value)} /></td>
                      <td><input className="form-input" type="number" step="0.01" placeholder="0.00" value={pl.gross_wt} onChange={(e) => updatePackLine(i, 'gross_wt', e.target.value)} /></td>
                      <td><input className="form-input" type="number" step="0.01" placeholder="0.00" value={pl.net_wt} onChange={(e) => updatePackLine(i, 'net_wt', e.target.value)} /></td>
                      <td><input className="form-input" placeholder="L×W×H cm" value={pl.dimensions} onChange={(e) => updatePackLine(i, 'dimensions', e.target.value)} /></td>
                      <td>{packLines.length > 1 && (<button type="button" className="btn btn-sm btn-danger-outline" onClick={() => removePackLine(i)}>✕</button>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn po-line-table__add" onClick={addPackLine}>+ Add packing row</button>
          </div>
          <div className="card">
            <div className="po-step__title">Customs & Certification</div>
            <div className="po-form__grid">
              <div className="form-group"><label className="form-label">Harmonised System (HS) Code</label><input className="form-input" placeholder="e.g. 0307.39.10" value={hsCode} onChange={(e) => setHsCode(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Certificate of Origin No.</label><input className="form-input" placeholder="CO reference number" value={cooNo} onChange={(e) => setCooNo(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Phytosanitary / Health Cert No.</label><input className="form-input" placeholder="Certificate number" value={phytoNo} onChange={(e) => setPhytoNo(e.target.value)} /></div>
              <div className="form-group form-group--span2"><label className="form-label">Declaration / Certification Text</label><textarea className="form-input" placeholder="We hereby certify that this invoice is true and correct…" value={declaration} onChange={(e) => setDeclaration(e.target.value)} rows={3} /></div>
              <div className="form-group form-group--span2"><label className="form-label">Additional Customs Remarks</label><textarea className="form-input" placeholder="Any other customs or regulatory notes" value={customsRemarks} onChange={(e) => setCustomsRemarks(e.target.value)} rows={2} /></div>
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(4)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(reviewStep)}>Review & Export →</button>
          </div>
        </div>
      )}

      {/* ═══ Review & Export ═══ */}
      {step === reviewStep && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">{docLabel} — Preview</div>
            <div className="po-preview">
              {/* Header */}
              <div className="po-preview__header">
                <div>
                  <div className="po-preview__company">{activeCompany?.name}</div>
                  <div className="po-preview__addr">{sellerAddr}</div>
                </div>
                <div className="po-preview__right">
                  <div className="po-preview__doc-title">{docLabel}</div>
                  <div className="po-preview__meta">
                    <div>Date: <strong>{invDate || '—'}</strong></div>
                    <div>Valid Until: <strong>{invExpiry || '—'}</strong></div>
                    {custRef && <div>Buyer Ref: <strong>{custRef}</strong></div>}
                    {isComm && lcNumber && <div>LC No.: <strong>{lcNumber}</strong></div>}
                  </div>
                </div>
              </div>

              {/* Bill / Ship */}
              <div className="po-preview__parties">
                <div>
                  <div className="po-preview__section-label">Bill To</div>
                  <div>{billAddr || '—'}</div>
                  {billGstin && <div className="text-muted">GSTIN: {billGstin}</div>}
                  {billContact && <div className="text-muted">Attn: {billContact}{billPhone ? ' · ' + billPhone : ''}</div>}
                </div>
                <div>
                  <div className="po-preview__section-label">Ship To / Consignee</div>
                  <div>{shipAddr}</div>
                  {isComm && notifyParty && <div className="text-muted" style={{ marginTop: 6 }}><strong>Notify:</strong> {notifyParty}</div>}
                  <div style={{ marginTop: 10 }}>
                    <div className="po-preview__section-label">Freight Details</div>
                    <div className="text-muted">{freightType} · {incoterm} · POL: {pol || '—'} → POD: {pod || '—'}</div>
                    {vessel && <div className="text-muted">Vessel: {vessel}</div>}
                    {isComm && blNo && <div className="text-muted">BL/AWB: {blNo}</div>}
                    {isComm && countryOrigin && <div className="text-muted"><strong>Country of Origin: {countryOrigin}</strong></div>}
                  </div>
                </div>
              </div>

              {/* Items */}
              <table className="po-preview__table">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>#</th>
                    <th>Description of Goods</th>
                    <th style={{ width: 80 }}>HSN</th>
                    <th className="text-right" style={{ width: 90 }}>Qty / Unit</th>
                    <th className="text-right" style={{ width: 90 }}>Rate ({currency})</th>
                    <th className="text-right" style={{ width: 100 }}>Amount ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.filter((l) => l.description.trim()).length === 0 ? (
                    <tr><td colSpan="6" className="text-center text-muted" style={{ padding: 16 }}>No line items added</td></tr>
                  ) : lines.filter((l) => l.description.trim()).map((l, i) => (
                    <tr key={i}>
                      <td className="text-center">{i + 1}</td>
                      <td>{l.description}</td>
                      <td>{l.hsn_code || '—'}</td>
                      <td className="text-right">{l.qty || 0} {l.unit}</td>
                      <td className="text-right">{fmt(parseFloat(l.rate) || 0)}</td>
                      <td className="text-right mono"><strong>{fmt(lineAmount(l))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Packing list (commercial) */}
              {isComm && packLines.some((p) => p.marks.trim()) && (
                <>
                  <div className="po-preview__section-label" style={{ marginTop: 16 }}>Packing List</div>
                  <table className="po-preview__table">
                    <thead>
                      <tr><th>#</th><th>Marks & Description</th><th className="text-right">Pkgs</th><th>Type</th><th className="text-right">Gross Wt (kg)</th><th className="text-right">Net Wt (kg)</th><th>Dimensions</th></tr>
                    </thead>
                    <tbody>
                      {packLines.filter((p) => p.marks.trim()).map((p, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{p.marks}</td>
                          <td className="text-right">{p.pkgs || 0}</td>
                          <td>{p.pkg_type}</td>
                          <td className="text-right">{p.gross_wt || 0}</td>
                          <td className="text-right">{p.net_wt || 0}</td>
                          <td>{p.dimensions || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Amount in words + totals */}
              <div className="po-preview__footer-grid">
                <div>
                  <div className="po-preview__section-label">Amount in Words</div>
                  <div className="po-preview__words">{amtWordsIntl(totals.total, currency)}</div>
                  {payTerms && (<><div className="po-preview__section-label" style={{ marginTop: 10 }}>Payment Terms</div><div>{payTerms}</div></>)}
                  {bankDetails && (<><div className="po-preview__section-label" style={{ marginTop: 8 }}>Bank Details</div><div style={{ whiteSpace: 'pre-wrap', fontSize: '0.625rem' }}>{bankDetails}</div></>)}
                  {termsText && (<><div className="po-preview__section-label" style={{ marginTop: 8 }}>Terms</div><div style={{ whiteSpace: 'pre-wrap', fontSize: '0.625rem' }}>{termsText}</div></>)}
                  {isComm && declaration && (<><div className="po-preview__section-label" style={{ marginTop: 8 }}>Declaration</div><div style={{ fontStyle: 'italic', fontSize: '0.625rem' }}>{declaration}</div></>)}
                </div>
                <div className="po-totals" style={{ alignSelf: 'start' }}>
                  <span className="po-totals__label">Subtotal</span><span className="po-totals__value">{fmt(totals.subtotal)}</span>
                  {parseFloat(taxRate) > 0 && (<><span className="po-totals__label">Tax ({taxRate}%)</span><span className="po-totals__value">{fmt(totals.tax)}</span></>)}
                  {parseFloat(extraCharges) > 0 && (<><span className="po-totals__label">Freight / Other</span><span className="po-totals__value">{fmt(parseFloat(extraCharges))}</span></>)}
                  <span className="po-totals__label po-totals__grand">TOTAL ({currency})</span><span className="po-totals__value po-totals__grand">{fmt(totals.total)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="po-preview__signatory">
                <div className="text-muted">
                  <div>Packages: {totalPkgs || '—'} | Gross Wt: {grossWt || '—'} | Net Wt: {netWt || '—'}</div>
                  <div>Volume: {cube || '—'}</div>
                  {marks && <div>Marks: {marks}</div>}
                  {isComm && cooNo && <div>CO No.: {cooNo}</div>}
                  {reasonExport && <div>Reason for Export: {reasonExport}</div>}
                </div>
                <div className="po-preview__signatory-right">
                  <div className="text-muted">For {activeCompany?.name} — Authorised Signatory</div>
                  <div className="po-preview__signatory-name">Motty Philip</div>
                  <div className="text-muted">{activeCompany?.name}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="po-step__title">Save Invoice</div>
            <div className="po-form__actions">
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !canEdit}>
                {saving ? 'Saving…' : isEdit ? 'Update Invoice' : 'Create Invoice'}
              </button>
              <button type="button" className="btn" onClick={() => navigate('/invoices')}>Cancel</button>
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={goBackFromReview}>← Back to Edit</button>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>Review carefully before saving</span>
          </div>
        </div>
      )}
    </div>
  );
}
