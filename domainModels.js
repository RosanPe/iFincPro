/**
 * domainModels.js
 * Strictly parses and validates the application's domain entities.
 */

// Helper to generate a simple unique ID
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

// Helper to parse date string YYYY-MM-DD safely into local timezone Date
export function parseLocalDate(dateVal) {
  if (dateVal instanceof Date) {
    // Ensure hours are reset to avoid time boundary shifts
    const d = new Date(dateVal);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof dateVal === 'string') {
    // If it is an ISO string with T, extract the date part first
    const cleanStr = dateVal.includes('T') ? dateVal.split('T')[0] : dateVal;
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  const fallback = new Date(dateVal);
  if (isNaN(fallback.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

// Format date back to local YYYY-MM-DD string for inputs and APIs
export function formatLocalDate(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return '';
  }
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class CreditCard {
  constructor({ id, name, dueDay }) {
    this.id = id || generateUUID();
    this.name = (name || '').trim();
    
    let parsedDay = parseInt(dueDay, 10);
    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      parsedDay = 10; // Default fallback
    }
    this.dueDay = parsedDay;
  }

  static parse(raw) {
    if (!raw.name || String(raw.name).trim() === '') {
      throw new Error('O nome do cartão é obrigatório.');
    }
    return new CreditCard(raw);
  }
}

export class Category {
  constructor({ name }) {
    this.name = (name || '').trim();
  }

  static parse(raw) {
    if (!raw.name || String(raw.name).trim() === '') {
      throw new Error('O nome da categoria é obrigatório.');
    }
    return new Category(raw);
  }
}

export class Expense {
  constructor({ id, date, description, value, category, method, cardId, installments, isLoan }, validCategories = []) {
    this.id = id || generateUUID();
    this.date = parseLocalDate(date);
    this.description = (description || 'Sem descrição').trim();
    
    const parsedVal = parseFloat(value);
    this.value = isNaN(parsedVal) ? 0 : parsedVal;
    
    // Map ghost categories to 'Outros'
    const cleanCategory = (category || '').trim();
    const isCategoryValid = validCategories.some(
      c => c.name.toLowerCase() === cleanCategory.toLowerCase()
    );
    this.category = isCategoryValid ? cleanCategory : 'Outros';
    
    // Validation for payment method
    const cleanMethod = (method || '').trim();
    this.method = (cleanMethod === 'Card' || cleanMethod === 'PixDebito') ? cleanMethod : 'PixDebito';
    
    if (this.method === 'Card') {
      this.cardId = (cardId || '').trim();
      let parsedInst = parseInt(installments, 10);
      this.installments = (isNaN(parsedInst) || parsedInst < 1) ? 1 : parsedInst;
    } else {
      this.cardId = '';
      this.installments = 1;
    }
    
    // Convert isLoan to boolean safely
    if (typeof isLoan === 'string') {
      this.isLoan = isLoan.toLowerCase() === 'true' || isLoan === '1';
    } else {
      this.isLoan = !!isLoan;
    }
  }

  static parse(raw, validCategories = []) {
    if (!raw.description || String(raw.description).trim() === '') {
      throw new Error('A descrição do gasto é obrigatória.');
    }
    const val = parseFloat(raw.value);
    if (isNaN(val) || val <= 0) {
      throw new Error('O valor do gasto deve ser maior que zero.');
    }
    if (raw.method === 'Card' && (!raw.cardId || String(raw.cardId).trim() === '')) {
      throw new Error('Para compras no crédito, selecione um cartão de crédito.');
    }
    return new Expense(raw, validCategories);
  }
}

export class Investment {
  constructor({ id, date, asset, quantity, averagePrice }) {
    this.id = id || generateUUID();
    this.date = parseLocalDate(date);
    this.asset = (asset || '').trim().toUpperCase();
    
    const qty = parseFloat(quantity);
    this.quantity = isNaN(qty) ? 0 : qty;
    
    const price = parseFloat(averagePrice);
    this.averagePrice = isNaN(price) ? 0 : price;
  }

  static parse(raw) {
    if (!raw.asset || String(raw.asset).trim() === '') {
      throw new Error('O código do ativo é obrigatório (ex: WEGE3).');
    }
    const qty = parseFloat(raw.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('A quantidade do ativo deve ser maior que zero.');
    }
    const price = parseFloat(raw.averagePrice);
    if (isNaN(price) || price < 0) {
      throw new Error('O preço médio do ativo não pode ser negativo.');
    }
    return new Investment(raw);
  }
}
