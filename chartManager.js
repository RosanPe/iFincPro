/**
 * chartManager.js
 * Instantiates, updates, and cleans up Chart.js canvas instances.
 * Implements premium cyber-minimalist designs, tooltips, and click drill-downs.
 */

// Colors used in our cyber-minimalist dark mode palette
const COLORS = {
  obsidian: '#050816',
  panel: '#0b1229',
  jade: '#10b981',
  cyanAcc: '#22d3ee',
  slateBorder: '#1f2a4b',
  textMain: '#f8fafc', // slate-50
  textSub: '#94a3b8',  // slate-400
  accentPink: '#f43f5e',
  accentViolet: '#8b5cf6',
  accentAmber: '#f59e0b',
  accentIndigo: '#6366f1',
  chartColors: [
    '#22d3ee', // Cyber Cyan
    '#10b981', // Jade Green
    '#8b5cf6', // Violet
    '#f43f5e', // Pink
    '#f59e0b', // Amber
    '#6366f1', // Indigo
    '#ec4899', // Rose
    '#14b8a6', // Teal
    '#3b82f6'  // Blue
  ]
};

// Global registry of active chart instances to prevent memory leaks or overlaps
const activeCharts = {
  cashflow: null,
  category: null,
  liability: null,
  accumulation: null
};

// Shared Chart.js options for cyber-minimalist dark theme
const getDarkThemeDefaults = () => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: COLORS.textMain,
        font: {
          family: "'Outfit', 'Inter', sans-serif",
          size: 11
        }
      }
    },
    tooltip: {
      backgroundColor: COLORS.panel,
      titleColor: COLORS.textMain,
      bodyColor: COLORS.textSub,
      borderColor: COLORS.slateBorder,
      borderWidth: 1,
      padding: 10,
      titleFont: { family: "'Outfit', sans-serif", weight: 'bold' },
      bodyFont: { family: "'Inter', sans-serif" },
      cornerRadius: 6
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(31, 42, 75, 0.2)', // slateBorder with opacity
        borderColor: COLORS.slateBorder
      },
      ticks: {
        color: COLORS.textSub,
        font: { family: "'Inter', sans-serif", size: 10 }
      }
    },
    y: {
      grid: {
        color: 'rgba(31, 42, 75, 0.2)',
        borderColor: COLORS.slateBorder
      },
      ticks: {
        color: COLORS.textSub,
        font: { family: "'Inter', sans-serif", size: 10 }
      }
    }
  }
});

/**
 * Destroys a chart if it already exists in the registry.
 * @param {string} chartKey 
 */
function destroyChart(chartKey) {
  if (activeCharts[chartKey]) {
    activeCharts[chartKey].destroy();
    activeCharts[chartKey] = null;
  }
}

/**
 * 1. Historical Cashflow Matrix (Multi-line chart)
 * Crossing monthly liquid output (Pix/Debit) against deferred liabilities (Credit Card bills).
 */
export function renderCashflowChart(canvasId, dataset, onDrillDown) {
  destroyChart('cashflow');
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = dataset.map(d => d.month);
  const liquidData = dataset.map(d => d.liquid);
  const creditData = dataset.map(d => d.credit);

  const defaults = getDarkThemeDefaults();
  
  activeCharts.cashflow = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Saídas Líquidas (Pix/Débito)',
          data: liquidData,
          borderColor: COLORS.jade,
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: COLORS.jade,
          pointBorderColor: COLORS.obsidian,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Faturas de Cartão (Crédito)',
          data: creditData,
          borderColor: COLORS.accentIndigo,
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: COLORS.accentIndigo,
          pointBorderColor: COLORS.obsidian,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      ...defaults,
      onClick: (event, elements) => {
        if (elements.length > 0 && onDrillDown) {
          const elementIdx = elements[0].index;
          const month = labels[elementIdx];
          const datasetIdx = elements[0].datasetIndex;
          const seriesName = datasetIdx === 0 ? 'PixDebito' : 'Card';
          onDrillDown({ type: 'cashflow', month, seriesName });
        }
      }
    }
  });
}

/**
 * 2. Category Allocation Map (Doughnut Chart)
 * Distribution of expenses by category.
 */
export function renderCategoryChart(canvasId, categoryTotals, onDrillDown) {
  destroyChart('category');
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  if (labels.length === 0) {
    labels.push('Sem Dados');
    data.push(1);
  }

  const defaults = getDarkThemeDefaults();
  
  activeCharts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORS.chartColors.slice(0, labels.length),
        borderColor: COLORS.panel,
        borderWidth: 2,
        hoverOffset: 10
      }]
    },
    options: {
      ...defaults,
      scales: {
        x: { display: false },
        y: { display: false }
      },
      cutout: '65%',
      plugins: {
        ...defaults.plugins,
        legend: {
          position: 'right',
          labels: {
            color: COLORS.textMain,
            font: { family: "'Outfit', sans-serif", size: 11 }
          }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0 && onDrillDown) {
          const idx = elements[0].index;
          const category = labels[idx];
          if (category !== 'Sem Dados') {
            onDrillDown({ type: 'category', category });
          }
        }
      }
    }
  });
}

/**
 * 3. Stacked Liability Distribution (Vertical Stacked Bar Chart)
 * Details the categoric profile of each credit card's monthly statement.
 * 
 * @param {string} canvasId 
 * @param {Object} cardData - Object showing card statement structures for a specific month.
 *                            Format: { cardId: { cardName, total, categories: { [cat]: val } } }
 * @param {Function} onDrillDown 
 */
export function renderLiabilityChart(canvasId, cardData, onDrillDown) {
  destroyChart('liability');

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const cardIds = Object.keys(cardData);
  const cardNames = cardIds.map(id => cardData[id].cardName);

  // Collect all unique categories present in these statements
  const categoriesSet = new Set();
  for (const info of Object.values(cardData)) {
    for (const cat of Object.keys(info.categories)) {
      categoriesSet.add(cat);
    }
  }
  const categories = Array.from(categoriesSet);

  // Build a dataset for each category
  const datasets = categories.map((cat, idx) => {
    return {
      label: cat,
      data: cardIds.map(id => cardData[id].categories[cat] || 0),
      backgroundColor: COLORS.chartColors[idx % COLORS.chartColors.length],
      borderColor: COLORS.panel,
      borderWidth: 1
    };
  });

  const defaults = getDarkThemeDefaults();

  activeCharts.liability = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cardNames.length > 0 ? cardNames : ['Nenhum Cartão'],
      datasets: datasets.length > 0 ? datasets : [{ label: 'Nenhum', data: [0] }]
    },
    options: {
      ...defaults,
      scales: {
        x: {
          stacked: true,
          ...defaults.scales.x
        },
        y: {
          stacked: true,
          ...defaults.scales.y
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0 && onDrillDown && cardIds.length > 0) {
          const element = elements[0];
          const cardIdx = element.index;
          const datasetIdx = element.datasetIndex;

          const cardId = cardIds[cardIdx];
          const cardName = cardNames[cardIdx];
          const category = datasets[datasetIdx].label;

          onDrillDown({ type: 'card', cardId, cardName });
        }
      }
    }
  });
}

/**
 * 4. Capital Accumulation Index (Dual scale cumulative bar/line chart)
 * Tracks historical average price velocity and total accumulated value by asset ticker.
 * 
 * @param {string} canvasId 
 * @param {Array} assetSummaries - Outputs from financialEngine.compileInvestments
 * @param {Function} onDrillDown 
 */
export function renderAccumulationChart(canvasId, assetSummaries, onDrillDown) {
  destroyChart('accumulation');

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = assetSummaries.map(a => a.asset);
  const totalCostData = assetSummaries.map(a => a.totalCost); // Total invested capital
  const averagePriceData = assetSummaries.map(a => a.averagePrice); // Weighted price

  const defaults = getDarkThemeDefaults();

  activeCharts.accumulation = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Sem Ativos'],
      datasets: [
        {
          label: 'Total Investido (R$)',
          data: totalCostData.length > 0 ? totalCostData : [0],
          backgroundColor: 'rgba(34, 211, 238, 0.4)', // CyanAcc with opacity
          borderColor: COLORS.cyanAcc,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Preço Médio (R$)',
          data: averagePriceData.length > 0 ? averagePriceData : [0],
          type: 'line',
          borderColor: COLORS.accentAmber,
          backgroundColor: COLORS.accentAmber,
          borderWidth: 2.5,
          tension: 0.1,
          pointBackgroundColor: COLORS.accentAmber,
          pointBorderColor: COLORS.obsidian,
          pointRadius: 4,
          fill: false,
          yAxisID: 'yPrice'
        }
      ]
    },
    options: {
      ...defaults,
      scales: {
        x: defaults.scales.x,
        y: {
          ...defaults.scales.y,
          position: 'left',
          title: {
            display: true,
            text: 'Total Investido (R$)',
            color: COLORS.textSub,
            font: { family: "'Outfit', sans-serif", size: 10 }
          }
        },
        yPrice: {
          ...defaults.scales.y,
          position: 'right',
          grid: {
            drawOnChartArea: false // Don't overlay grid lines for secondary axis
          },
          title: {
            display: true,
            text: 'Preço Médio (R$)',
            color: COLORS.textSub,
            font: { family: "'Outfit', sans-serif", size: 10 }
          }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0 && onDrillDown && labels.length > 0) {
          const idx = elements[0].index;
          const asset = labels[idx];
          if (asset !== 'Sem Ativos') {
            onDrillDown({ type: 'asset', asset });
          }
        }
      }
    }
  });
}
