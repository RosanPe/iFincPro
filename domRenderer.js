/**
 * domRenderer.js
 * Renders state models dynamically into HTML tables, forms, charts, and modal components.
 * Implements Portuguese language interfaces, currency conversion, and reactive layouts.
 */

import { formatLocalDate } from './domainModels.js';
import { compileProjections, compileInvestments } from './financialEngine.js';
import * as chartManager from './chartManager.js';

// Currency & Date formatting utilities
export function formatCurrency(value) {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBR(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '-';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatMonthNameBR(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return monthKey;
  const [year, month] = monthKey.split('-');
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx]} de ${year}`;
}

class DomRenderer {
  constructor() {
    this.selectedDashboardMonth = ''; // Track selected month for doughnut and bar projection
    this.currentEditExpenseId = null;
    this.currentEditInvestmentId = null;
  }

  /**
   * Initializes page states and defaults.
   * @param {Object} store - The central AppStore instance.
   */
  init(store) {
    const today = new Date();
    const currMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    this.selectedDashboardMonth = currMonthKey;
    
    // Wire up initial DOM events or selections
    this.renderAll(store);
  }

  /**
   * Main router for full UI state re-rendering.
   * @param {Object} store 
   */
  renderAll(store) {
    this.renderSyncStatus(store);
    this.updateDropdowns(store);
    this.renderDashboard(store);
    this.renderExpensesTable(store);
    this.renderInvestmentsTable(store);
    this.renderCardsAndCategories(store);
  }

  /**
   * Renders the top status bar (Offline status, transaction counts, and Sync button indicators).
   */
  renderSyncStatus(store) {
    const queueSize = store.getSyncQueue().length;
    const badge = document.getElementById('sync-badge');
    const queueCounter = document.getElementById('sync-queue-count');
    const syncButton = document.getElementById('btn-sync');
    
    if (badge) {
      if (queueSize > 0) {
        badge.textContent = 'Pendências Locais';
        badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
      } else {
        badge.textContent = 'Sincronizado';
        badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-jade/20 text-jade border border-jade/30';
      }
    }

    if (queueCounter) {
      queueCounter.textContent = `${queueSize} pendente${queueSize !== 1 ? 's' : ''}`;
      if (queueSize > 0) {
        queueCounter.classList.remove('text-slate-400');
        queueCounter.classList.add('text-amber-400', 'animate-pulse');
      } else {
        queueCounter.classList.remove('text-amber-400', 'animate-pulse');
        queueCounter.classList.add('text-slate-400');
      }
    }

    if (syncButton) {
      if (queueSize > 0) {
        syncButton.classList.remove('opacity-60', 'cursor-not-allowed');
        syncButton.classList.add('hover:bg-jade/10', 'border-jade', 'text-jade');
      } else {
        syncButton.classList.add('opacity-60', 'cursor-not-allowed');
        syncButton.classList.remove('hover:bg-jade/10', 'border-jade', 'text-jade');
      }
    }
  }

  /**
   * Populates selectors/dropdown elements across Expense creation forms.
   */
  updateDropdowns(store) {
    // Populate Credit Card selectors
    const cardSelectors = ['gasto-cartao', 'filtro-gasto-cartao'];
    const cards = store.getCards();

    for (const selectId of cardSelectors) {
      const select = document.getElementById(selectId);
      if (!select) continue;
      
      // Preserve first option (e.g. "Selecione..." or "Todos")
      const firstOpt = select.options[0];
      select.innerHTML = '';
      if (firstOpt) select.appendChild(firstOpt);

      for (const card of cards) {
        const opt = document.createElement('option');
        opt.value = card.id;
        opt.textContent = `${card.name} (Venc. Dia ${card.dueDay})`;
        select.appendChild(opt);
      }
    }

    // Populate Category selectors
    const catSelectors = ['gasto-categoria', 'filtro-gasto-categoria'];
    const categories = store.getCategories();

    for (const selectId of catSelectors) {
      const select = document.getElementById(selectId);
      if (!select) continue;

      const firstOpt = select.options[0];
      select.innerHTML = '';
      if (firstOpt) select.appendChild(firstOpt);

      for (const cat of categories) {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        select.appendChild(opt);
      }
    }
  }

  /**
   * Compiles data engines and triggers Chart.js configurations.
   */
  renderDashboard(store) {
    const expenses = store.getExpenses();
    const cards = store.getCards();
    const investments = store.getInvestments();

    // Compile metrics via engine
    const projections = compileProjections(expenses, cards);
    const investmentSummaries = compileInvestments(investments);

    // 1. Dynamic Month Selector for Dashboard Filters
    const monthSelector = document.getElementById('dashboard-month-selector');
    if (monthSelector) {
      const prevVal = this.selectedDashboardMonth;
      monthSelector.innerHTML = '';
      
      // If we don't have timeline, seed current month
      const timeline = projections.timeline.length > 0 ? projections.timeline : [this.selectedDashboardMonth];
      
      // Make sure the active month is inside the timeline
      if (!timeline.includes(this.selectedDashboardMonth)) {
        this.selectedDashboardMonth = timeline[0] || prevVal;
      }

      for (const mStr of timeline) {
        const opt = document.createElement('option');
        opt.value = mStr;
        opt.textContent = formatMonthNameBR(mStr);
        if (mStr === this.selectedDashboardMonth) opt.selected = true;
        monthSelector.appendChild(opt);
      }
    }

    // 2. Render Cards Metrics (Total Outflow, Liquid, Credit, Invested)
    const metrics = projections.monthlyMetrics[this.selectedDashboardMonth] || {
      liquidOutflow: 0,
      deferredLiabilities: 0,
      totalOutflow: 0,
      categories: {},
      cards: {},
      itemized: []
    };

    const cardTotalCapital = investmentSummaries.reduce((sum, a) => sum + a.totalCost, 0);

    const txtMonthName = document.getElementById('metrics-month-name');
    if (txtMonthName) txtMonthName.textContent = formatMonthNameBR(this.selectedDashboardMonth);

    const valTotalOutflow = document.getElementById('val-total-outflow');
    if (valTotalOutflow) valTotalOutflow.textContent = formatCurrency(metrics.totalOutflow);

    const valLiquidOutflow = document.getElementById('val-liquid-outflow');
    if (valLiquidOutflow) valLiquidOutflow.textContent = formatCurrency(metrics.liquidOutflow);

    const valCreditOutflow = document.getElementById('val-credit-outflow');
    if (valCreditOutflow) valCreditOutflow.textContent = formatCurrency(metrics.deferredLiabilities);

    const valInvested = document.getElementById('val-invested-portfolio');
    if (valInvested) valInvested.textContent = formatCurrency(cardTotalCapital);

    // 3. Render charts
    // A. Cashflow Matrix
    chartManager.renderCashflowChart('chart-cashflow', projections.cashflowMatrix, (clickInfo) => {
      this.handleChartClick(store, clickInfo);
    });

    // B. Category Map (filtered to selected dashboard month)
    chartManager.renderCategoryChart('chart-category', metrics.categories, (clickInfo) => {
      this.handleChartClick(store, clickInfo);
    });

    // C. Stacked Credit Cards Statement (filtered to selected dashboard month)
    chartManager.renderLiabilityChart('chart-liability', metrics.cards, (clickInfo) => {
      this.handleChartClick(store, clickInfo);
    });

    // D. Capital Accumulation Index
    chartManager.renderAccumulationChart('chart-accumulation', investmentSummaries, (clickInfo) => {
      this.handleChartClick(store, clickInfo);
    });
  }

  /**
   * Renders the Expense Table list with active filters.
   */
  renderExpensesTable(store) {
    const tbody = document.getElementById('table-expenses-body');
    const mobileList = document.getElementById('mobile-expenses-list');
    if (!tbody && !mobileList) return;

    // Get filter inputs
    const query = (document.getElementById('filtro-gasto-busca')?.value || '').toLowerCase();
    const catFilter = document.getElementById('filtro-gasto-categoria')?.value || '';
    const methodFilter = document.getElementById('filtro-gasto-metodo')?.value || '';
    const cardFilter = document.getElementById('filtro-gasto-cartao')?.value || '';

    let expenses = store.getExpenses();
    const cardMap = new Map(store.getCards().map(c => [c.id, c]));

    // Sort by Date descending
    expenses.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Apply filters
    expenses = expenses.filter(exp => {
      const matchesSearch = exp.description.toLowerCase().includes(query) || exp.category.toLowerCase().includes(query);
      const matchesCategory = catFilter === '' || exp.category === catFilter;
      const matchesMethod = methodFilter === '' || exp.method === methodFilter;
      const matchesCard = cardFilter === '' || exp.cardId === cardFilter;

      return matchesSearch && matchesCategory && matchesMethod && matchesCard;
    });

    if (tbody) {
      tbody.innerHTML = '';
      if (expenses.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="px-6 py-12 text-center text-slate-400">
              Nenhuma despesa cadastrada ou encontrada para os filtros aplicados.
            </td>
          </tr>
        `;
      } else {
        for (const exp of expenses) {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slateBorder/30 hover:bg-panel/50 transition-colors duration-150';

          const cardName = exp.cardId ? (cardMap.get(exp.cardId)?.name || 'Cartão Desconhecido') : '-';
          const installmentsStr = exp.method === 'Card' ? `${exp.installments}x` : '1x (À vista)';
          const loanBadge = exp.isLoan 
            ? '<span class="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-cyanAcc/15 text-cyanAcc border border-cyanAcc/20">Empréstimo</span>'
            : '';

          tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-mono">${formatDateBR(exp.date)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-100 font-semibold">
              <div class="flex items-center">
                ${exp.description}
                ${loanBadge}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
              <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slateBorder/50 text-slate-300 border border-slateBorder">
                ${exp.category}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
              ${exp.method === 'Card' ? 'Crédito' : 'Pix/Débito'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-mono">${cardName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-mono">${installmentsStr}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-jade font-semibold font-mono">${formatCurrency(exp.value)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button class="btn-edit-expense text-cyanAcc hover:text-cyanAcc/80 transition-colors mr-3" data-id="${exp.id}">Editar</button>
              <button class="btn-delete-expense text-accentPink hover:text-accentPink/80 transition-colors" data-id="${exp.id}">Excluir</button>
            </td>
          `;
          tbody.appendChild(tr);
        }
      }
    }

    if (mobileList) {
      mobileList.innerHTML = '';
      if (expenses.length === 0) {
        mobileList.innerHTML = `
          <div class="text-center text-slate-400 py-8 text-sm">
            Nenhuma despesa cadastrada ou encontrada para os filtros aplicados.
          </div>
        `;
      } else {
        for (const exp of expenses) {
          const cardName = exp.cardId ? (cardMap.get(exp.cardId)?.name || 'Cartão Desconhecido') : '';
          const installmentsStr = exp.method === 'Card' ? `${exp.installments}x` : '';
          const methodIcon = exp.method === 'Card' 
            ? '<i class="fa-solid fa-credit-card text-accentIndigo mr-1.5"></i>' 
            : '<i class="fa-solid fa-wallet text-jade mr-1.5"></i>';
          const methodLabel = exp.method === 'Card' ? 'Crédito' : 'Pix/Débito';
          
          const detailsParts = [];
          if (exp.method === 'Card') {
            detailsParts.push(`${installmentsStr} no ${cardName}`);
          } else {
            detailsParts.push(methodLabel);
          }
          
          const loanBadge = exp.isLoan 
            ? '<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-cyanAcc/15 text-cyanAcc border border-cyanAcc/20">Empréstimo</span>'
            : '';

          const cardDiv = document.createElement('div');
          cardDiv.className = 'bg-panel border border-slateBorder/50 p-4 rounded-xl shadow-md space-y-3';
          cardDiv.innerHTML = `
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-bold text-slate-100 flex items-center gap-1.5 text-sm sm:text-base">
                  ${exp.description}
                  ${loanBadge}
                </h4>
                <div class="text-xs text-slate-400 mt-1 flex items-center">
                  ${methodIcon} ${detailsParts.join(' • ')}
                </div>
              </div>
              <div class="text-right">
                <span class="text-jade font-bold font-mono text-sm sm:text-base">${formatCurrency(exp.value)}</span>
                <div class="text-[10px] text-slate-500 font-mono mt-0.5">${formatDateBR(exp.date)}</div>
              </div>
            </div>
            
            <div class="flex justify-between items-center pt-2 border-t border-slateBorder/20">
              <span class="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-slateBorder/50 text-slate-300 border border-slateBorder">
                ${exp.category}
              </span>
              <div class="flex gap-4">
                <button class="btn-edit-expense text-xs font-semibold text-cyanAcc hover:text-cyanAcc/80 py-1 px-2.5 -m-1" data-id="${exp.id}">
                  <i class="fa-solid fa-pen-to-square mr-1"></i> Editar
                </button>
                <button class="btn-delete-expense text-xs font-semibold text-accentPink hover:text-accentPink/80 py-1 px-2.5 -m-1" data-id="${exp.id}">
                  <i class="fa-solid fa-trash mr-1"></i> Excluir
                </button>
              </div>
            </div>
          `;
          mobileList.appendChild(cardDiv);
        }
      }
    }
  }

  /**
   * Renders the Investment list with calculations.
   */
  renderInvestmentsTable(store) {
    const tbody = document.getElementById('table-investments-body');
    const mobileList = document.getElementById('mobile-investments-list');
    if (!tbody && !mobileList) return;

    const query = (document.getElementById('filtro-investimento-busca')?.value || '').toLowerCase();

    let summaries = compileInvestments(store.getInvestments());

    // Filter summaries based on search ticker
    if (query) {
      summaries = summaries.filter(s => s.asset.toLowerCase().includes(query));
    }

    if (tbody) {
      tbody.innerHTML = '';
      if (summaries.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="px-6 py-12 text-center text-slate-400">
              Nenhum investimento registrado ou encontrado.
            </td>
          </tr>
        `;
      } else {
        for (const asset of summaries) {
          // Create asset group summary row
          const trSummary = document.createElement('tr');
          trSummary.className = 'bg-panel/30 border-b border-slateBorder/30 font-semibold';

          trSummary.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-cyanAcc font-bold">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-coins text-accentAmber"></i>
                <span>${asset.asset}</span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-mono">${asset.totalQuantity.toLocaleString('pt-BR')}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-mono">${formatCurrency(asset.averagePrice)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-jade font-mono">${formatCurrency(asset.totalCost)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button class="btn-expand-history text-slate-400 hover:text-slate-100 transition-colors text-xs border border-slateBorder rounded px-2 py-1 mr-2" data-asset="${asset.asset}">Detalhes</button>
            </td>
          `;
          tbody.appendChild(trSummary);

          // Detail history row (collapsible container)
          const trHistory = document.createElement('tr');
          trHistory.id = `history-row-${asset.asset}`;
          trHistory.className = 'hidden bg-slateBorder/10 border-b border-slateBorder/30';
          
          const historyRowsHtml = asset.history.map(inv => `
            <tr class="text-xs border-b border-slateBorder/20">
              <td class="pl-12 py-2 text-slate-400 font-mono">${formatDateBR(inv.date)}</td>
              <td class="py-2 text-slate-400 font-mono">${inv.quantity.toLocaleString('pt-BR')}</td>
              <td class="py-2 text-slate-400 font-mono">${formatCurrency(inv.price)}</td>
              <td class="py-2 text-slate-400 font-mono">${formatCurrency(inv.total)}</td>
              <td class="pr-6 py-2 text-right">
                <button class="btn-edit-investment text-cyanAcc hover:underline mr-3" data-id="${inv.id}">Editar</button>
                <button class="btn-delete-investment text-accentPink hover:underline" data-id="${inv.id}">Excluir</button>
              </td>
            </tr>
          `).join('');

          trHistory.innerHTML = `
            <td colspan="5" class="p-0">
              <table class="w-full">
                <thead>
                  <tr class="text-left border-b border-slateBorder text-[10px] text-slate-400 uppercase tracking-wider bg-panel/60">
                    <th class="pl-12 py-2 font-medium">Data da Operação</th>
                    <th class="py-2 font-medium">Quantidade</th>
                    <th class="py-2 font-medium">Preço da Compra</th>
                    <th class="py-2 font-medium">Valor Total</th>
                    <th class="pr-6 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${historyRowsHtml}
                </tbody>
              </table>
            </td>
          `;
          tbody.appendChild(trHistory);
        }
      }
    }

    if (mobileList) {
      mobileList.innerHTML = '';
      if (summaries.length === 0) {
        mobileList.innerHTML = `
          <div class="text-center text-slate-400 py-8 text-sm">
            Nenhum investimento registrado ou encontrado.
          </div>
        `;
      } else {
        for (const asset of summaries) {
          const cardDiv = document.createElement('div');
          cardDiv.className = 'bg-panel border border-slateBorder/50 p-4 rounded-xl shadow-md space-y-3';
          
          const historyHtml = asset.history.map(inv => `
            <div class="bg-obsidian/40 border border-slateBorder/20 rounded-lg p-2.5 flex justify-between items-center text-xs">
              <div class="space-y-1">
                <div class="text-slate-400 font-mono">${formatDateBR(inv.date)}</div>
                <div class="text-slate-300 font-mono">Qtd: ${inv.quantity.toLocaleString('pt-BR')} • PM: ${formatCurrency(inv.price)}</div>
              </div>
              <div class="text-right space-y-1.5">
                <div class="text-jade font-semibold font-mono">${formatCurrency(inv.total)}</div>
                <div class="flex gap-3 justify-end">
                  <button class="btn-edit-investment text-[11px] font-semibold text-cyanAcc hover:underline -m-1 p-1" data-id="${inv.id}">Editar</button>
                  <button class="btn-delete-investment text-[11px] font-semibold text-accentPink hover:underline -m-1 p-1" data-id="${inv.id}">Excluir</button>
                </div>
              </div>
            </div>
          `).join('');

          cardDiv.innerHTML = `
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-bold text-cyanAcc flex items-center gap-1.5 text-sm sm:text-base">
                  <i class="fa-solid fa-coins text-accentAmber text-xs"></i>
                  ${asset.asset}
                </h4>
                <div class="text-xs text-slate-400 mt-1">
                  Qtd Total: <span class="text-slate-200 font-mono font-medium">${asset.totalQuantity.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="text-jade font-bold font-mono text-sm sm:text-base">${formatCurrency(asset.totalCost)}</div>
                <div class="text-[10px] text-slate-400 font-mono mt-0.5">PM Médio: ${formatCurrency(asset.averagePrice)}</div>
              </div>
            </div>
            
            <div class="flex justify-end pt-2 border-t border-slateBorder/20">
              <button class="btn-expand-history text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slateBorder/60 rounded-lg px-3 py-1.5" data-asset="${asset.asset}">Detalhes</button>
            </div>
            
            <div id="mobile-history-row-${asset.asset}" class="hidden space-y-2 pt-3 border-t border-dashed border-slateBorder/20">
              <div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Histórico de Compras</div>
              ${historyHtml}
            </div>
          `;
          mobileList.appendChild(cardDiv);
        }
      }
    }
  }

  /**
   * Renders management components under the Configurations and Cards tab.
   */
  renderCardsAndCategories(store) {
    // 1. Credit Cards List
    const cardsContainer = document.getElementById('list-cards-container');
    if (cardsContainer) {
      const cards = store.getCards();
      cardsContainer.innerHTML = '';
      
      if (cards.length === 0) {
        cardsContainer.innerHTML = '<div class="text-slate-400 text-sm py-4">Nenhum cartão cadastrado.</div>';
      } else {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        
        for (const card of cards) {
          const item = document.createElement('div');
          item.className = 'flex justify-between items-center bg-panel border border-slateBorder p-4 rounded-xl shadow-lg';
          item.innerHTML = `
            <div>
              <h4 class="font-bold text-slate-100">${card.name}</h4>
              <p class="text-xs text-slate-400 font-mono">Vence no dia ${card.dueDay}</p>
            </div>
            <button class="btn-delete-card text-xs text-accentPink border border-accentPink/20 bg-accentPink/15 hover:bg-accentPink/25 px-2.5 py-1.5 rounded-lg transition-colors" data-id="${card.id}">
              Excluir
            </button>
          `;
          grid.appendChild(item);
        }
        cardsContainer.appendChild(grid);
      }
    }

    // 2. Categories list
    const catsContainer = document.getElementById('list-categories-container');
    if (catsContainer) {
      const cats = store.getCategories();
      catsContainer.innerHTML = '';
      
      const flex = document.createElement('div');
      flex.className = 'flex flex-wrap gap-2';

      for (const cat of cats) {
        const item = document.createElement('span');
        item.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-slateBorder/60 border border-slateBorder text-slate-300';
        
        // Don't allow deleting the default 'Outros' category
        const deleteBtn = cat.name.toLowerCase() !== 'outros'
          ? `<button class="btn-delete-category text-accentPink hover:text-red-400 font-bold ml-1 text-sm leading-none" data-name="${cat.name}">&times;</button>`
          : '';

        item.innerHTML = `
          ${cat.name}
          ${deleteBtn}
        `;
        flex.appendChild(item);
      }
      catsContainer.appendChild(flex);
    }
  }

  /**
   * Universal Chart click vector drilldown parser.
   */
  handleChartClick(store, clickInfo) {
    const expenses = store.getExpenses();
    const cards = store.getCards();
    const projections = compileProjections(expenses, cards);

    let title = '';
    let filteredItems = [];

    if (clickInfo.type === 'cashflow') {
      const { month, seriesName } = clickInfo;
      title = `Lançamentos de ${formatMonthNameBR(month)} (${seriesName === 'PixDebito' ? 'Pix/Débito' : 'Crédito'})`;
      
      const metrics = projections.monthlyMetrics[month];
      if (metrics) {
        filteredItems = metrics.itemized.filter(item => {
          if (seriesName === 'PixDebito') {
            return item.method === 'Pix/Débito';
          } else {
            return item.method === 'Crédito';
          }
        });
      }
    } else if (clickInfo.type === 'category') {
      // Get all items in the active dashboard month (total summary)
      const activeMonth = this.selectedDashboardMonth;
      title = `Resumo Geral de Lançamentos - Referente a ${formatMonthNameBR(activeMonth)}`;
      
      const metrics = projections.monthlyMetrics[activeMonth];
      if (metrics) {
        filteredItems = metrics.itemized;
      }
    } else if (clickInfo.type === 'card') {
      const { cardId, cardName } = clickInfo;
      const activeMonth = this.selectedDashboardMonth;
      title = `Fatura ${cardName} - Referente a ${formatMonthNameBR(activeMonth)}`;

      const metrics = projections.monthlyMetrics[activeMonth];
      if (metrics) {
        // Filter all expenses for this card in this month (regardless of category)
        filteredItems = metrics.itemized.filter(item => item.cardName === cardName);
      }
    } else if (clickInfo.type === 'asset') {
      const { asset } = clickInfo;
      title = `Histórico de Operações - ${asset}`;
      const investments = store.getInvestments().filter(i => i.asset === asset);
      
      filteredItems = investments.map(inv => ({
        date: inv.date,
        asset: inv.asset,
        quantity: inv.quantity,
        price: inv.averagePrice,
        total: inv.quantity * inv.averagePrice,
        isInvestment: true
      }));
    }

    this.showDrillDownModal(title, filteredItems);
  }

  /**
   * Displays the universal drill-down glassmorphic modal overlay.
   */
  showDrillDownModal(title, items) {
    const modal = document.getElementById('drilldown-modal');
    const modalTitle = document.getElementById('drilldown-modal-title');
    const tbody = document.getElementById('drilldown-modal-body');
    const headersRow = document.getElementById('drilldown-modal-headers');
    const mobileList = document.getElementById('mobile-drilldown-list');
    
    if (!modal || !modalTitle) return;

    modalTitle.textContent = title;

    const isInvestment = items.length > 0 && items[0].isInvestment;

    if (tbody) {
      tbody.innerHTML = '';
      if (headersRow) {
        if (isInvestment) {
          headersRow.innerHTML = `
            <th class="px-6 py-3">Data</th>
            <th class="px-6 py-3">Ativo</th>
            <th class="px-6 py-3">Quantidade</th>
            <th class="px-6 py-3">Preço Unitário</th>
            <th class="px-6 py-3">Valor Total</th>
          `;
        } else {
          headersRow.innerHTML = `
            <th class="px-6 py-3">Data</th>
            <th class="px-6 py-3">Descrição</th>
            <th class="px-6 py-3">Categoria</th>
            <th class="px-6 py-3">Método</th>
            <th class="px-6 py-3">Vínculo (Parcela)</th>
            <th class="px-6 py-3">Valor Lançado</th>
          `;
        }
      }

      if (items.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${isInvestment ? 5 : 6}" class="px-6 py-8 text-center text-slate-400">Nenhum registro encontrado para essa métrica.</td>
          </tr>
        `;
      } else {
        // Sort itemized values by date descending
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        for (const item of items) {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slateBorder/30 hover:bg-slateBorder/10 transition-colors duration-100 text-sm';
          
          if (isInvestment) {
            tr.innerHTML = `
              <td class="px-6 py-4 whitespace-nowrap text-slate-300 font-mono">${formatDateBR(item.date)}</td>
              <td class="px-6 py-4 text-slate-100 font-bold">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-coins text-accentAmber text-xs"></i>
                  <span>${item.asset}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-slate-300 font-mono">${item.quantity.toLocaleString('pt-BR')}</td>
              <td class="px-6 py-4 text-slate-300 font-mono">${formatCurrency(item.price)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-jade font-mono font-semibold">${formatCurrency(item.total)}</td>
            `;
          } else {
            tr.innerHTML = `
              <td class="px-6 py-4 whitespace-nowrap text-slate-300 font-mono">${formatDateBR(item.date)}</td>
              <td class="px-6 py-4 text-slate-100 font-semibold">${item.description}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-slateBorder/40 text-slate-300 border border-slateBorder">${item.category}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-slate-300">${item.method}</td>
              <td class="px-6 py-4 whitespace-nowrap text-slate-300 font-mono">${item.cardName || '-'} (${item.installmentInfo || '1/1'})</td>
              <td class="px-6 py-4 whitespace-nowrap text-jade font-mono font-semibold">${formatCurrency(item.value)}</td>
            `;
          }
          tbody.appendChild(tr);
        }
      }
    }

    if (mobileList) {
      mobileList.innerHTML = '';
      if (items.length === 0) {
        mobileList.innerHTML = `
          <div class="text-center text-slate-400 py-8 text-sm">
            Nenhum registro encontrado para essa métrica.
          </div>
        `;
      } else {
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        for (const item of items) {
          const cardDiv = document.createElement('div');
          cardDiv.className = 'bg-obsidian/60 border border-slateBorder/30 p-4 rounded-xl space-y-3 text-xs';
          
          if (isInvestment) {
            cardDiv.innerHTML = `
              <div class="flex justify-between items-center">
                <span class="font-bold text-cyanAcc flex items-center gap-1.5">
                  <i class="fa-solid fa-coins text-accentAmber text-[10px]"></i>
                  ${item.asset}
                </span>
                <span class="text-slate-400 font-mono">${formatDateBR(item.date)}</span>
              </div>
              <div class="flex justify-between items-center text-slate-300 font-mono pt-1.5 border-t border-slateBorder/10">
                <span>Qtd: ${item.quantity.toLocaleString('pt-BR')} • PM: ${formatCurrency(item.price)}</span>
                <span class="text-jade font-bold font-mono text-sm">${formatCurrency(item.total)}</span>
              </div>
            `;
          } else {
            const methodIcon = item.method === 'Crédito' 
              ? '<i class="fa-solid fa-credit-card text-accentIndigo mr-1"></i>' 
              : '<i class="fa-solid fa-wallet text-jade mr-1"></i>';
            cardDiv.innerHTML = `
              <div class="flex justify-between items-start">
                <div>
                  <h4 class="font-bold text-slate-200">${item.description}</h4>
                  <span class="text-[10px] text-slate-400 mt-1 flex items-center">
                    ${methodIcon} ${item.cardName ? `${item.cardName} (${item.installmentInfo || '1/1'})` : item.method}
                  </span>
                </div>
                <div class="text-right">
                  <span class="text-jade font-bold font-mono text-sm">${formatCurrency(item.value)}</span>
                  <div class="text-[10px] text-slate-500 font-mono mt-0.5">${formatDateBR(item.date)}</div>
                </div>
              </div>
              <div class="pt-1.5 border-t border-slateBorder/10">
                <span class="px-2 py-0.5 text-[9px] font-semibold rounded-full bg-slateBorder/50 text-slate-300 border border-slateBorder">
                  ${item.category}
                </span>
              </div>
            `;
          }
          mobileList.appendChild(cardDiv);
        }
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  /**
   * Helper to toggle CSS classes on form fields to represent verification states.
   */
  setFieldWarning(fieldId, hasError) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    if (hasError) {
      field.classList.add('border-accentPink', 'focus:ring-accentPink/30');
      field.classList.remove('border-slateBorder', 'focus:ring-cyanAcc/30');
    } else {
      field.classList.remove('border-accentPink', 'focus:ring-accentPink/30');
      field.classList.add('border-slateBorder', 'focus:ring-cyanAcc/30');
    }
  }

  /**
   * Clear visual errors.
   */
  clearFormWarnings(fieldIds) {
    for (const id of fieldIds) {
      this.setFieldWarning(id, false);
    }
  }
}

export const renderer = new DomRenderer();
