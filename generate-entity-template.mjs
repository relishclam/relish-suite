/**
 * generate-entity-template.mjs
 * Generates RELISH_Entity_Import_Template.xlsx
 *
 * Run: node generate-entity-template.mjs
 * Output: tools/RELISH_Entity_Import_Template.xlsx
 */

import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';

// ── Column definitions ────────────────────────────────────────────────────────
// Each column: { header, field, width, note }

const COLUMNS = [
  // ── Identity
  { header: 'role *',              field: 'role',                 width: 14, note: 'Required. One of: Vendor | Customer | Staff | Management | Auditor | Government | Contractor | Supplier | Fisher' },
  { header: 'company_code *',      field: 'company_code',         width: 13, note: 'Required. RHHF or RFPL' },
  { header: 'display_name *',      field: 'display_name',         width: 30, note: 'Required. Full legal name of the person or organisation' },
  { header: 'alias',               field: 'alias',                width: 20, note: 'Short name / code (e.g. "Coastal" for Coastal Suppliers Pvt Ltd)' },

  // ── Contact
  { header: 'mobile',              field: 'mobile',               width: 15, note: 'Primary mobile number with country code (e.g. +919446012324)' },
  { header: 'mobile_alt',          field: 'mobile_alt',           width: 15, note: 'Alternate mobile number' },
  { header: 'email',               field: 'email',                width: 28, note: 'Email address' },

  // ── India registration (leave blank for overseas)
  { header: 'gstin',               field: 'gstin',                width: 18, note: 'India ONLY. GST Identification Number (15 chars). Leave blank for overseas.' },
  { header: 'pan',                 field: 'pan',                  width: 12, note: 'India ONLY. Permanent Account Number (10 chars). Leave blank for overseas.' },

  // ── Overseas registration (leave blank for India)
  { header: 'local_reg_number',    field: 'local_reg_number',     width: 22, note: 'OVERSEAS ONLY. BRC (HK) · UEN (SG) · USCC (CN) · Corporate No. (JP) · CR No. (TH/UAE) · Companies House No. (UK)' },
  { header: 'local_tax_number',    field: 'local_tax_number',     width: 22, note: 'OVERSEAS ONLY. VAT/TRN/TIN. Leave blank for CN/JP (same as reg number).' },

  // ── Address
  { header: 'address_line1',       field: 'address_line1',        width: 35, note: 'Street / building address line 1' },
  { header: 'address_line2',       field: 'address_line2',        width: 35, note: 'Address line 2' },
  { header: 'city',                field: 'city',                 width: 18, note: 'City' },
  { header: 'state',               field: 'state',                width: 18, note: 'State / Province' },
  { header: 'pincode',             field: 'pincode',              width: 10, note: 'Postal / ZIP code' },
  { header: 'country',             field: 'country',              width: 14, note: 'Country. Default: India. For overseas: Hong Kong | Singapore | China | Japan | Thailand | UAE | UK | USA etc.' },

  // ── Bank (India)
  { header: 'bank_name',           field: 'bank_name',            width: 22, note: 'Bank name (e.g. State Bank of India)' },
  { header: 'bank_account_holder', field: 'bank_account_holder',  width: 28, note: 'Account holder name exactly as in bank records' },
  { header: 'bank_account_number', field: 'bank_account_number',  width: 22, note: 'India: Account number. Overseas: full account number or IBAN.' },
  { header: 'bank_ifsc',           field: 'bank_ifsc',            width: 13, note: 'India ONLY. 11-char IFSC code (e.g. SBIN0001234). Leave blank for overseas.' },
  { header: 'bank_swift',          field: 'bank_swift',           width: 14, note: 'OVERSEAS ONLY. SWIFT/BIC code (e.g. HSBCHKHHHKH). Leave blank for India.' },
  { header: 'upi_id',              field: 'upi_id',               width: 25, note: 'UPI ID (e.g. 9446012324@okaxis). India only.' },

  // ── Role-level fields
  { header: 'pramaana_ledger_name',field: 'pramaana_ledger_name', width: 28, note: 'Ledger name as it will appear in Pramaana accounts. For Vendor + Customer: required.' },
  { header: 'designation',         field: 'designation',          width: 20, note: 'Staff/Management ONLY. Job title (e.g. Plant Manager, Director)' },
  { header: 'department',          field: 'department',           width: 18, note: 'Staff/Management ONLY. Department (e.g. Processing, Accounts, CalciWorks)' },

  // ── Migration source (helps traceability)
  { header: 'source',              field: 'source',               width: 20, note: 'Where this record came from: Approvals | ClamFlow | Tally | Manual' },
  { header: 'notes',               field: 'notes',                width: 35, note: 'Any notes / remarks for this entity' },
];

// ── Example rows ──────────────────────────────────────────────────────────────

const EXAMPLE_INDIA = {
  role: 'Vendor',
  company_code: 'RHHF',
  display_name: 'Coastal Traders Pvt Ltd',
  alias: 'Coastal',
  mobile: '+919876543210',
  mobile_alt: '',
  email: 'accounts@coastaltraders.in',
  gstin: '32AABCC1234D1Z5',
  pan: 'AABCC1234D',
  local_reg_number: '',
  local_tax_number: '',
  address_line1: 'No. 12, Harbour Road',
  address_line2: 'Near Fish Market',
  city: 'Alappuzha',
  state: 'Kerala',
  pincode: '688001',
  country: 'India',
  bank_name: 'State Bank of India',
  bank_account_holder: 'Coastal Traders Pvt Ltd',
  bank_account_number: '31234567890',
  bank_ifsc: 'SBIN0000123',
  bank_swift: '',
  upi_id: '',
  pramaana_ledger_name: 'Coastal Traders Pvt Ltd',
  designation: '',
  department: '',
  source: 'Approvals',
  notes: 'Main clam supplier — RHHF Panavally',
};

const EXAMPLE_STAFF = {
  role: 'Staff',
  company_code: 'RHHF',
  display_name: 'Rajan Pillai',
  alias: '',
  mobile: '+919400112233',
  mobile_alt: '',
  email: '',
  gstin: '',
  pan: 'ABCPR1234F',
  local_reg_number: '',
  local_tax_number: '',
  address_line1: 'TC 45/2, Mullackal',
  address_line2: '',
  city: 'Alappuzha',
  state: 'Kerala',
  pincode: '688001',
  country: 'India',
  bank_name: 'Union Bank of India',
  bank_account_holder: 'Rajan Pillai',
  bank_account_number: '987654321001',
  bank_ifsc: 'UBIN0532345',
  bank_swift: '',
  upi_id: '9400112233@upi',
  pramaana_ledger_name: '',
  designation: 'Production Supervisor',
  department: 'Processing',
  source: 'ClamFlow',
  notes: '',
};

const EXAMPLE_OVERSEAS = {
  role: 'Customer',
  company_code: 'RFPL',
  display_name: 'FoodStream Ltd',
  alias: 'FoodStream HK',
  mobile: '+85260528713',
  mobile_alt: '',
  email: 'trading@foodstream.co',
  gstin: '',
  pan: '',
  local_reg_number: '12345678',
  local_tax_number: '',
  address_line1: 'No. 26, 10/F Beverly Commercial Centre',
  address_line2: '87-105 Chatham Road South, Tsim Sha Tsui',
  city: 'Kowloon',
  state: '',
  pincode: '',
  country: 'Hong Kong',
  bank_name: 'HSBC Hong Kong',
  bank_account_holder: 'FoodStream Limited',
  bank_account_number: '123-456789-001',
  bank_ifsc: '',
  bank_swift: 'HSBCHKHHHKH',
  upi_id: '',
  pramaana_ledger_name: 'FoodStream Ltd — HK',
  designation: '',
  department: '',
  source: 'Manual',
  notes: 'Hong Kong registered. Vendor + Customer (dual role — add second row with role=Vendor)',
};

const EXAMPLE_MANAGEMENT = {
  role: 'Management',
  company_code: 'RHHF',
  display_name: 'Motty Philip',
  alias: '',
  mobile: '+919446012324',
  mobile_alt: '',
  email: 'motty.philip@gmail.com',
  gstin: '',
  pan: 'ABCPM1234G',
  local_reg_number: '',
  local_tax_number: '',
  address_line1: '26/599, M.O.Ward',
  address_line2: '',
  city: 'Alappuzha',
  state: 'Kerala',
  pincode: '688001',
  country: 'India',
  bank_name: 'HDFC Bank',
  bank_account_holder: 'Motty Philip',
  bank_account_number: '50100123456789',
  bank_ifsc: 'HDFC0001234',
  bank_swift: '',
  upi_id: '9446012324@okhdfc',
  pramaana_ledger_name: '',
  designation: 'Partner',
  department: '',
  source: 'Manual',
  notes: 'Principal partner — RHHF',
};

// ── Build workbook ────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

// ── Sheet 1: Data Entry ───────────────────────────────────────────────────────

const headers = COLUMNS.map(c => c.header);
const exampleRows = [EXAMPLE_INDIA, EXAMPLE_STAFF, EXAMPLE_OVERSEAS, EXAMPLE_MANAGEMENT].map(row =>
  COLUMNS.map(c => row[c.field] ?? '')
);

const wsData = [headers, ...exampleRows];
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Column widths
ws['!cols'] = COLUMNS.map(c => ({ wch: c.width }));

// Freeze header row
ws['!freeze'] = { xSplit: 0, ySplit: 1 };

XLSX.utils.book_append_sheet(wb, ws, 'Entities');

// ── Sheet 2: Field Reference ──────────────────────────────────────────────────

const refHeaders = ['Column Name', 'Required?', 'India', 'Overseas', 'Notes'];
const refRows = COLUMNS.map(c => {
  const req = c.header.endsWith('*') ? 'Yes' : 'No';
  const india = ['gstin','pan','bank_ifsc','upi_id'].includes(c.field) ? 'India only' :
                ['local_reg_number','local_tax_number','bank_swift'].includes(c.field) ? 'Leave blank' : '✓';
  const overseas = ['gstin','pan','bank_ifsc','upi_id'].includes(c.field) ? 'Leave blank' :
                   ['local_reg_number','local_tax_number','bank_swift'].includes(c.field) ? 'Overseas only' : '✓';
  return [c.header.replace(' *',''), req, india, overseas, c.note];
});

const wsRef = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
wsRef['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 80 }];
wsRef['!freeze'] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(wb, wsRef, 'Field Reference');

// ── Sheet 3: Role Reference ───────────────────────────────────────────────────

const roleData = [
  ['Role', 'Entity Type', 'Payee in Pramaana?', 'GSTIN Required?', 'Bank Details?', 'Tally/Pramaana Ledger?', 'Typical Use'],
  ['Vendor',     'ORGANISATION', 'Yes', 'Yes (India)', 'Required', 'Required', 'Goods/services suppliers'],
  ['Customer',   'ORGANISATION', 'No',  'Yes (India)', 'Optional', 'Required', 'Export buyers, domestic buyers'],
  ['Staff',      'PERSON',       'Yes', 'No',          'Required', 'No',       'Employees, plant workers'],
  ['Management', 'PERSON',       'Yes', 'No',          'Required', 'No',       'Directors, partners'],
  ['Supplier',   'ORGANISATION', 'Yes', 'Recommended', 'Required', 'Optional', 'Raw material suppliers (ClamFlow)'],
  ['Auditor',    'PERSON/ORG',   'Yes', 'Optional',    'Optional', 'Optional', 'External auditors'],
  ['Government', 'ORGANISATION', 'Yes', 'N/A',         'No',       'Optional', 'Tax authorities, govt departments'],
  ['Contractor', 'PERSON/ORG',   'Yes', 'Recommended', 'Required', 'Optional', 'Project contractors'],
  ['Fisher',     'PERSON',       'Yes', 'No',          'Required', 'No',       'Fishing vessel operators (ClamFlow)'],
];

const wsRoles = XLSX.utils.aoa_to_sheet(roleData);
wsRoles['!cols'] = [{ wch: 13 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 38 }];
wsRoles['!freeze'] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(wb, wsRoles, 'Roles');

// ── Sheet 4: Migration Sources ────────────────────────────────────────────────

const migData = [
  ['Source App', 'What to migrate', 'Map to role', 'Notes'],
  ['Relish Approvals', 'All active payees (payee_name, mobile, bank details)', 'Vendor / Management / Staff / Contractor', 'Check payee type — skip duplicate names'],
  ['Relish Approvals', 'Staff who receive advances', 'Staff', 'Set suspense_eligible = true in notes if needed'],
  ['ClamFlow', 'person_records WHERE is_supplier=true', 'Supplier', 'Use legacy_clamflow_person_id for traceability'],
  ['ClamFlow', 'person_records WHERE person_type=staff', 'Staff', 'Use legacy_clamflow_person_id for traceability'],
  ['Tally', 'Sundry Creditors ledger accounts', 'Vendor', 'Use ledger name as pramaana_ledger_name'],
  ['Tally', 'Sundry Debtors ledger accounts', 'Customer', 'Use ledger name as pramaana_ledger_name'],
  ['Manual', 'Directors, partners, management', 'Management', 'Enter bank + PAN for payment processing'],
];

const wsMig = XLSX.utils.aoa_to_sheet(migData);
wsMig['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 22 }, { wch: 55 }];
wsMig['!freeze'] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(wb, wsMig, 'Migration Guide');

// ── Write file ────────────────────────────────────────────────────────────────

mkdirSync('tools', { recursive: true });
XLSX.writeFile(wb, 'tools/RELISH_Entity_Import_Template.xlsx');
console.log('✅  Created: tools/RELISH_Entity_Import_Template.xlsx');
console.log(`    Sheets: Entities (data entry + 4 examples) | Field Reference | Roles | Migration Guide`);
