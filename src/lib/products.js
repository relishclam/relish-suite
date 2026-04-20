import { supabase } from './supabase';

// ─── List products for a company ─────────────────────────
export async function fetchProducts(companyId, { search = '', activeOnly = true } = {}) {
  let query = supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── Get single product ──────────────────────────────────
export async function fetchProduct(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create product ──────────────────────────────────────
export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update product ──────────────────────────────────────
export async function updateProduct(productId, updates) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle product active/inactive ──────────────────────
export async function toggleProductActive(productId, isActive) {
  return updateProduct(productId, { is_active: isActive });
}
