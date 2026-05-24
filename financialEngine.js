/**
 * financialEngine.js
 * Synthesizes raw expenses and investments into analytical projection models and summary datasets.
 */

/**
 * Calculates the reference invoice month string (YYYY-MM) for a credit card purchase.
 * Brazil style: Purchases AFTER dueDay cascade to the next month's invoice.
 * Purchases ON or BEFORE dueDay fall into the current month's invoice.
 * 
 * @param {Date} purchaseDate - The purchase date object.
 * @param {number} dueDay - Credit card invoice due day (1-31).
 * @returns {string} YYYY-MM
 */
export function invoiceRefForPurchase(purchaseDate, dueDay) {
  const year = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth(); // 0-indexed
  const day = purchaseDate.getDate();

  let refYear = year;
  let refMonth = month;

  // Brazil logic: if the purchase day is greater than the card's dueDay,
  // it rolls over to the next month's statement.
  if (day > dueDay) {
    refMonth += 1;
    if (refMonth > 11) {
      refMonth = 0;
      refYear += 1;
    }
  }

  const monthStr = String(refMonth + 1).padStart(2, '0');
  return `${refYear}-${monthStr}`;
}

/**
 * Shifts a reference month string (YYYY-MM) by offsetMonths.
 * 
 * @param {string} refMonthStr - YYYY-MM
 * @param {number} offsetMonths - Number of months to shift.
 * @returns {string} YYYY-MM
 */
export function shiftMonthStr(refMonthStr, offsetMonths) {
  const [yStr, mStr] = refMonthStr.split('-');
  let year = parseInt(yStr, 10);
  let month = parseInt(mStr, 10) - 1; // 0-indexed

  month += offsetMonths;
  
  // Handle positive/negative overflows
  const totalMonths = year * 12 + month;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = totalMonths % 12;

  return `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
}

/**
 * Compiles a continuous monthly timeline from the earliest transaction date up to current month + maxOffset.
 * 
 * @param {Array} expenses - Array of parsed Expense objects.
 * @param {number} maxOffset - Number of projection months.
 * @returns {Array<string>} Array of YYYY-MM keys.
 */
export function getProjectionTimeline(expenses, maxOffset = 24) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  let startYear = currentYear;
  let startMonth = currentMonth;

  // Find the earliest date in expenses
  for (const exp of expenses) {
    const d = exp.date;
    if (d && !isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y < startYear || (y === startYear && m < startMonth)) {
        startYear = y;
        startMonth = m;
      }
    }
  }

  const timeline = [];
  let tempYear = startYear;
  let tempMonth = startMonth;

  // Upper boundary of projection: current month + maxOffset
  const totalTargetMonths = currentYear * 12 + currentMonth + maxOffset;
  const endYear = Math.floor(totalTargetMonths / 12);
  const endMonth = totalTargetMonths % 12;

  while (tempYear < endYear || (tempYear === endYear && tempMonth <= endMonth)) {
    timeline.push(`${tempYear}-${String(tempMonth + 1).padStart(2, '0')}`);
    tempMonth += 1;
    if (tempMonth > 11) {
      tempMonth = 0;
      tempYear += 1;
    }
  }

  return timeline;
}

/**
 * Compiles mathematical summaries and future projections.
 * 
 * @param {Array} expenses - Parsed Expense objects.
 * @param {Array} cards - Parsed CreditCard objects.
 * @param {number} maxOffset - Projections timeline size.
 * @returns {Object} Compiled financial datasets.
 */
export function compileProjections(expenses, cards, maxOffset = 24) {
  const timeline = getProjectionTimeline(expenses, maxOffset);
  const cardMap = new Map(cards.map(c => [c.id, c]));

  // Initialize structures for every month in timeline
  const monthlyMetrics = {};
  for (const mStr of timeline) {
    monthlyMetrics[mStr] = {
      month: mStr,
      liquidOutflow: 0,        // Pix/Debit outflows
      deferredLiabilities: 0,  // Credit Card statement totals
      totalOutflow: 0,
      categories: {},          // Category totals in this month
      cards: {},               // Card statement totals and category details in this month
      itemized: []             // Detail rows for drill down
    };
  }

  // Iterate over expenses and distribute them
  for (const exp of expenses) {
    const rawVal = exp.value;
    const cat = exp.category || 'Outros';

    if (exp.method === 'PixDebito') {
      // Liquid outflows occur in the month of the purchase date
      const mStr = formatMonthKey(exp.date);
      
      // If it falls outside our tracking timeline (due to custom bounds), skip or add dynamically
      if (!monthlyMetrics[mStr]) {
        // Fallback for safety: do not crash if outside
        continue;
      }

      monthlyMetrics[mStr].liquidOutflow += rawVal;
      monthlyMetrics[mStr].categories[cat] = (monthlyMetrics[mStr].categories[cat] || 0) + rawVal;
      monthlyMetrics[mStr].itemized.push({
        id: exp.id,
        date: exp.date,
        description: exp.description,
        value: rawVal,
        category: cat,
        method: 'Pix/Débito',
        cardName: '-',
        installmentInfo: '1/1',
        isLoan: exp.isLoan
      });

    } else if (exp.method === 'Card') {
      // Credit card purchases. Look up card due day
      const card = cardMap.get(exp.cardId);
      const dueDay = card ? card.dueDay : 10; // default to 10th
      const cardName = card ? card.name : 'Cartão Desconhecido';

      const baseMonthStr = invoiceRefForPurchase(exp.date, dueDay);
      const installments = exp.installments || 1;
      const installmentValue = rawVal / installments;

      // Distribute value across future statements
      for (let i = 0; i < installments; i++) {
        const targetMonthStr = shiftMonthStr(baseMonthStr, i);
        
        if (!monthlyMetrics[targetMonthStr]) {
          // If the installment falls past our maxOffset, ignore or skip gracefully
          continue;
        }

        const metrics = monthlyMetrics[targetMonthStr];
        metrics.deferredLiabilities += installmentValue;
        metrics.categories[cat] = (metrics.categories[cat] || 0) + installmentValue;

        // Group by card
        if (!metrics.cards[exp.cardId]) {
          metrics.cards[exp.cardId] = {
            cardId: exp.cardId,
            cardName: cardName,
            total: 0,
            categories: {}
          };
        }
        metrics.cards[exp.cardId].total += installmentValue;
        metrics.cards[exp.cardId].categories[cat] = (metrics.cards[exp.cardId].categories[cat] || 0) + installmentValue;

        metrics.itemized.push({
          id: exp.id,
          date: exp.date,
          description: exp.description,
          value: installmentValue,
          category: cat,
          method: 'Crédito',
          cardName: cardName,
          installmentInfo: `${i + 1}/${installments}`,
          isLoan: exp.isLoan
        });
      }
    }
  }

  // Calculate totals per month
  const cashflowMatrix = [];
  const allTimeCategoryTotals = {};

  for (const mStr of timeline) {
    const m = monthlyMetrics[mStr];
    m.totalOutflow = m.liquidOutflow + m.deferredLiabilities;
    
    cashflowMatrix.push({
      month: mStr,
      liquid: m.liquidOutflow,
      credit: m.deferredLiabilities,
      total: m.totalOutflow
    });

    // Accumulate all-time category totals
    for (const [cat, val] of Object.entries(m.categories)) {
      allTimeCategoryTotals[cat] = (allTimeCategoryTotals[cat] || 0) + val;
    }
  }

  return {
    timeline,
    monthlyMetrics,
    cashflowMatrix,
    allTimeCategoryTotals
  };
}

/**
 * Calculates investment portfolio aggregates like average price velocity and asset value.
 * 
 * @param {Array} investments - Array of parsed Investment objects.
 * @returns {Array} List of asset summaries.
 */
export function compileInvestments(investments) {
  const assetMap = {};

  for (const inv of investments) {
    const ticker = inv.asset;
    if (!assetMap[ticker]) {
      assetMap[ticker] = {
        asset: ticker,
        totalQuantity: 0,
        totalCost: 0,
        averagePrice: 0,
        history: [] // detail entries
      };
    }

    const row = assetMap[ticker];
    
    // Weighted Average Price Calculation:
    // When adding assets, totalQuantity and totalCost increase.
    // If quantity is negative (sell/withdrawal), we reduce quantity but don't change average price.
    // However, the domain model enforces quantity > 0, so we just aggregate purchases here.
    row.totalQuantity += inv.quantity;
    row.totalCost += inv.quantity * inv.averagePrice;
    row.averagePrice = row.totalQuantity > 0 ? (row.totalCost / row.totalQuantity) : 0;
    
    row.history.push({
      id: inv.id,
      date: inv.date,
      quantity: inv.quantity,
      price: inv.averagePrice,
      total: inv.quantity * inv.averagePrice
    });
  }

  // Sort history lists by date descending
  return Object.values(assetMap).map(asset => {
    asset.history.sort((a, b) => b.date.getTime() - a.date.getTime());
    return asset;
  });
}

// Utility to format Date to YYYY-MM
function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
