/**
 * appStore.js
 * In-memory client-side State Machine and Repository.
 * Handles Offline-First caching (LocalStorage), synchronization buffers, and JSON import/export.
 */

import { CreditCard, Category, Expense, Investment, formatLocalDate } from './domainModels.js';

class AppStore {
  constructor() {
    this.cards = [];
    this.categories = [];
    this.expenses = [];
    this.investments = [];
    
    // Transaction queue: { type: 'cartoes'|'categorias'|'gastos'|'investimentos', op: 'CREATE'|'UPDATE'|'DELETE', payload: Object }
    this.syncQueue = [];
    this.apiUrl = '';
    
    // Subscriber callbacks for state changes
    this.listeners = [];
  }

  // Subscribe to state updates (reactive-like behavior)
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('Erro em listener do AppStore:', err);
      }
    }
  }

  // Getters
  getCards() { return this.cards; }
  getCategories() { return this.categories; }
  getExpenses() { return this.expenses; }
  getInvestments() { return this.investments; }
  getSyncQueue() { return this.syncQueue; }
  getApiUrl() { return this.apiUrl; }

  setApiUrl(url) {
    this.apiUrl = (url || '').trim();
    localStorage.setItem('ifinc_api_url', this.apiUrl);
    this.notify();
  }

  /**
   * Initializes the store from LocalStorage caches.
   */
  initialize() {
    this.apiUrl = localStorage.getItem('ifinc_api_url') || '';
    
    try {
      const cachedCards = JSON.parse(localStorage.getItem('ifinc_cards') || '[]');
      this.cards = cachedCards.map(c => new CreditCard(c));
    } catch (e) {
      console.error('Falha ao carregar cartões cache:', e);
      this.cards = [];
    }

    try {
      const cachedCats = JSON.parse(localStorage.getItem('ifinc_categories') || '[]');
      this.categories = cachedCats.map(c => new Category(c));
      
      // Seed default category if empty
      if (this.categories.length === 0) {
        this.categories = [
          new Category({ name: 'Alimentação' }),
          new Category({ name: 'Transporte' }),
          new Category({ name: 'Lazer' }),
          new Category({ name: 'Saúde' }),
          new Category({ name: 'Educação' }),
          new Category({ name: 'Moradia' }),
          new Category({ name: 'Outros' })
        ];
      }
    } catch (e) {
      console.error('Falha ao carregar categorias cache:', e);
      this.categories = [];
    }

    try {
      const cachedExpenses = JSON.parse(localStorage.getItem('ifinc_expenses') || '[]');
      this.expenses = cachedExpenses.map(e => new Expense(e, this.categories));
    } catch (e) {
      console.error('Falha ao carregar gastos cache:', e);
      this.expenses = [];
    }

    try {
      const cachedInvests = JSON.parse(localStorage.getItem('ifinc_investments') || '[]');
      this.investments = cachedInvests.map(i => new Investment(i));
    } catch (e) {
      console.error('Falha ao carregar investimentos cache:', e);
      this.investments = [];
    }

    try {
      this.syncQueue = JSON.parse(localStorage.getItem('ifinc_sync_queue') || '[]');
    } catch (e) {
      console.error('Falha ao carregar fila de sincronização cache:', e);
      this.syncQueue = [];
    }
  }

  /**
   * Persists the in-memory state to LocalStorage.
   */
  saveToCache() {
    localStorage.setItem('ifinc_cards', JSON.stringify(this.cards));
    localStorage.setItem('ifinc_categories', JSON.stringify(this.categories));
    
    // Map dates to ISO strings before stringifying
    const serializedExpenses = this.expenses.map(e => ({
      ...e,
      date: formatLocalDate(e.date)
    }));
    localStorage.setItem('ifinc_expenses', JSON.stringify(serializedExpenses));

    const serializedInvestments = this.investments.map(i => ({
      ...i,
      date: formatLocalDate(i.date)
    }));
    localStorage.setItem('ifinc_investments', JSON.stringify(serializedInvestments));

    localStorage.setItem('ifinc_sync_queue', JSON.stringify(this.syncQueue));
  }

  /**
   * Pushes a transaction to the local queue.
   */
  queueTransaction(type, op, payload) {
    // Format dates to string for raw JSON serialization in queue
    let cleanPayload = { ...payload };
    if (payload.date instanceof Date) {
      cleanPayload.date = formatLocalDate(payload.date);
    }
    
    this.syncQueue.push({ type, op, payload: cleanPayload });
    this.saveToCache();
    this.notify();
  }

  // --- CRUD OPERATIONS WITH IMMEDIATE STATE MUTATION & TRANSACTION QUEUING ---

  // CREDIT CARDS
  addCard(rawCard) {
    const card = CreditCard.parse(rawCard);
    this.cards.push(card);
    this.queueTransaction('cartoes', 'CREATE', card);
    return card;
  }

  updateCard(rawCard) {
    const card = CreditCard.parse(rawCard);
    const idx = this.cards.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      this.cards[idx] = card;
      this.queueTransaction('cartoes', 'UPDATE', card);
      return card;
    }
    throw new Error('Cartão de crédito não encontrado para atualização.');
  }

  deleteCard(id) {
    const idx = this.cards.findIndex(c => c.id === id);
    if (idx !== -1) {
      const card = this.cards[idx];
      this.cards.splice(idx, 1);
      this.queueTransaction('cartoes', 'DELETE', { id });
      return card;
    }
    throw new Error('Cartão de crédito não encontrado para exclusão.');
  }

  // CATEGORIES
  addCategory(rawCategory) {
    const cat = Category.parse(rawCategory);
    const exists = this.categories.some(c => c.name.toLowerCase() === cat.name.toLowerCase());
    if (exists) {
      throw new Error('Essa categoria já existe.');
    }
    this.categories.push(cat);
    this.queueTransaction('categorias', 'CREATE', cat);
    return cat;
  }

  deleteCategory(name) {
    const idx = this.categories.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
    if (idx !== -1) {
      const cat = this.categories[idx];
      this.categories.splice(idx, 1);
      this.queueTransaction('categorias', 'DELETE', { nome: name });
      
      // Re-evaluate all expenses that belonged to the deleted category (they fall to 'Outros')
      this.expenses = this.expenses.map(e => new Expense(e, this.categories));
      this.saveToCache();
      return cat;
    }
    throw new Error('Categoria não encontrada para exclusão.');
  }

  // EXPENSES
  addExpense(rawExpense) {
    const exp = Expense.parse(rawExpense, this.categories);
    this.expenses.push(exp);
    this.queueTransaction('gastos', 'CREATE', exp);
    return exp;
  }

  updateExpense(rawExpense) {
    const exp = Expense.parse(rawExpense, this.categories);
    const idx = this.expenses.findIndex(e => e.id === exp.id);
    if (idx !== -1) {
      this.expenses[idx] = exp;
      this.queueTransaction('gastos', 'UPDATE', exp);
      return exp;
    }
    throw new Error('Despesa não encontrada para atualização.');
  }

  deleteExpense(id) {
    const idx = this.expenses.findIndex(e => e.id === id);
    if (idx !== -1) {
      const exp = this.expenses[idx];
      this.expenses.splice(idx, 1);
      this.queueTransaction('gastos', 'DELETE', { id });
      return exp;
    }
    throw new Error('Despesa não encontrada para exclusão.');
  }

  // INVESTMENTS
  addInvestment(rawInvestment) {
    const inv = Investment.parse(rawInvestment);
    this.investments.push(inv);
    this.queueTransaction('investimentos', 'CREATE', inv);
    return inv;
  }

  updateInvestment(rawInvestment) {
    const inv = Investment.parse(rawInvestment);
    const idx = this.investments.findIndex(i => i.id === inv.id);
    if (idx !== -1) {
      this.investments[idx] = inv;
      this.queueTransaction('investimentos', 'UPDATE', inv);
      return inv;
    }
    throw new Error('Investimento não encontrado para atualização.');
  }

  deleteInvestment(id) {
    const idx = this.investments.findIndex(i => i.id === id);
    if (idx !== -1) {
      const inv = this.investments[idx];
      this.investments.splice(idx, 1);
      this.queueTransaction('investimentos', 'DELETE', { id });
      return inv;
    }
    throw new Error('Investimento não encontrado para exclusão.');
  }

  /**
   * Merges server-pulled data into the local memory store.
   * If there are transactions in the queue, we can preserve them.
   * 
   * @param {Object} data - Pulled lists: { cartoes, categorias, gastos, investimentos }
   */
  mergeServerData(data) {
    if (!data) return;

    // Parse credit cards
    if (Array.isArray(data.cartoes)) {
      this.cards = data.cartoes.map(c => new CreditCard({
        id: c.id,
        name: c.nome,
        dueDay: c.vencimentoDia
      }));
    }

    // Parse categories
    if (Array.isArray(data.categorias)) {
      this.categories = data.categorias.map(c => new Category({
        name: c.nome
      }));
    }

    // Parse expenses
    if (Array.isArray(data.gastos)) {
      this.expenses = data.gastos.map(g => new Expense({
        id: g.id,
        date: g.data,
        description: g.descricao,
        value: g.valor,
        category: g.categoria,
        method: g.metodo,
        cardId: g.cartaoId,
        installments: g.parcelas,
        isLoan: g.emprestimo
      }, this.categories));
    }

    // Parse investments
    if (Array.isArray(data.investimentos)) {
      this.investments = data.investimentos.map(i => new Investment({
        id: i.id,
        date: i.data,
        asset: i.ativo,
        quantity: i.quantidade,
        averagePrice: i.precoMedio
      }));
    }

    // Apply any local un-synced transactions on top of the server data to keep UI consistent
    // (e.g. if the user added/deleted something offline, it's still in the local queue and should be reflected).
    this.replayQueueOnState();

    this.saveToCache();
    this.notify();
  }

  /**
   * Replays current syncQueue operations on top of the data to reflect un-synced additions/deletions.
   */
  replayQueueOnState() {
    for (const trx of this.syncQueue) {
      try {
        const { type, op, payload } = trx;
        if (type === 'cartoes') {
          if (op === 'CREATE') {
            if (!this.cards.some(c => c.id === payload.id)) {
              this.cards.push(new CreditCard(payload));
            }
          } else if (op === 'UPDATE') {
            const idx = this.cards.findIndex(c => c.id === payload.id);
            if (idx !== -1) this.cards[idx] = new CreditCard(payload);
          } else if (op === 'DELETE') {
            this.cards = this.cards.filter(c => c.id !== payload.id);
          }
        } else if (type === 'categorias') {
          if (op === 'CREATE') {
            if (!this.categories.some(c => c.name.toLowerCase() === payload.name.toLowerCase())) {
              this.categories.push(new Category(payload));
            }
          } else if (op === 'DELETE') {
            this.categories = this.categories.filter(c => c.name.toLowerCase() !== payload.nome.toLowerCase());
          }
        } else if (type === 'gastos') {
          if (op === 'CREATE') {
            if (!this.expenses.some(e => e.id === payload.id)) {
              this.expenses.push(new Expense(payload, this.categories));
            }
          } else if (op === 'UPDATE') {
            const idx = this.expenses.findIndex(e => e.id === payload.id);
            if (idx !== -1) this.expenses[idx] = new Expense(payload, this.categories);
          } else if (op === 'DELETE') {
            this.expenses = this.expenses.filter(e => e.id !== payload.id);
          }
        } else if (type === 'investimentos') {
          if (op === 'CREATE') {
            if (!this.investments.some(i => i.id === payload.id)) {
              this.investments.push(new Investment(payload));
            }
          } else if (op === 'UPDATE') {
            const idx = this.investments.findIndex(i => i.id === payload.id);
            if (idx !== -1) this.investments[idx] = new Investment(payload);
          } else if (op === 'DELETE') {
            this.investments = this.investments.filter(i => i.id !== payload.id);
          }
        }
      } catch (err) {
        console.error('Falha ao re-executar transação local da fila:', err, trx);
      }
    }
  }

  /**
   * Clears the transaction sync queue after server sync is successful.
   */
  clearSyncQueue() {
    this.syncQueue = [];
    this.saveToCache();
    this.notify();
  }

  /**
   * Exports the entire store contents to a JSON string.
   */
  exportBackup() {
    const data = {
      apiUrl: this.apiUrl,
      cards: this.cards,
      categories: this.categories,
      expenses: this.expenses.map(e => ({ ...e, date: formatLocalDate(e.date) })),
      investments: this.investments.map(i => ({ ...i, date: formatLocalDate(i.date) })),
      syncQueue: this.syncQueue
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Imports store contents from a backup JSON string.
   */
  importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      
      if (data.apiUrl !== undefined) this.apiUrl = data.apiUrl;
      
      if (Array.isArray(data.cards)) {
        this.cards = data.cards.map(c => new CreditCard(c));
      }
      
      if (Array.isArray(data.categories)) {
        this.categories = data.categories.map(c => new Category(c));
      }
      
      if (Array.isArray(data.expenses)) {
        this.expenses = data.expenses.map(e => new Expense(e, this.categories));
      }
      
      if (Array.isArray(data.investments)) {
        this.investments = data.investments.map(i => new Investment(i));
      }
      
      if (Array.isArray(data.syncQueue)) {
        this.syncQueue = data.syncQueue;
      }

      this.saveToCache();
      
      if (this.apiUrl) {
        localStorage.setItem('ifinc_api_url', this.apiUrl);
      }

      this.notify();
      return true;
    } catch (error) {
      console.error('Falha ao importar backup:', error);
      throw new Error('JSON de backup inválido.');
    }
  }
}

// Single instance of store shared across elements
export const store = new AppStore();
