/**
 * app.js
 * Central Application Orchestrator.
 * Boots the application, binds DOM event listeners, and manages view states.
 */

import { store } from './appStore.js';
import { renderer } from './domRenderer.js';
import { ApiService } from './apiService.js';
import { parseLocalDate, formatLocalDate } from './domainModels.js';

// Global reference for active notifications timeout
let toastTimeout = null;

// Display visual toast alert to the user
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.className = 'fixed bottom-5 right-5 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 flex items-center gap-2 text-sm font-semibold border z-[100]';
  
  if (type === 'success') {
    toast.classList.add('bg-jade/20', 'text-jade', 'border-jade/30');
  } else if (type === 'error') {
    toast.classList.add('bg-accentPink/20', 'text-accentPink', 'border-accentPink/30');
  } else {
    toast.classList.add('bg-slateBorder/80', 'text-slate-200', 'border-slateBorder');
  }

  toast.innerHTML = `
    <span>${message}</span>
  `;

  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  
  toastTimeout = setTimeout(() => {
    toast.classList.add('translate-y-5', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 4000);
}

// Modal open/close helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }
}

// Boostrap and wire up events
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Store
  store.initialize();

  // 2. Initialize DOM Renderer
  renderer.init(store);

  // 3. Subscribe Renderer to Store updates
  store.subscribe((updatedStore) => {
    renderer.renderAll(updatedStore);
  });

  // Automatic background pull on startup if API URL is configured
  const initialUrl = store.getApiUrl();
  if (initialUrl) {
    (async () => {
      try {
        console.log('Iniciando sincronização em segundo plano...');
        const data = await ApiService.pullData(initialUrl);
        store.mergeServerData(data);
      } catch (err) {
        console.warn('Não foi possível sincronizar na inicialização:', err.message);
      }
    })();
  }

  // Check if API URL is missing and prompt user gently via settings modal
  if (!store.getApiUrl()) {
    setTimeout(() => {
      openModal('modal-settings');
      showToast('Por favor, configure a URL do seu script do Google Sheets para habilitar a sincronização.', 'info');
    }, 800);
  }

  // --- NAVIGATION (TAB ROUTING) ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      
      // Update buttons style for both desktop and mobile menus
      tabButtons.forEach(b => {
        if (b.dataset.tab === target) {
          b.classList.add('text-cyanAcc');
          b.classList.remove('text-slate-400', 'hover:text-slate-200');
          // Add border-cyanAcc only for desktop sidebar buttons
          if (b.classList.contains('border-l-2')) {
            b.classList.add('border-cyanAcc');
            b.classList.remove('border-transparent');
          }
        } else {
          b.classList.remove('text-cyanAcc');
          b.classList.add('text-slate-400', 'hover:text-slate-200');
          if (b.classList.contains('border-l-2')) {
            b.classList.add('border-transparent');
            b.classList.remove('border-cyanAcc');
          }
        }
      });

      // Toggle Panels
      panels.forEach(p => {
        if (p.id === `panel-${target}`) {
          p.classList.remove('hidden');
        } else {
          p.classList.add('hidden');
        }
      });

      // Special handling: re-render dashboard charts on tab activation
      if (target === 'dashboard') {
        renderer.renderDashboard(store);
      }
    });
  });

  // --- FORM FIELD CONDITIONAL VISIBILITY (EXPENSE TYPE) ---
  const gastoMetodo = document.getElementById('gasto-metodo');
  const creditCardFields = document.getElementById('credit-card-fields');

  if (gastoMetodo && creditCardFields) {
    gastoMetodo.addEventListener('change', () => {
      if (gastoMetodo.value === 'Card') {
        creditCardFields.classList.remove('hidden');
      } else {
        creditCardFields.classList.add('hidden');
      }
    });
  }

  // --- OPEN MODAL TRIGGERS ---
  document.getElementById('btn-new-expense')?.addEventListener('click', () => {
    renderer.currentEditExpenseId = null;
    document.getElementById('modal-expense-title').textContent = 'Registrar Novo Gasto';
    document.getElementById('form-expense').reset();
    document.getElementById('gasto-id').value = '';
    // Apply conditional visibility trigger
    gastoMetodo.dispatchEvent(new Event('change'));
    
    // Seed today's date in local time
    const todayStr = formatLocalDate(new Date());
    document.getElementById('gasto-data').value = todayStr;
    
    openModal('modal-expense');
  });

  document.getElementById('btn-new-investment')?.addEventListener('click', () => {
    renderer.currentEditInvestmentId = null;
    document.getElementById('modal-investment-title').textContent = 'Registrar Novo Investimento';
    document.getElementById('form-investment').reset();
    document.getElementById('invest-id').value = '';
    
    const todayStr = formatLocalDate(new Date());
    document.getElementById('invest-data').value = todayStr;

    openModal('modal-investment');
  });

  document.getElementById('btn-new-card')?.addEventListener('click', () => {
    document.getElementById('form-card').reset();
    openModal('modal-card');
  });

  document.getElementById('btn-new-category')?.addEventListener('click', () => {
    document.getElementById('form-category').reset();
    openModal('modal-category');
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    document.getElementById('settings-api-url').value = store.getApiUrl();
    openModal('modal-settings');
  });

  // --- CLOSE MODALS ---
  const closeButtons = document.querySelectorAll('.btn-close-modal');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });

  // --- SUBMIT: EXPENSE ---
  document.getElementById('form-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    renderer.clearFormWarnings(['gasto-descricao', 'gasto-valor', 'gasto-cartao']);

    const id = document.getElementById('gasto-id').value;
    const date = document.getElementById('gasto-data').value;
    const description = document.getElementById('gasto-descricao').value;
    const value = document.getElementById('gasto-valor').value;
    const category = document.getElementById('gasto-categoria').value;
    const method = document.getElementById('gasto-metodo').value;
    const cardId = document.getElementById('gasto-cartao').value;
    const installments = document.getElementById('gasto-parcelas').value;
    const isLoan = document.getElementById('gasto-emprestimo').checked;

    const payload = {
      id,
      date,
      description,
      value,
      category,
      method,
      cardId,
      installments,
      isLoan
    };

    try {
      if (renderer.currentEditExpenseId) {
        store.updateExpense(payload);
        showToast('Despesa atualizada com sucesso!');
      } else {
        store.addExpense(payload);
        showToast('Despesa cadastrada com sucesso!');
      }
      closeModal('modal-expense');
    } catch (err) {
      showToast(err.message, 'error');
      // Visual feedback on forms
      if (err.message.includes('descrição')) renderer.setFieldWarning('gasto-descricao', true);
      if (err.message.includes('valor')) renderer.setFieldWarning('gasto-valor', true);
      if (err.message.includes('cartão')) renderer.setFieldWarning('gasto-cartao', true);
    }
  });

  // --- SUBMIT: INVESTMENT ---
  document.getElementById('form-investment')?.addEventListener('submit', (e) => {
    e.preventDefault();
    renderer.clearFormWarnings(['invest-ativo', 'invest-quantidade', 'invest-preco']);

    const id = document.getElementById('invest-id').value;
    const date = document.getElementById('invest-data').value;
    const asset = document.getElementById('invest-ativo').value;
    const quantity = document.getElementById('invest-quantidade').value;
    const averagePrice = document.getElementById('invest-preco').value;

    const payload = {
      id,
      date,
      asset,
      quantity,
      averagePrice
    };

    try {
      if (renderer.currentEditInvestmentId) {
        store.updateInvestment(payload);
        showToast('Investimento atualizado com sucesso!');
      } else {
        store.addInvestment(payload);
        showToast('Investimento cadastrado com sucesso!');
      }
      closeModal('modal-investment');
    } catch (err) {
      showToast(err.message, 'error');
      if (err.message.includes('ativo') || err.message.includes('código')) renderer.setFieldWarning('invest-ativo', true);
      if (err.message.includes('quantidade')) renderer.setFieldWarning('invest-quantidade', true);
      if (err.message.includes('preço') || err.message.includes('negativo')) renderer.setFieldWarning('invest-preco', true);
    }
  });

  // --- SUBMIT: CREDIT CARD ---
  document.getElementById('form-card')?.addEventListener('submit', (e) => {
    e.preventDefault();
    renderer.clearFormWarnings(['card-nome', 'card-vencimento']);

    const name = document.getElementById('card-nome').value;
    const dueDay = document.getElementById('card-vencimento').value;

    try {
      store.addCard({ name, dueDay });
      showToast('Cartão de crédito cadastrado com sucesso!');
      closeModal('modal-card');
    } catch (err) {
      showToast(err.message, 'error');
      if (err.message.includes('nome')) renderer.setFieldWarning('card-nome', true);
      if (err.message.includes('vencimento') || err.message.includes('dia')) renderer.setFieldWarning('card-vencimento', true);
    }
  });

  // --- SUBMIT: CATEGORY ---
  document.getElementById('form-category')?.addEventListener('submit', (e) => {
    e.preventDefault();
    renderer.clearFormWarnings(['cat-nome']);

    const name = document.getElementById('cat-nome').value;

    try {
      store.addCategory({ name });
      showToast('Categoria cadastrada com sucesso!');
      closeModal('modal-category');
    } catch (err) {
      showToast(err.message, 'error');
      renderer.setFieldWarning('cat-nome', true);
    }
  });

  // --- SUBMIT: SETTINGS (API CONFIGURATION) ---
  document.getElementById('form-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('settings-api-url').value;
    store.setApiUrl(url);
    showToast('Configurações salvas!', 'success');
    closeModal('modal-settings');

    if (url) {
      showToast('Baixando dados da planilha...', 'info');
      try {
        const data = await ApiService.pullData(url);
        store.mergeServerData(data);
        showToast('Planilha sincronizada!', 'success');
      } catch (err) {
        showToast(`Erro ao baixar dados: ${err.message}`, 'error');
      }
    }
  });

  // Test settings API connection
  document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
    const testBtn = document.getElementById('btn-test-connection');
    const url = document.getElementById('settings-api-url').value;
    
    if (!url || !url.startsWith('http')) {
      showToast('Insira uma URL válida para testar.', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testando...';

    try {
      const data = await ApiService.pullData(url);
      showToast('Conexão estabelecida com sucesso! API respondendo.', 'success');
      
      // Auto populate store since connection succeeded
      store.mergeServerData(data);
    } catch (err) {
      showToast(`Falha na conexão: ${err.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Testar Conexão';
    }
  });

  // --- TABLE INTERACTIONS (EVENT DELEGATION) ---
  
  // A. Expenses actions
  document.getElementById('panel-expenses')?.addEventListener('click', (e) => {
    const target = e.target;
    
    // Check if target or ancestor has the class
    const deleteBtn = target.closest('.btn-delete-expense');
    const editBtn = target.closest('.btn-edit-expense');

    // Delete
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (confirm('Tem certeza que deseja excluir esta despesa?')) {
        store.deleteExpense(id);
        showToast('Despesa excluída!');
      }
    }
    
    // Edit
    if (editBtn) {
      const id = editBtn.dataset.id;
      const exp = store.getExpenses().find(x => x.id === id);
      if (exp) {
        renderer.currentEditExpenseId = id;
        
        document.getElementById('modal-expense-title').textContent = 'Editar Gasto';
        document.getElementById('gasto-id').value = exp.id;
        document.getElementById('gasto-data').value = formatLocalDate(exp.date);
        document.getElementById('gasto-descricao').value = exp.description;
        document.getElementById('gasto-valor').value = exp.value;
        document.getElementById('gasto-categoria').value = exp.category;
        document.getElementById('gasto-metodo').value = exp.method;
        document.getElementById('gasto-cartao').value = exp.cardId || '';
        document.getElementById('gasto-parcelas').value = exp.installments || 1;
        document.getElementById('gasto-emprestimo').checked = exp.isLoan;

        // Trigger conditional field view
        gastoMetodo.dispatchEvent(new Event('change'));
        openModal('modal-expense');
      }
    }
  });

  // B. Investments actions
  document.getElementById('panel-investments')?.addEventListener('click', (e) => {
    const target = e.target;

    const expandBtn = target.closest('.btn-expand-history');
    const deleteBtn = target.closest('.btn-delete-investment');
    const editBtn = target.closest('.btn-edit-investment');

    // Expand history rows toggle
    if (expandBtn) {
      const asset = expandBtn.dataset.asset;
      const historyRow = document.getElementById(`history-row-${asset}`);
      const mobileHistoryRow = document.getElementById(`mobile-history-row-${asset}`);
      const buttons = document.querySelectorAll(`.btn-expand-history[data-asset="${asset}"]`);
      
      let isHidden = true;
      if (historyRow) {
        isHidden = historyRow.classList.contains('hidden');
        if (isHidden) {
          historyRow.classList.remove('hidden');
        } else {
          historyRow.classList.add('hidden');
        }
      }
      
      if (mobileHistoryRow) {
        isHidden = mobileHistoryRow.classList.contains('hidden');
        if (isHidden) {
          mobileHistoryRow.classList.remove('hidden');
        } else {
          mobileHistoryRow.classList.add('hidden');
        }
      }
      
      buttons.forEach(btn => {
        btn.textContent = isHidden ? 'Recolher' : 'Detalhes';
      });
    }

    // Delete purchase operation
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (confirm('Tem certeza que deseja excluir esta compra de ativo?')) {
        store.deleteInvestment(id);
        showToast('Investimento excluído!');
      }
    }

    // Edit purchase operation
    if (editBtn) {
      const id = editBtn.dataset.id;
      const inv = store.getInvestments().find(x => x.id === id);
      if (inv) {
        renderer.currentEditInvestmentId = id;

        document.getElementById('modal-investment-title').textContent = 'Editar Investimento';
        document.getElementById('invest-id').value = inv.id;
        document.getElementById('invest-data').value = formatLocalDate(inv.date);
        document.getElementById('invest-ativo').value = inv.asset;
        document.getElementById('invest-quantidade').value = inv.quantity;
        document.getElementById('invest-preco').value = inv.averagePrice;

        openModal('modal-investment');
      }
    }
  });

  // C. Configuration tab actions (Cards & Categories deletions)
  document.getElementById('list-cards-container')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-card')) {
      const id = e.target.dataset.id;
      if (confirm('Tem certeza que deseja excluir este cartão? Todas as despesas vinculadas a ele perderão o vínculo.')) {
        try {
          store.deleteCard(id);
          showToast('Cartão de crédito excluído!');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    }
  });

  document.getElementById('list-categories-container')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-category')) {
      const name = e.target.dataset.name;
      if (confirm(`Deseja excluir a categoria "${name}"? Despesas com esta categoria serão remapeadas para "Outros".`)) {
        try {
          store.deleteCategory(name);
          showToast('Categoria excluída!');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    }
  });

  // --- FILTERS (LEDGERS EXPENSES & INVESTMENTS) ---
  const expenseFilterIds = ['filtro-gasto-busca', 'filtro-gasto-categoria', 'filtro-gasto-metodo', 'filtro-gasto-cartao'];
  for (const id of expenseFilterIds) {
    document.getElementById(id)?.addEventListener('input', () => renderer.renderExpensesTable(store));
    document.getElementById(id)?.addEventListener('change', () => renderer.renderExpensesTable(store));
  }

  document.getElementById('filtro-investimento-busca')?.addEventListener('input', () => {
    renderer.renderInvestmentsTable(store);
  });

  // --- DASHBOARD MONTH SELECTOR ---
  document.getElementById('dashboard-month-selector')?.addEventListener('change', (e) => {
    renderer.selectedDashboardMonth = e.target.value;
    renderer.renderDashboard(store);
  });

  // --- SYNCHRONIZE WITH REMOTE SERVER (POST FLUSH & GET RE-PULL) ---
  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const syncBtn = document.getElementById('btn-sync');
    const queue = store.getSyncQueue();
    const url = store.getApiUrl();

    if (queue.length === 0) {
      showToast('Nenhuma pendência para sincronizar.', 'info');
      return;
    }

    if (!url) {
      openModal('modal-settings');
      showToast('Configure a URL do script do Google Sheets antes de sincronizar.', 'error');
      return;
    }

    // Set UI loading state
    syncBtn.disabled = true;
    syncBtn.innerHTML = `
      <svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Sincronizando...
    `;

    try {
      showToast('Enviando alterações locais...', 'info');
      
      // 1. Sync local queue to Sheets
      await ApiService.syncQueue(url, queue);
      store.clearSyncQueue(); // Clear queue on success

      showToast('Carregando dados consolidados...', 'info');
      
      // 2. Fetch fresh merged database state from server
      const freshData = await ApiService.pullData(url);
      store.mergeServerData(freshData);

      showToast('Sincronização concluída com sucesso!', 'success');
    } catch (err) {
      showToast(`Erro na Sincronização: ${err.message}`, 'error');
    } finally {
      // Restore UI state
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17.64"></path>
        </svg>
        Sincronizar
      `;
    }
  });

  // --- MANUAL LOCAL BACKUP (JSON EXPORT/IMPORT) ---
  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
    try {
      const backupStr = store.exportBackup();
      const dateStr = formatLocalDate(new Date());
      
      const blob = new Blob([backupStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ifinc_pro_backup_${dateStr}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      showToast('Backup exportado com sucesso!');
    } catch (err) {
      showToast(`Erro ao exportar backup: ${err.message}`, 'error');
    }
  });

  document.getElementById('btn-trigger-import')?.addEventListener('click', () => {
    document.getElementById('input-import-file')?.click();
  });

  document.getElementById('input-import-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target.result;
        if (store.importBackup(json)) {
          showToast('Backup importado com sucesso!');
        }
      } catch (err) {
        showToast(`Falha na importação: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  });
});
