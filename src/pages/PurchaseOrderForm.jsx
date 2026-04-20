import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import {
  fetchPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  calcLineAmount,
  calcPOTotals,
} from '../lib/purchaseOrders';
import { fetchVendors } from '../lib/vendors';
import { fetchDeliveryAddresses } from '../lib/deliveryAddresses';
import { fetchProducts } from '../lib/products';
import { amtWordsIndian } from '../lib/numberToWords';
import { ISSUE_ADDRESS } from '../lib/supabase';
import { writeAuditLog } from '../lib/auditLog';
import LoadingSpinner from '../components/common/LoadingSpinner';

const STEPS = [
  '1 · PO Details',
  '2 · Vendor',
  '3 · Delivery',
  '4 · Items',
  '5 · Terms',
  '6 · Review',
];

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
];

const PRIORITIES = ['Normal', 'Urgent', 'Low'];

const PAYMENT_TERMS = [
  'Advance / 100% before delivery',
  '50% advance, 50% on delivery',
  'Net 30 days from invoice',
  'Net 45 days from invoice',
  'Net 60 days from invoice',
  'LC at sight',
  'Cash on delivery',
  'Open account',
];

const INCOTERMS = [
  'DDP — Delivered Duty Paid',
  'DAP — Delivered at Place',
  'EXW — Ex Works',
  'FOB',
  'CIF',
  'CFR',
  'FCA',
];

const FREIGHT_OPTIONS = ['Vendor pays freight', 'Buyer pays freight', 'Split equally'];
const TRANSPORT_MODES = ['Road', 'Sea Freight', 'Air Freight', 'Courier', 'Rail'];

const STATUS_LIST = [
  { key: 'draft', label: 'Draft', cls: 'badge--muted' },
  { key: 'pending_approval', label: 'Pending Approval', cls: 'badge--warning' },
  { key: 'approved', label: 'Approved', cls: 'badge--success' },
  { key: 'rejected', label: 'Rejected', cls: 'badge--error' },
];

const EMPTY_LINE = {
  description: '',
  hsn_code: '',
  qty: '',
  unit: 'MT',
  price: '',
  discount: '0',
};

const today = () => new Date().toISOString().slice(0, 10);
const plus30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const issueAddr = [ISSUE_ADDRESS.line1, ISSUE_ADDRESS.line2, ISSUE_ADDRESS.country]
  .filter(Boolean)
  .join(', ');

export default function PurchaseOrderForm() {
  const { id: poId } = useParams();
  const isEdit = Boolean(poId) && poId !== 'new';
  const navigate = useNavigate();
  const { activeCompany, hasRole } = useAuth();
  const addToast = useToast();

  const canEdit = hasRole(['super_admin', 'admin', 'operations']);

  // Wizard step
  const [step, setStep] = useState(0);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // ─── Lookup data ───
  const [vendors, setVendors] = useState([]);
  const [deliveryAddrs, setDeliveryAddrs] = useState([]);
  const [products, setProducts] = useState([]);

  // ─── PO Header ───
  const [status, setStatus] = useState('draft');
  const [poDate, setPoDate] = useState(today());
  const [requiredDate, setRequiredDate] = useState(plus30());
  const [currency, setCurrency] = useState('INR');
  const [refDoc, setRefDoc] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [department, setDepartment] = useState('');
  const [poNotes, setPoNotes] = useState('');

  // ─── Vendor ───
  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorA1, setVendorA1] = useState('');
  const [vendorA2, setVendorA2] = useState('');
  const [vendorCity, setVendorCity] = useState('');
  const [vendorState, setVendorState] = useState('');
  const [vendorZip, setVendorZip] = useState('');
  const [vendorCountry, setVendorCountry] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [vendorBank, setVendorBank] = useState('');

  // ─── Delivery ───
  const [deliveryAddrId, setDeliveryAddrId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(plus30());
  const [incoterm, setIncoterm] = useState(INCOTERMS[0]);
  const [freightResp, setFreightResp] = useState(FREIGHT_OPTIONS[0]);
  const [transportMode, setTransportMode] = useState(TRANSPORT_MODES[0]);
  const [packingInstr, setPackingInstr] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // ─── Line Items ───
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  // ─── Terms ───
  const [payTerms, setPayTerms] = useState(PAYMENT_TERMS[0]);
  const [taxRate, setTaxRate] = useState('0');
  const [extraCharges, setExtraCharges] = useState('0');
  const [overallDiscount, setOverallDiscount] = useState('0');
  const [termsText, setTermsText] = useState('');
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [internalRemarks, setInternalRemarks] = useState('');

  // ─── Totals ───
  const totals = useMemo(() => {
    const lineAmts = lines.map((l) => ({
      ...l,
      qty: l.qty,
      price: l.price,
      discount: l.discount,
    }));
    return calcPOTotals(lineAmts, {
      overallDiscount: parseFloat(overallDiscount) || 0,
      taxRate: parseFloat(taxRate) || 0,
      extraCharges: parseFloat(extraCharges) || 0,
    });
  }, [lines, overallDiscount, taxRate, extraCharges]);

  // ─── Load lookup data on mount ───
  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      fetchVendors(activeCompany.id).catch(() => []),
      fetchDeliveryAddresses(activeCompany.id).catch(() => []),
      fetchProducts(activeCompany.id).catch(() => []),
    ]).then(([v, d, p]) => {
      setVendors(v);
      setDeliveryAddrs(d);
      setProducts(p);
    });
  }, [activeCompany]);

  // ─── Load existing PO for edit ───
  useEffect(() => {
    if (!isEdit) {
      setPageLoading(false);
      return;
    }
    (async () => {
      try {
        const po = await fetchPurchaseOrder(poId);
        setStatus(po.status || 'draft');
        setPoDate(po.po_date || today());
        setRequiredDate(po.required_date || '');
        setCurrency(po.currency || 'INR');
        setRefDoc(po.reference_doc || '');
        setPriority(po.priority || 'Normal');
        setDepartment(po.department || '');
        setPoNotes(po.notes || '');

        // Vendor
        setVendorId(po.vendor_id || '');
        if (po.vendors) {
          setVendorName(po.vendors.name || '');
          setVendorA1(po.vendors.address_line1 || '');
          setVendorA2(po.vendors.address_line2 || '');
          setVendorCity(po.vendors.city || '');
          setVendorState(po.vendors.state || '');
          setVendorZip(po.vendors.postal_code || '');
          setVendorCountry(po.vendors.country || '');
          setVendorContact(po.vendors.contact_person || '');
          setVendorPhone(po.vendors.phone || '');
          setVendorEmail(po.vendors.email || '');
          setVendorGstin(po.vendors.gstin || '');
          setVendorCode(po.vendors.vendor_code || '');
          setVendorBank(po.vendors.bank_details || '');
        }

        // Delivery
        setDeliveryAddrId(po.delivery_address_id || '');
        setDeliveryAddress(po.delivery_address_text || '');
        setDeliveryDate(po.delivery_date || '');
        setIncoterm(po.incoterm || INCOTERMS[0]);
        setFreightResp(po.freight_responsibility || FREIGHT_OPTIONS[0]);
        setTransportMode(po.transport_mode || TRANSPORT_MODES[0]);
        setPackingInstr(po.packing_instructions || '');
        setDeliveryInstructions(po.delivery_instructions || '');

        // Terms
        setPayTerms(po.payment_terms || PAYMENT_TERMS[0]);
        setTaxRate(String(po.tax_rate ?? '0'));
        setExtraCharges(String(po.extra_charges ?? '0'));
        setOverallDiscount(String(po.overall_discount ?? '0'));
        setTermsText(po.terms_conditions || '');
        setAuthorisedBy(po.authorised_by || '');
        setInternalRemarks(po.internal_remarks || '');

        // Line items
        if (po.line_items?.length) {
          setLines(
            po.line_items.map((li) => ({
              description: li.description || '',
              hsn_code: li.hsn_code || '',
              qty: String(li.quantity ?? ''),
              unit: li.unit || 'MT',
              price: String(li.unit_price ?? ''),
              discount: String(li.discount_percent ?? '0'),
            }))
          );
        }
      } catch (err) {
        addToast('Failed to load PO: ' + err.message, 'error');
        navigate('/purchase-orders');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [isEdit, poId, addToast, navigate]);

  // ─── Fill vendor from picker ───
  const fillVendor = useCallback(
    (vId) => {
      setVendorId(vId);
      const v = vendors.find((x) => x.id === vId);
      if (!v) return;
      setVendorName(v.name || '');
      setVendorA1(v.address_line1 || '');
      setVendorA2(v.address_line2 || '');
      setVendorCity(v.city || '');
      setVendorState(v.state || '');
      setVendorZip(v.postal_code || '');
      setVendorCountry(v.country || '');
      setVendorContact(v.contact_person || '');
      setVendorPhone(v.phone || '');
      setVendorEmail(v.email || '');
      setVendorGstin(v.gstin || '');
      setVendorCode(v.vendor_code || '');
      setVendorBank(v.bank_details || '');
    },
    [vendors]
  );

  // ─── Fill delivery address from picker ───
  const fillDeliveryAddr = useCallback(
    (addrId) => {
      setDeliveryAddrId(addrId);
      const a = deliveryAddrs.find((x) => x.id === addrId);
      if (a) {
        setDeliveryAddress(
          [a.address_line1, a.address_line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country]
            .filter(Boolean)
            .join(', ')
        );
      }
    },
    [deliveryAddrs]
  );

  // ─── Line item helpers ───
  const updateLine = (idx, field, value) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const lineAmount = (l) =>
    calcLineAmount(parseFloat(l.qty) || 0, parseFloat(l.price) || 0, parseFloat(l.discount) || 0);

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  // ─── Fill product into a line ───
  const fillProduct = (idx, productId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              description: p.name || '',
              hsn_code: p.hsn_code || '',
              unit: p.unit || 'MT',
              price: String(p.default_price ?? ''),
            }
          : l
      )
    );
  };

  // ─── Save / Submit ───
  const handleSave = async () => {
    if (!activeCompany) return;
    if (!vendorName.trim()) {
      addToast('Vendor name is required', 'error');
      setStep(1);
      return;
    }
    if (lines.length === 0 || !lines.some((l) => l.description.trim())) {
      addToast('Add at least one line item', 'error');
      setStep(3);
      return;
    }

    setSaving(true);
    try {
      const poData = {
        company_id: activeCompany.id,
        status,
        po_date: poDate || null,
        required_date: requiredDate || null,
        currency,
        reference_doc: refDoc || null,
        priority,
        department: department || null,
        notes: poNotes || null,
        vendor_id: vendorId || null,
        vendor_name: vendorName,
        vendor_address_line1: vendorA1 || null,
        vendor_address_line2: vendorA2 || null,
        vendor_city: vendorCity || null,
        vendor_state: vendorState || null,
        vendor_postal_code: vendorZip || null,
        vendor_country: vendorCountry || null,
        vendor_contact: vendorContact || null,
        vendor_phone: vendorPhone || null,
        vendor_email: vendorEmail || null,
        vendor_gstin: vendorGstin || null,
        vendor_code: vendorCode || null,
        vendor_bank_details: vendorBank || null,
        delivery_address_id: deliveryAddrId || null,
        delivery_address_text: deliveryAddress || null,
        delivery_date: deliveryDate || null,
        incoterm: incoterm || null,
        freight_responsibility: freightResp || null,
        transport_mode: transportMode || null,
        packing_instructions: packingInstr || null,
        delivery_instructions: deliveryInstructions || null,
        payment_terms: payTerms || null,
        tax_rate: parseFloat(taxRate) || 0,
        extra_charges: parseFloat(extraCharges) || 0,
        overall_discount: parseFloat(overallDiscount) || 0,
        terms_conditions: termsText || null,
        authorised_by: authorisedBy || null,
        internal_remarks: internalRemarks || null,
        subtotal: totals.subtotal,
        discount_amount: totals.discountAmount,
        tax_amount: totals.tax,
        total: totals.total,
      };

      const lineItemsData = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description,
          hsn_code: l.hsn_code || null,
          quantity: parseFloat(l.qty) || 0,
          unit: l.unit || 'MT',
          unit_price: parseFloat(l.price) || 0,
          discount_percent: parseFloat(l.discount) || 0,
          amount: lineAmount(l),
        }));

      if (isEdit) {
        await updatePurchaseOrder(poId, poData, lineItemsData);
        writeAuditLog({
          companyId: activeCompany.id,
          action: 'update',
          tableName: 'purchase_orders',
          recordId: poId,
        });
        addToast('Purchase order updated', 'success');
      } else {
        const newPo = await createPurchaseOrder(poData, lineItemsData);
        writeAuditLog({
          companyId: activeCompany.id,
          action: 'create',
          tableName: 'purchase_orders',
          recordId: newPo.id,
        });
        addToast('Purchase order created: ' + newPo.po_number, 'success');
      }

      navigate('/purchase-orders');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Navigation ───
  const goStep = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  if (pageLoading) return <LoadingSpinner />;

  // ─── Build buyer address for preview ───
  const buyerAddr = issueAddr;
  const vendorAddr = [vendorName, vendorA1, vendorA2, [vendorCity, vendorState, vendorZip].filter(Boolean).join(', '), vendorCountry]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="po-form">
      {/* Progress Tabs */}
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

      {/* ═══ STEP 0 — PO Details ═══ */}
      {step === 0 && (
        <div className="card po-step">
          <div className="po-step__title">Purchase Order Details</div>

          <div className="po-form__issue-addr">
            <span className="po-form__issue-label">Issuing Address (read-only):</span>
            <span>{issueAddr}</span>
            <span className="po-form__issue-note">All documents issued from Head Office, Alappuzha</span>
          </div>

          {/* Status */}
          <div className="po-form__status-row">
            <span className="form-label">PO Status</span>
            <div className="po-form__badges">
              {STATUS_LIST.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`badge ${s.cls}${status === s.key ? ' badge--selected' : ''}`}
                  onClick={() => canEdit && setStatus(s.key)}
                  disabled={!canEdit}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="po-form__grid">
            <div className="form-group">
              <label className="form-label">PO Date *</label>
              <input type="date" className="form-input" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Required By Date</label>
              <input type="date" className="form-input" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Reference / Linked Document</label>
              <input className="form-input" placeholder="Linked Proforma Invoice no., Sales Order, or internal ref" value={refDoc} onChange={(e) => setRefDoc(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Department / Cost Centre</label>
              <input className="form-input" placeholder="e.g. Processing, Export, Admin" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">PO Notes / Instructions to Vendor</label>
              <input className="form-input" placeholder="Any general instructions for this purchase order" value={poNotes} onChange={(e) => setPoNotes(e.target.value)} />
            </div>
          </div>
          <div className="po-form__nav">
            <span></span>
            <button type="button" className="btn btn-primary" onClick={() => goStep(1)}>Next: Vendor →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 1 — Vendor ═══ */}
      {step === 1 && (
        <div className="card po-step">
          <div className="po-step__title">Vendor / Supplier Details</div>
          <div className="po-form__info">This is the company you are purchasing FROM. Select from your vendor address book or fill manually.</div>

          <div className="po-form__vendor-picker">
            <select className="form-input" value={vendorId} onChange={(e) => fillVendor(e.target.value)}>
              <option value="">— Select saved vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="po-form__grid">
            <div className="form-group form-group--span2">
              <label className="form-label">Vendor / Supplier Name *</label>
              <input className="form-input" placeholder="Supplier company name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Address Line 1</label>
              <input className="form-input" placeholder="Street / Building" value={vendorA1} onChange={(e) => setVendorA1(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Address Line 2</label>
              <input className="form-input" placeholder="Area / District" value={vendorA2} onChange={(e) => setVendorA2(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" value={vendorCity} onChange={(e) => setVendorCity(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">State / Province</label>
              <input className="form-input" value={vendorState} onChange={(e) => setVendorState(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Postal / PIN</label>
              <input className="form-input" value={vendorZip} onChange={(e) => setVendorZip(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Country</label>
              <input className="form-input" value={vendorCountry} onChange={(e) => setVendorCountry(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Contact Person</label>
              <input className="form-input" placeholder="Name of contact at vendor" value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" placeholder="+__ __ ________" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="vendor@company.com" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GSTIN / Tax ID</label>
              <input className="form-input" placeholder="GSTIN or VAT" value={vendorGstin} onChange={(e) => setVendorGstin(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Vendor Code / ID</label>
              <input className="form-input" placeholder="Internal vendor code" value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Bank / Payment Details (for TT or advance)</label>
              <textarea className="form-input" placeholder={"Bank Name:\nAccount No.:\nIFSC / SWIFT:\nBranch:"} value={vendorBank} onChange={(e) => setVendorBank(e.target.value)} rows={3} />
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(0)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(2)}>Next: Delivery →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2 — Delivery ═══ */}
      {step === 2 && (
        <div className="card po-step">
          <div className="po-step__title">Delivery & Shipping Instructions</div>
          <div className="po-form__grid">
            <div className="form-group">
              <label className="form-label">Deliver To</label>
              <select className="form-input" value={deliveryAddrId} onChange={(e) => fillDeliveryAddr(e.target.value)}>
                <option value="">— Select or enter manually —</option>
                {deliveryAddrs.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Delivery Date Required By</label>
              <input type="date" className="form-input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Delivery Address</label>
              <input className="form-input" placeholder="Full delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Freight / Incoterm</label>
              <select className="form-input" value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
                {INCOTERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Freight Responsibility</label>
              <select className="form-input" value={freightResp} onChange={(e) => setFreightResp(e.target.value)}>
                {FREIGHT_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Mode of Transport</label>
              <select className="form-input" value={transportMode} onChange={(e) => setTransportMode(e.target.value)}>
                {TRANSPORT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Packing Instructions</label>
              <input className="form-input" placeholder="e.g. Cartons of 25 kg, moisture-proof lining" value={packingInstr} onChange={(e) => setPackingInstr(e.target.value)} />
            </div>
            <div className="form-group form-group--span2">
              <label className="form-label">Special Delivery Instructions</label>
              <textarea className="form-input" placeholder="Any special instructions, handling requirements, or customs notes" value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} rows={3} />
            </div>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(1)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(3)}>Next: Items →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3 — Line Items ═══ */}
      {step === 3 && (
        <div className="card po-step">
          <div className="po-step__title">Items / Goods to Purchase</div>
          <div className="po-line-table-wrap">
            <table className="po-line-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Item Description</th>
                  <th style={{ width: 82 }}>HSN / SKU</th>
                  <th style={{ width: 64 }}>Qty</th>
                  <th style={{ width: 56 }}>Unit</th>
                  <th style={{ width: 82 }}>Unit Price</th>
                  <th style={{ width: 72 }}>Disc %</th>
                  <th style={{ width: 90 }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="po-line-table__num">{i + 1}</td>
                    <td>
                      {products.length > 0 && (
                        <select
                          className="form-input po-line-table__product-pick"
                          value=""
                          onChange={(e) => { if (e.target.value) fillProduct(i, e.target.value); }}
                        >
                          <option value="">Pick product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      <input
                        className="form-input"
                        placeholder="Product + full specification"
                        value={l.description}
                        onChange={(e) => updateLine(i, 'description', e.target.value)}
                        style={{ minWidth: 160 }}
                      />
                    </td>
                    <td>
                      <input className="form-input" placeholder="030739" value={l.hsn_code} onChange={(e) => updateLine(i, 'hsn_code', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.001" placeholder="0" value={l.qty} onChange={(e) => updateLine(i, 'qty', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" value={l.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.01" placeholder="0.00" value={l.price} onChange={(e) => updateLine(i, 'price', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" type="number" step="0.1" min="0" max="100" placeholder="0" value={l.discount} onChange={(e) => updateLine(i, 'discount', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input po-line-table__amt" value={fmt(lineAmount(l))} readOnly />
                    </td>
                    <td>
                      {lines.length > 1 && (
                        <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => removeLine(i)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn po-line-table__add" onClick={addLine}>+ Add line item</button>
          <div className="po-form__subtotal">
            Subtotal: <strong>{currency} {fmt(subtotal)}</strong>
          </div>
          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(2)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(4)}>Next: Terms →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 4 — Terms ═══ */}
      {step === 4 && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">Payment Terms & Conditions</div>
            <div className="po-form__grid">
              <div className="form-group">
                <label className="form-label">Payment Terms</label>
                <select className="form-input" value={payTerms} onChange={(e) => setPayTerms(e.target.value)}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tax / GST Rate (%)</label>
                <input type="number" className="form-input" min="0" max="100" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Freight / Other Charges</label>
                <input type="number" className="form-input" step="0.01" placeholder="0.00" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Discount on Total (%)</label>
                <input type="number" className="form-input" min="0" max="100" step="0.1" value={overallDiscount} onChange={(e) => setOverallDiscount(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Terms & Conditions</label>
                <textarea className="form-input" placeholder="e.g. Goods must conform to agreed specification…" value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={3} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Authorised By (Name & Designation)</label>
                <input className="form-input" placeholder="e.g. Motty Philip, Director" value={authorisedBy} onChange={(e) => setAuthorisedBy(e.target.value)} />
              </div>
              <div className="form-group form-group--span2">
                <label className="form-label">Internal Remarks (not printed on PO)</label>
                <textarea className="form-input" placeholder="Internal notes — budget code, approval chain, etc." value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="po-step__title">Order Totals</div>
            <div className="po-totals">
              <span className="po-totals__label">Subtotal</span>
              <span className="po-totals__value">{currency} {fmt(totals.subtotal)}</span>
              {parseFloat(overallDiscount) > 0 && (
                <>
                  <span className="po-totals__label">Discount ({overallDiscount}%)</span>
                  <span className="po-totals__value">− {currency} {fmt(totals.discountAmount)}</span>
                </>
              )}
              {parseFloat(taxRate) > 0 && (
                <>
                  <span className="po-totals__label">Tax / GST ({taxRate}%)</span>
                  <span className="po-totals__value">{currency} {fmt(totals.tax)}</span>
                </>
              )}
              {parseFloat(extraCharges) > 0 && (
                <>
                  <span className="po-totals__label">Freight / Other</span>
                  <span className="po-totals__value">{currency} {fmt(parseFloat(extraCharges))}</span>
                </>
              )}
              <span className="po-totals__label po-totals__grand">TOTAL</span>
              <span className="po-totals__value po-totals__grand">{currency} {fmt(totals.total)}</span>
            </div>
          </div>

          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(3)}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={() => goStep(5)}>Review & Submit →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 5 — Review & Submit ═══ */}
      {step === 5 && (
        <div className="po-step">
          <div className="card">
            <div className="po-step__title">Purchase Order Preview</div>
            <div className="po-preview">
              {/* Header row */}
              <div className="po-preview__header">
                <div>
                  <div className="po-preview__company">{activeCompany?.name}</div>
                  <div className="po-preview__addr">{buyerAddr}</div>
                </div>
                <div className="po-preview__right">
                  <div className="po-preview__doc-title">PURCHASE ORDER</div>
                  <span className={`badge ${STATUS_LIST.find((s) => s.key === status)?.cls || ''}`}>
                    {STATUS_LIST.find((s) => s.key === status)?.label || status}
                  </span>
                  <div className="po-preview__meta">
                    <div>PO Date: <strong>{poDate || '—'}</strong></div>
                    <div>Required By: <strong>{requiredDate || '—'}</strong></div>
                    {refDoc && <div>Ref: <strong>{refDoc}</strong></div>}
                    {priority !== 'Normal' && <div>Priority: <strong className="text-error">{priority}</strong></div>}
                  </div>
                </div>
              </div>

              {/* Buyer / Vendor */}
              <div className="po-preview__parties">
                <div>
                  <div className="po-preview__section-label">Buyer / Purchaser</div>
                  <div>{buyerAddr}</div>
                </div>
                <div>
                  <div className="po-preview__section-label">Vendor / Supplier</div>
                  <div>{vendorAddr || '—'}</div>
                  {vendorGstin && <div className="text-muted">GSTIN: {vendorGstin}</div>}
                  {vendorContact && <div className="text-muted">Attn: {vendorContact}{vendorPhone ? ' · ' + vendorPhone : ''}</div>}
                </div>
              </div>

              {/* Info boxes */}
              <div className="po-preview__info-boxes">
                <div className="po-preview__info-box">
                  <div className="po-preview__info-label">Delivery To</div>
                  <div>{deliveryAddress || '—'}</div>
                  <div className="text-muted">{incoterm}</div>
                </div>
                <div className="po-preview__info-box">
                  <div className="po-preview__info-label">Transport</div>
                  <div>{transportMode}</div>
                  <div className="text-muted">{freightResp}</div>
                </div>
                <div className="po-preview__info-box">
                  <div className="po-preview__info-label">Payment</div>
                  <div>{payTerms}</div>
                  {department && <div className="text-muted">{department}</div>}
                </div>
              </div>

              {/* Items table */}
              <table className="po-preview__table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Description of Goods</th>
                    <th style={{ width: 80 }}>HSN/SKU</th>
                    <th className="text-right" style={{ width: 90 }}>Qty / Unit</th>
                    <th className="text-right" style={{ width: 90 }}>Unit Price</th>
                    <th className="text-right" style={{ width: 70 }}>Disc %</th>
                    <th className="text-right" style={{ width: 100 }}>Amount ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.filter((l) => l.description.trim()).length === 0 ? (
                    <tr><td colSpan="7" className="text-center text-muted" style={{ padding: 14 }}>No items added</td></tr>
                  ) : (
                    lines.filter((l) => l.description.trim()).map((l, i) => (
                      <tr key={i}>
                        <td className="text-center">{i + 1}</td>
                        <td>{l.description}</td>
                        <td>{l.hsn_code || '—'}</td>
                        <td className="text-right">{l.qty || 0} {l.unit}</td>
                        <td className="text-right">{fmt(parseFloat(l.price) || 0)}</td>
                        <td className="text-right">{l.discount || 0}%</td>
                        <td className="text-right mono"><strong>{fmt(lineAmount(l))}</strong></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Amount in words + totals */}
              <div className="po-preview__footer-grid">
                <div>
                  <div className="po-preview__section-label">Amount in Words</div>
                  <div className="po-preview__words">{amtWordsIndian(totals.total, currency)}</div>
                  {termsText && (
                    <>
                      <div className="po-preview__section-label" style={{ marginTop: 10 }}>Terms & Conditions</div>
                      <div className="po-preview__terms">{termsText}</div>
                    </>
                  )}
                  {poNotes && (
                    <>
                      <div className="po-preview__section-label" style={{ marginTop: 8 }}>Instructions to Vendor</div>
                      <div>{poNotes}</div>
                    </>
                  )}
                  {vendorBank && (
                    <>
                      <div className="po-preview__section-label" style={{ marginTop: 8 }}>Payment Details</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{vendorBank}</div>
                    </>
                  )}
                </div>
                <div className="po-totals" style={{ alignSelf: 'start' }}>
                  <span className="po-totals__label">Subtotal</span>
                  <span className="po-totals__value">{fmt(totals.subtotal)}</span>
                  {parseFloat(overallDiscount) > 0 && (
                    <>
                      <span className="po-totals__label">Discount ({overallDiscount}%)</span>
                      <span className="po-totals__value">− {fmt(totals.discountAmount)}</span>
                    </>
                  )}
                  {parseFloat(taxRate) > 0 && (
                    <>
                      <span className="po-totals__label">Tax ({taxRate}%)</span>
                      <span className="po-totals__value">{fmt(totals.tax)}</span>
                    </>
                  )}
                  {parseFloat(extraCharges) > 0 && (
                    <>
                      <span className="po-totals__label">Freight / Other</span>
                      <span className="po-totals__value">{fmt(parseFloat(extraCharges))}</span>
                    </>
                  )}
                  <span className="po-totals__label po-totals__grand">TOTAL ({currency})</span>
                  <span className="po-totals__value po-totals__grand">{fmt(totals.total)}</span>
                </div>
              </div>

              {/* Signatory */}
              <div className="po-preview__signatory">
                <div>
                  {packingInstr && <div className="text-muted">Packing: {packingInstr}</div>}
                  {deliveryInstructions && <div className="text-muted">Delivery Notes: {deliveryInstructions}</div>}
                </div>
                <div className="po-preview__signatory-right">
                  <div className="text-muted">For {activeCompany?.name} — Authorised Signatory</div>
                  <div className="po-preview__signatory-name">{authorisedBy || 'Motty Philip'}</div>
                  <div className="text-muted">{activeCompany?.name}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="po-step__title">Save Purchase Order</div>
            <div className="po-form__actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !canEdit}
              >
                {saving ? 'Saving…' : isEdit ? 'Update PO' : 'Create PO'}
              </button>
              <button type="button" className="btn" onClick={() => navigate('/purchase-orders')}>
                Cancel
              </button>
            </div>
            {internalRemarks && (
              <div className="po-form__info" style={{ marginTop: 12 }}>
                <strong>Internal Remarks:</strong> {internalRemarks}
              </div>
            )}
          </div>

          <div className="po-form__nav">
            <button type="button" className="btn" onClick={() => goStep(4)}>← Back to Edit</button>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>Review carefully before saving</span>
          </div>
        </div>
      )}
    </div>
  );
}
