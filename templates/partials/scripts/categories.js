// ========================================================
// VIEW 6: CATEGORY ANALYSIS & INTERNAL BREAKDOWN
// ========================================================
    // ─── Bulk Transaction Selection (Category Detail Table) ──────────────────────

    function updateCatDetailBulkBar() {
      const ids = getCheckedTxIds('cat-detail-transactions-body');
      const bar = document.getElementById('cat-bulk-action-bar');
      const countEl = document.getElementById('cat-bulk-count');
      if (!bar) return;
      if (ids.length > 0) {
        bar.classList.remove('hidden');
        countEl.textContent = `${ids.length} opération(s) sélectionnée(s)`;
        populateBulkCategorySelect('cat-bulk-category-select');
      } else {
        bar.classList.add('hidden');
        const selAll = document.getElementById('cat-select-all');
        if (selAll) selAll.checked = false;
      }
    }

    function toggleSelectAllCatDetail(checked) {
      const tbody = document.getElementById('cat-detail-transactions-body');
      if (!tbody) return;
      tbody.querySelectorAll('input.tx-select-checkbox').forEach(cb => { cb.checked = checked; });
      updateCatDetailBulkBar();
    }

    function clearCatDetailSelection() {
      const tbody = document.getElementById('cat-detail-transactions-body');
      if (tbody) tbody.querySelectorAll('input.tx-select-checkbox').forEach(cb => { cb.checked = false; });
      const selAll = document.getElementById('cat-select-all');
      if (selAll) selAll.checked = false;
      const bar = document.getElementById('cat-bulk-action-bar');
      if (bar) bar.classList.add('hidden');
    }

    async function bulkUpdateCatDetailTransactions() {
      const ids = getCheckedTxIds('cat-detail-transactions-body');
      const category = document.getElementById('cat-bulk-category-select')?.value;
      if (!ids.length || !category) {
        alert('Sélectionnez au moins une opération et une catégorie.');
        return;
      }
      try {
        const res = await fetch('/api/bulk-update-category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, category, workspace: AppState.activeWorkspace || 'default' })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          clearCatDetailSelection();
          loadDashboardData();
        } else {
          alert('Erreur lors de la mise à jour : ' + (json.error || 'Inconnue'));
        }
      } catch (err) {
        console.error(err);
        alert('Erreur réseau lors de la mise à jour groupée.');
      }
    }

    // ─── Interactive Global Spending Distribution by Percentage ─────────────────
    function setCategoryDistributionMode(mode) {
      AppState.categoryDistributionMode = mode;
      if (AppState.data) {
        renderCategoryGlobalDistribution(AppState.data);
      }
    }

    // Dynamic 1-time exceptional purchase detector
    function isOneTimeExceptionalPurchase(tx, allCategoryDebits) {
      const amt = Math.abs(tx.amount || 0);
      const cat = tx.category || '';
      
      // 1. High-Tech & Hardware equipment (buying a phone/laptop is durable capital, not recurring monthly consumption)
      if (cat === 'High-Tech & Équipement' && amt >= 200.0) {
        return true;
      }
      
      // 2. Infrequent large purchases: category has 3 or fewer transactions across the period and ticket >= 250 €
      if (allCategoryDebits.length <= 3 && amt >= 250.0) {
        return true;
      }

      // 3. Statistical outlier: ticket is >= 250 € and >= 2.5x the median ticket of that category
      if (allCategoryDebits.length >= 4 && amt >= 250.0) {
        const sortedAmts = allCategoryDebits.map(t => Math.abs(t.amount || 0)).sort((a, b) => a - b);
        const mid = Math.floor(sortedAmts.length / 2);
        const median = sortedAmts.length % 2 !== 0 ? sortedAmts[mid] : (sortedAmts[mid - 1] + sortedAmts[mid]) / 2;
        if (amt >= 2.5 * median) {
          return true;
        }
      }

      return false;
    }

    function renderCategoryGlobalDistribution(data) {
      const canvas = document.getElementById('categoryGlobalDistributionDonut');
      const barContainer = document.getElementById('cat-global-proportion-bar');
      const listContainer = document.getElementById('category-global-ranked-list');
      const totalAmountEl = document.getElementById('cat-global-total-amount');
      const catCountEl = document.getElementById('cat-global-cat-count');
      const adjustmentsBar = document.getElementById('cat-distrib-adjustments-bar');
      const modeBadge = document.getElementById('cat-distrib-mode-badge');
      const pillRegular = document.getElementById('cat-distrib-pill-regular');
      const pillRaw = document.getElementById('cat-distrib-pill-raw');

      if (!canvas || !barContainer || !listContainer) return;

      const mode = AppState.categoryDistributionMode || 'regular';
      const isRegular = mode === 'regular';

      // Update toggle buttons styling
      if (pillRegular && pillRaw) {
        if (isRegular) {
          pillRegular.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-[#2D5A3C] shadow-xs transition';
          pillRaw.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-century-muted hover:text-century-charcoal transition';
        } else {
          pillRaw.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-[#2D5A3C] shadow-xs transition';
          pillRegular.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-century-muted hover:text-century-charcoal transition';
        }
      }
      if (modeBadge) {
        modeBadge.textContent = isRegular ? 'Mode Régulier (Lissé)' : 'Mode Brut (Tout)';
        modeBadge.className = isRegular 
          ? 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8F0EC] text-[#2D5A3C] border border-[#2D5A3C]/20'
          : 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF8EE] text-[#9A6B22] border border-[#F6E1B5]';
      }

      // Destroy previous Chart.js instance if it exists
      if (AppState.categoryDistributionChart) {
        AppState.categoryDistributionChart.destroy();
        AppState.categoryDistributionChart = null;
      }

      const transactions = data.transactions || [];
      const colorsMap = data.category_colors || {};
      const iconsMap = data.category_icons || {};
      const profile = data.workspace?.profile || {};
      const rentKeywords = (profile.rent_keywords || ['LOYER', 'RENT']).map(k => k.toUpperCase());

      // Derive active number of months to calculate realistic average monthly spending
      const isSingleMonth = AppState.selectedMonth && AppState.selectedMonth !== 'ALL';
      let numMonths = 1;
      if (!isSingleMonth) {
        const trendMonths = (data.trends && data.trends.months) ? data.trends.months : [];
        if (trendMonths.length > 0) {
          numMonths = trendMonths.length;
        } else {
          const distinctMonths = new Set((transactions || []).map(t => (t.date || '').substring(3, 10)).filter(Boolean));
          numMonths = Math.max(1, distinctMonths.size);
        }
      }

      // First pass: group all transactions into debits and credits per category
      const rawCatMap = {};
      transactions.forEach(t => {
        const cat = t.category || 'Autre';
        if (!rawCatMap[cat]) {
          rawCatMap[cat] = { debits: [], credits: [] };
        }
        if (t.type === 'Debit' || (t.amount && t.amount < 0)) {
          rawCatMap[cat].debits.push(t);
        } else {
          rawCatMap[cat].credits.push(t);
        }
      });

      // Track adjustments made for transparent user feedback
      const adjustments = [];
      let totalExcluded1TimeAmt = 0;
      let totalExcluded1TimeCount = 0;
      let rentCompensatedAmt = 0;
      let investmentsExcludedAmt = 0;

      // Second pass: compute net and regular spending per category
      const categoriesMap = {};
      let totalDebitSpend = 0;

      Object.entries(rawCatMap).forEach(([cat, group]) => {
        // In regular mode, skip pure savings/inflow categories
        if (isRegular && ['Salaires & Revenus', 'Cadeaux & Dons', 'Remboursements & Avoirs'].includes(cat)) {
          return;
        }
        if (isRegular && cat === 'Investissements & Épargne') {
          const invDebits = group.debits.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
          investmentsExcludedAmt += invDebits;
          return;
        }

        let eligibleDebits = group.debits;
        let eligibleCredits = group.credits;

        // If regular mode: dynamically detect 1-time exceptional purchases
        let excludedForThisCat = [];
        if (isRegular) {
          eligibleDebits = [];
          group.debits.forEach(t => {
            if (isOneTimeExceptionalPurchase(t, group.debits)) {
              excludedForThisCat.push(t);
              totalExcluded1TimeAmt += Math.abs(t.amount || 0);
              totalExcluded1TimeCount += 1;
            } else {
              eligibleDebits.push(t);
            }
          });
        }

        const debitSum = eligibleDebits.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
        let creditSum = eligibleCredits.reduce((s, t) => s + Math.abs(t.amount || 0), 0);

        // For Logement & Énergie: also check any rent reimbursement credits matching rent keywords
        if (cat === 'Logement & Énergie') {
          transactions.forEach(t => {
            if (t.type === 'Credit' && t.category !== 'Logement & Énergie') {
              const desc = (t.description || '').toUpperCase();
              const merch = (t.merchant || '').toUpperCase();
              if (rentKeywords.some(k => desc.includes(k) || merch.includes(k))) {
                creditSum += Math.abs(t.amount || 0);
              }
            }
          });
        }

        // Net spend calculation: reimbursements offset debits
        let netSpend = debitSum;
        if (isRegular) {
          netSpend = Math.max(0.0, debitSum - creditSum);
        }

        if (cat === 'Logement & Énergie' && creditSum >= debitSum && debitSum > 0) {
          rentCompensatedAmt = debitSum;
        }

        if (netSpend > 0 || (!isRegular && (debitSum > 0 || creditSum > 0))) {
          categoriesMap[cat] = {
            name: cat,
            amount: netSpend,
            count: eligibleDebits.length,
            color: colorsMap[cat] || '#8C8D89',
            icon: iconsMap[cat] || '📦',
            excludedCount: excludedForThisCat.length,
            excludedAmount: excludedForThisCat.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
          };
          totalDebitSpend += netSpend;
        }
      });

      // Build adjustments chips for transparency
      if (adjustmentsBar) {
        adjustmentsBar.innerHTML = '';
        if (isRegular) {
          if (rentCompensatedAmt > 0) {
            adjustments.push({
              icon: '✅',
              text: `Loyer 100% compensé par virements reçus (0 € net)`,
              bg: 'bg-[#E8F0EC] text-[#2D5A3C] border-[#2D5A3C]/20'
            });
          }
          if (totalExcluded1TimeCount > 0) {
            adjustments.push({
              icon: '⚡',
              text: `${totalExcluded1TimeCount} achat(s) unique(s) lissé(s) (${formatFR(totalExcluded1TimeAmt)})`,
              bg: 'bg-[#FDF8EE] text-[#9A6B22] border-[#F6E1B5]'
            });
          }
          if (investmentsExcludedAmt > 0) {
            adjustments.push({
              icon: '📈',
              text: `Épargne & investissements exclus (${formatFR(investmentsExcludedAmt)})`,
              bg: 'bg-[#EEF4FF] text-[#2C4A6F] border-[#2C4A6F]/20'
            });
          }
          adjustments.forEach(adj => {
            const chip = document.createElement('span');
            chip.className = `inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${adj.bg}`;
            chip.innerHTML = `<span>${adj.icon}</span><span>${adj.text}</span>`;
            adjustmentsBar.appendChild(chip);
          });
        }
      }

      // Convert to array and sort descending by amount
      const categoriesList = Object.values(categoriesMap)
        .filter(c => c.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      const totalMonthlyAvg = totalDebitSpend / numMonths;

      // Compute monthly average & percentage for each
      categoriesList.forEach(c => {
        c.monthlyAvg = c.amount / numMonths;
        c.monthlyOps = c.count / numMonths;
        c.pct = totalDebitSpend > 0 ? (c.amount / totalDebitSpend) * 100 : 0;
        c.pctFormatted = c.pct.toFixed(1);
      });

      // Update total badge and category count
      if (totalAmountEl) {
        totalAmountEl.textContent = isSingleMonth ? formatFR(totalDebitSpend) : `${formatFR(totalMonthlyAvg)} / mois`;
      }
      const totalLabelEl = document.getElementById('cat-global-total-label');
      if (totalLabelEl) {
        totalLabelEl.textContent = isSingleMonth ? 'Dépense du Mois' : `Moyenne Mensuelle (${numMonths} mois)`;
      }
      if (catCountEl) catCountEl.textContent = `${categoriesList.length} catégories actives`;

      // Center donut feedback elements
      const centerIcon = document.getElementById('cat-donut-center-icon');
      const centerTitle = document.getElementById('cat-donut-center-title');
      const centerPct = document.getElementById('cat-donut-center-pct');
      const centerAmt = document.getElementById('cat-donut-center-amt');

      function resetCenterInfo() {
        if (centerIcon) centerIcon.textContent = '📊';
        if (centerTitle) centerTitle.textContent = isSingleMonth ? 'Dépense du Mois' : 'Moyenne / mois';
        if (centerPct) centerPct.textContent = '100%';
        if (centerAmt) centerAmt.textContent = isSingleMonth ? formatFR(totalDebitSpend) : `${formatFR(totalMonthlyAvg)} / mois`;
      }
      resetCenterInfo();

      // Render Proportion Bar (multi-segment horizontal bar)
      barContainer.innerHTML = '';
      if (categoriesList.length === 0) {
        barContainer.innerHTML = '<div class="w-full h-full bg-[#EAEAE5]"></div>';
      } else {
        categoriesList.forEach(c => {
          const seg = document.createElement('div');
          seg.className = 'h-full transition-all duration-200 cursor-pointer hover:opacity-80 hover:brightness-110 relative group';
          seg.style.width = `${Math.max(0.5, c.pct)}%`;
          seg.style.backgroundColor = c.color;
          seg.title = `${c.icon} ${c.name} : ${c.pctFormatted}% (${formatFR(c.monthlyAvg)}${isSingleMonth ? '' : ' / mois'})`;
          seg.onclick = () => openCategoryDetail(c.name);
          barContainer.appendChild(seg);
        });
      }

      // Render Ranked Category List
      listContainer.innerHTML = '';
      if (categoriesList.length === 0) {
        listContainer.innerHTML = '<div class="p-4 text-center text-xs text-century-muted">Aucune opération pour cette période.</div>';
      } else {
        categoriesList.forEach((c, idx) => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between p-2.5 rounded-xl hover:bg-[#FAF9F6] border border-transparent hover:border-[#EAEAE5] cursor-pointer transition group';
          row.onclick = () => openCategoryDetail(c.name);

          row.onmouseenter = () => {
            if (centerIcon) centerIcon.textContent = c.icon;
            if (centerTitle) centerTitle.textContent = c.name;
            if (centerPct) centerPct.textContent = `${c.pctFormatted}%`;
            if (centerAmt) centerAmt.textContent = isSingleMonth ? formatFR(c.amount) : `${formatFR(c.monthlyAvg)} / mois`;

            if (AppState.categoryDistributionChart) {
              AppState.categoryDistributionChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
              AppState.categoryDistributionChart.update();
            }
          };
          row.onmouseleave = () => {
            resetCenterInfo();
            if (AppState.categoryDistributionChart) {
              AppState.categoryDistributionChart.setActiveElements([]);
              AppState.categoryDistributionChart.update();
            }
          };

          const excludedBadge = c.excludedCount > 0 
            ? `<span class="text-[10px] text-[#9A6B22] bg-[#FDF8EE] px-1.5 py-0.5 rounded border border-[#F6E1B5] ml-1.5" title="${c.excludedCount} achat(s) unique(s) de ${formatFR(c.excludedAmount)} exclu(s)">⚡ ${c.excludedCount} achat unique</span>`
            : '';

          row.innerHTML = `
            <div class="flex items-center space-x-3 min-w-0 flex-1 mr-4">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background-color: ${c.color}20; color: ${c.color}">
                <span class="text-sm">${c.icon}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between text-xs mb-1">
                  <div class="flex items-center truncate">
                    <span class="font-semibold text-century-charcoal truncate group-hover:text-[#2D5A3C] transition">${c.name}</span>
                    ${excludedBadge}
                  </div>
                  <span class="font-mono font-bold text-xs text-century-charcoal ml-2">${c.pctFormatted}%</span>
                </div>
                <div class="w-full h-1.5 rounded-full bg-[#EAEAE5] overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300" style="width: ${c.pct}%; background-color: ${c.color};"></div>
                </div>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="font-mono font-bold text-xs text-century-charcoal block">${formatFR(c.monthlyAvg)}${isSingleMonth ? '' : ' / mois'}</span>
              <span class="text-[10px] text-century-muted">${isSingleMonth ? `${c.count} op.` : `${c.monthlyOps >= 5 ? Math.round(c.monthlyOps) : c.monthlyOps.toFixed(1)} op./mois`}</span>
            </div>
          `;
          listContainer.appendChild(row);
        });
      }

      // Render Chart.js Donut
      if (categoriesList.length === 0) return;

      const labels = categoriesList.map(c => c.name);
      const dataValues = categoriesList.map(c => Math.round(c.monthlyAvg * 100) / 100);
      const bgColors = categoriesList.map(c => c.color);

      const ctx = canvas.getContext('2d');
      AppState.categoryDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataValues,
            backgroundColor: bgColors,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            hoverBorderColor: '#FFFFFF',
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              callbacks: {
                label: function(ctx) {
                  const val = ctx.raw || 0;
                  const pct = totalMonthlyAvg > 0 ? ((val / totalMonthlyAvg) * 100).toFixed(1) : 0;
                  return ` ${formatFR(val)}${isSingleMonth ? '' : ' / mois'} (${pct}%)`;
                }
              }
            }
          },
          onHover: (event, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              const c = categoriesList[idx];
              if (c) {
                if (centerIcon) centerIcon.textContent = c.icon;
                if (centerTitle) centerTitle.textContent = c.name;
                if (centerPct) centerPct.textContent = `${c.pctFormatted}%`;
                if (centerAmt) centerAmt.textContent = isSingleMonth ? formatFR(c.amount) : `${formatFR(c.monthlyAvg)} / mois`;
              }
            } else {
              resetCenterInfo();
            }
          },
          onClick: (event, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              const c = categoriesList[idx];
              if (c) {
                openCategoryDetail(c.name);
              }
            }
          }
        }
      });
    }


    // Render View 6: Category Analysis (Dedicated graph for each category with anomaly detection & drill-down)
    function renderCategories(data) {

      const trends = data.trends || {};
      const catTrends = trends.category_trends || [];
      const insights = data.insights || {};

      // If already viewing a category detail, refresh it
      if (AppState.activeCategoryDetail) {
        openCategoryDetail(AppState.activeCategoryDetail);
        return;
      }

      // Render Very First Row: Interactive Spending Distribution Graphic
      renderCategoryGlobalDistribution(data);

      // Potential savings / optimization banner
      const invAnalysis = trends.investment_analysis || {};
      const invDiag = invAnalysis.diagnosis;
      const optTagEl = document.getElementById('optimization-tag');
      const optTitleEl = document.getElementById('optimization-title');
      const optLabelEl = document.getElementById('optimization-label');
      const optAmtEl = document.getElementById('optimization-potential-amount');
      const optTextEl = document.getElementById('optimization-text');

      if (invDiag && invDiag.status === 'under_investing') {
        const idle = Math.max(0, (invAnalysis.monthly_cash_margin || 0) - (invAnalysis.avg_monthly_invested || 0));
        if (optTagEl) optTagEl.textContent = "Constitution Patrimoniale";
        if (optTitleEl) optTitleEl.textContent = "Capacité d'Investissement & Trésorerie Dormante";
        if (optLabelEl) optLabelEl.textContent = "Capacité disponible";
        if (optAmtEl) optAmtEl.textContent = `+${formatFR(idle)}/mois`;
        if (optTextEl) optTextEl.textContent = `Capacité d'investissement sous-exploitée : Vous dégagez un excédent moyen de ${formatFR(invAnalysis.monthly_cash_margin)}/mois après dépenses courantes, mais n'en placez que ${formatFR(invAnalysis.avg_monthly_invested)}/mois. Placer automatiquement environ ${formatFR(idle)}/mois vers un Livret A ou PEA optimiserait votre patrimoine dormant.`;
      } else {
        const potAmt = data.summary?.potential_savings_monthly || (insights.potential_savings ? Math.round(insights.potential_savings / (trends.months?.length || 1)) : 60);
        if (optTagEl) optTagEl.textContent = "Optimisation Budgétaire";
        if (optTitleEl) optTitleEl.textContent = "Repas commandés, Restaurants & Abonnements superflus";
        if (optLabelEl) optLabelEl.textContent = "Économies potentielles";
        if (optAmtEl) optAmtEl.textContent = `+${formatFR(potAmt)}/mois`;
        const currentAvgSavings = data.summary?.monthly_avg_savings || 1600;
        let optText = `En réduisant de 35% les repas commandés (Uber Eats / livraisons) et sorties festives, vous pourriez dégager environ ${formatFR(potAmt)} d'épargne supplémentaire chaque mois (en complément de vos ${formatFR(currentAvgSavings)}/mois d'épargne moyenne actuelle).`;
        if (optTextEl) optTextEl.textContent = optText;
      }

      const grid = document.getElementById('categories-cards-grid');
      if (!grid) return;
      grid.innerHTML = '';

      // Destroy previously rendered category mini-charts
      if (AppState.categoryCharts && AppState.categoryCharts.length > 0) {
        AppState.categoryCharts.forEach(c => c.destroy());
        AppState.categoryCharts = [];
      }

      if (catTrends.length === 0) {
        grid.innerHTML = '<div class="c-card p-6 text-century-muted text-xs col-span-full text-center">Aucune dépense catégorisée pour le moment.</div>';
        return;
      }

      catTrends.forEach((ct, idx) => {
        const hasMajorSpike = ct.out_of_ordinary && ct.unusual_months && ct.unusual_months.length > 0;
        const card = document.createElement('div');
        card.className = `c-card c-card-interactive p-5 space-y-3 flex flex-col justify-between cursor-pointer group ${hasMajorSpike ? 'border-[#F6E1B5] shadow-xs' : ''}`;
        card.onclick = () => openCategoryDetail(ct.category);
        
        const canvasId = `catChart-${idx}`;
        const unusualSet = new Set((ct.unusual_months || []).map(u => u.index));

        // High-value, contextual badge HTML
        let badgeHtml = '';
        if (ct.rent_neutral) {
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E8F0EC] text-[#2D5A3C] border border-[#2D5A3C]/20">✅ 100% compensé</span>`;
        } else if (hasMajorSpike) {
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FDF8EE] text-[#9A6B22] border border-[#F6E1B5]">⚠️ Pic en ${ct.unusual_months[0].month_label.split(' ')[0]}</span>`;
        } else if (ct.category === 'Investissements & Épargne') {
          const invRate = trends.investment_analysis?.overall_savings_rate || 20;
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEF4FF] text-[#2C4A6F] border border-[#2C4A6F]/20">${invRate}% des revenus</span>`;
        } else if (ct.budget_share_pct > 0) {
          const isLarge = ct.budget_share_pct >= 20;
          const badgeClass = isLarge ? 'bg-[#FAF3EA] text-[#9A6B22] border-[#F6E1B5]' : 'bg-[#F0F2ED] text-[#4A5550] border-[#EAEAE5]';
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium ${badgeClass} border">${ct.budget_share_pct}% du budget</span>`;
        }

        // Status or insightful description message
        let statusMessageHtml = '';
        if (ct.rent_neutral) {
          statusMessageHtml = `
            <div class="mt-2 text-[11px] text-[#2D5A3C] font-medium">
              ✅ Loyer 100% compensé par les virements reçus (reste 0,00 € net).
            </div>
          `;
        } else if (ct.category === 'Investissements & Épargne') {
          const isLumpy = trends.investment_analysis?.has_lumpy_investments;
          const invRate = trends.investment_analysis?.overall_savings_rate || 20;
          statusMessageHtml = `
            <div class="mt-2 text-[11px] text-[#555E58] leading-relaxed">
              ${isLumpy ? 'Versements ponctuels compensés par des apports plus forts (s\'équilibrent sur la durée)' : 'Flux régulier d\'accumulation patrimoniale'} (${invRate}% des revenus).
            </div>
          `;
        } else if (hasMajorSpike) {
          statusMessageHtml = `
            <div class="mt-2 p-2.5 rounded-xl bg-[#FDF8EE] border border-[#F6E1B5] text-[#9A6B22] text-[11px] leading-relaxed">
              <strong>Dépense ponctuelle :</strong> ${ct.unusual_months.map(u => u.message).join(' ')}
            </div>
          `;
        } else {
          const share = ct.budget_share_pct || 0;
          let contextDesc = 'Dépense maîtrisée et stable sur l\'ensemble de la période.';
          if (share >= 25) {
            contextDesc = `Poste principal : représente ${share}% de vos dépenses de vie (${formatFR(ct.avg_monthly)}/mois).`;
          } else if (share >= 10) {
            contextDesc = `Représente ${share}% de votre budget de vie (${formatFR(ct.avg_monthly)}/mois en moyenne).`;
          } else if (share > 0) {
            contextDesc = `Poste secondaire modéré (${share}% du budget, ${formatFR(ct.avg_monthly)}/mois).`;
          }
          statusMessageHtml = `
            <div class="mt-2 text-[11px] text-century-muted leading-relaxed">
              ${contextDesc}
            </div>
          `;
        }

        card.innerHTML = `
          <div>
            <!-- Header -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <span class="text-lg">${ct.icon || '📦'}</span>
                <span class="font-sans font-bold text-sm text-century-charcoal group-hover:text-[#2D5A3C] transition">${ct.category}</span>
              </div>
              ${badgeHtml}
            </div>

            <!-- Amounts: Total & Average -->
            <div class="flex items-baseline justify-between mt-2 pt-1 border-t border-[#EAEAE5]">
              <div>
                <span class="text-xl font-bold font-sans text-century-charcoal">${formatFR(ct.total_spent)}</span>
                <span class="text-[11px] text-century-muted block">Total période</span>
              </div>
              <div class="text-right">
                <span class="text-xs font-semibold text-[#555E58]">${formatFR(ct.avg_monthly)} / mois</span>
                <span class="text-[10px] text-century-muted block">Moyenne mensuelle</span>
              </div>
            </div>

            <!-- Dedicated Chart for this category -->
            <div class="relative w-full h-[120px] mt-3 pointer-events-none">
              <canvas id="${canvasId}"></canvas>
            </div>
          </div>

          <!-- Bottom Notice & Click prompt -->
          <div>
            ${statusMessageHtml}
            <div class="mt-3 pt-2 border-t border-[#EAEAE5] flex items-center justify-between text-xs text-[#2D5A3C] font-semibold">
              <span>Voir le détail & opérations</span>
              <span class="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>
        `;

        grid.appendChild(card);

        // Instantiate Chart.js for this category
        setTimeout(() => {
          const cCanvas = document.getElementById(canvasId);
          if (!cCanvas) return;

          const shortLabels = (ct.months || []).map(m => m.split(' ')[0]);
          const pointColors = (ct.history || []).map((_, i) => (hasMajorSpike && unusualSet.has(i)) ? '#9A6B22' : (ct.color || '#2D5A3C'));
          const pointRadii = (ct.history || []).map((_, i) => (hasMajorSpike && unusualSet.has(i)) ? 5 : 2.5);

          const cChart = new Chart(cCanvas, {
            type: 'line',
            data: {
              labels: shortLabels,
              datasets: [{
                label: ct.category,
                data: ct.history || [],
                borderColor: ct.color || '#2D5A3C',
                backgroundColor: `${ct.color || '#2D5A3C'}18`,
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 1.5,
                pointRadius: pointRadii,
                pointHoverRadius: 7,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => ` ${formatFR(ctx.raw)}`
                  }
                }
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { color: '#889088', font: { family: 'Plus Jakarta Sans', size: 10 } }
                },
                y: {
                  grid: { color: '#EAEAE5', borderDash: [2, 2], drawBorder: false },
                  ticks: {
                    color: '#889088',
                    font: { family: 'Plus Jakarta Sans', size: 10 },
                    callback: (v) => formatFRCompact(v)
                  }
                }
              }
            }
          });

          AppState.categoryCharts.push(cChart);
        }, 30);
      });
    }

    // Category Drill-Down Detailed View Logic
    function openCategoryDetail(catName) {
      if (!AppState.data) return;
      AppState.activeCategoryDetail = catName;

      const mainView = document.getElementById('categories-main-view');
      const detailView = document.getElementById('category-detail-view');
      if (mainView) mainView.classList.add('hidden');
      if (detailView) detailView.classList.remove('hidden');

      const catTrends = (AppState.data.trends && AppState.data.trends.category_trends) ? AppState.data.trends.category_trends : [];
      const ct = catTrends.find(c => c.category === catName) || {
        category: catName,
        icon: '📦',
        color: '#2D5A3C',
        total_spent: 0,
        avg_monthly: 0,
        budget_share_pct: 0,
        pct_of_budget: 0,
        months: [],
        history: []
      };

      const iconEl = document.getElementById('cat-detail-icon');
      const titleEl = document.getElementById('cat-detail-title');
      if (iconEl) iconEl.textContent = ct.icon || '📦';
      if (titleEl) titleEl.textContent = ct.category;

      const anomalyBadge = document.getElementById('cat-detail-anomaly-badge');
      if (anomalyBadge) {
        if (ct.out_of_ordinary && ct.unusual_months && ct.unusual_months.length > 0) {
          anomalyBadge.classList.remove('hidden');
          anomalyBadge.textContent = `⚠️ Pic ponctuel en ${ct.unusual_months[0].month_label || ''}`;
        } else {
          anomalyBadge.classList.add('hidden');
        }
      }

      // Filter transactions for this category (including offsetting credits for investments & reimbursements)
      const profile = AppState.data?.workspace?.profile || {};
      const accountHolders = profile.account_holder_keywords || [];
      const rentKeywords = profile.rent_keywords || ['LOYER', 'RENT'];
      const txs = (AppState.data.transactions || []).filter(t => {
        if (t.category === catName) return true;
        if (catName === 'Investissements & Épargne') {
          const desc = (t.description || '').toUpperCase();
          const merch = (t.merchant || '').toUpperCase();
          return desc.includes('LIVRET') || merch.includes('LIVRET') || desc.includes('BROKER') || merch.includes('BROKER') || (accountHolders.some(k => desc.includes(k.toUpperCase())) && desc.includes('VIR RECU'));
        }
        if (catName === 'Logement & Énergie') {
          const desc = (t.description || '').toUpperCase();
          const merch = (t.merchant || '').toUpperCase();
          return rentKeywords.some(k => merch.includes(k.toUpperCase()) || desc.includes(k.toUpperCase()));
        }
        return false;
      });

      // Compute KPIs live from transactions (always fresh after any edit)
      let totalSpent = 0;
      txs.forEach(t => {
        if (t.type === 'Debit') totalSpent += Math.abs(t.amount || 0);
        else totalSpent -= Math.abs(t.amount || 0); // net credits out
      });
      totalSpent = Math.max(0, totalSpent);

      // Derive avg monthly from the number of distinct months in the data
      const allMonths = new Set((AppState.data.transactions || []).map(t => (t.date || '').substring(3, 10)));
      const numMonths = Math.max(1, allMonths.size);
      const avgMonthly = totalSpent / numMonths;

      // Budget share: total debit spend across all categories
      const totalDebitAll = (AppState.data.transactions || [])
        .filter(t => t.type === 'Debit')
        .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
      const budgetSharePct = totalDebitAll > 0 ? ((totalSpent / totalDebitAll) * 100).toFixed(1) : '0.0';

      const kpiTotal = document.getElementById('cat-detail-kpi-total');
      const kpiAvg = document.getElementById('cat-detail-kpi-avg');
      const kpiShare = document.getElementById('cat-detail-kpi-share');
      const kpiCount = document.getElementById('cat-detail-kpi-count');
      if (kpiTotal) kpiTotal.textContent = formatFR(totalSpent);
      if (kpiAvg) kpiAvg.textContent = `${formatFR(avgMonthly)} / mois`;
      if (kpiShare) {
        if (ct.category === 'Investissements & Épargne') {
          const invRate = AppState.data?.trends?.investment_analysis?.overall_savings_rate || 20;
          kpiShare.textContent = `${invRate}% (Revenus)`;
        } else {
          kpiShare.textContent = `${budgetSharePct}%`;
        }
      }
      if (kpiCount) kpiCount.textContent = txs.length;


      const chartMeta = document.getElementById('cat-detail-chart-meta');
      if (chartMeta) {
        chartMeta.textContent = (ct.months && ct.months.length > 0) 
          ? `${ct.months[0]} — ${ct.months[ct.months.length - 1]}`
          : 'Toutes les périodes';
      }

      // Reset search input & merchant filter
      const searchInput = document.getElementById('cat-detail-tx-search');
      if (searchInput) searchInput.value = '';
      AppState.activeCategoryMerchantFilter = null;
      const mBadge = document.getElementById('cat-active-merchant-badge');
      if (mBadge) {
        mBadge.classList.add('hidden');
        mBadge.classList.remove('inline-flex');
      }
      const resetBtn = document.getElementById('cat-pie-reset-filter');
      if (resetBtn) resetBtn.classList.add('hidden');

      renderCategoryBreakdownPieChart(txs, ct.category);
      renderCategoryDetailTransactions(txs);
      renderCategoryZoomChart(ct);
    }

    function closeCategoryDetail() {
      AppState.activeCategoryDetail = null;
      AppState.activeCategoryMerchantFilter = null;
      if (AppState.categoryBreakdownPieChart) {
        AppState.categoryBreakdownPieChart.destroy();
        AppState.categoryBreakdownPieChart = null;
      }
      if (AppState.categoryZoomChart) {
        AppState.categoryZoomChart.destroy();
        AppState.categoryZoomChart = null;
      }
      const detailView = document.getElementById('category-detail-view');
      const mainView = document.getElementById('categories-main-view');
      if (detailView) detailView.classList.add('hidden');
      if (mainView) mainView.classList.remove('hidden');
    }

    function renderCategoryZoomChart(ct) {
      const ctx = document.getElementById('categoryZoomChart');
      if (!ctx) return;
      if (AppState.categoryZoomChart) {
        AppState.categoryZoomChart.destroy();
      }

      const labels = ct.months || [];
      const history = ct.history || [];
      const avg = ct.avg_monthly || 0;
      const unusualIndices = new Set((ct.unusual_months || []).map(u => u.index));

      const barBgColors = history.map((_, i) => unusualIndices.has(i) ? '#9E4756' : (ct.color || '#2D5A3C'));
      const avgLineData = labels.map(() => avg);

      AppState.categoryZoomChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              type: 'line',
              label: `Moyenne (${formatFR(avg)})`,
              data: avgLineData,
              borderColor: '#6C7570',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              fill: false,
              order: 1
            },
            {
              type: 'bar',
              label: ct.category,
              data: history,
              backgroundColor: barBgColors,
              borderRadius: 6,
              maxBarThickness: 45,
              order: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: {
                boxWidth: 12,
                font: { family: 'Plus Jakarta Sans', size: 11 },
                color: '#6C7570'
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  if (ctx.dataset.type === 'line') return ` Moyenne mensuelle : ${formatFR(val)}`;
                  const diff = val - avg;
                  const diffStr = diff > 0 ? ` (+${formatFR(diff)} vs moy.)` : ` (${formatFR(diff)} vs moy.)`;
                  return ` Dépense : ${formatFR(val)}${diffStr}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#6C7570', font: { family: 'Plus Jakarta Sans', size: 11 } }
            },
            y: {
              grid: { color: '#EAEAE5', borderDash: [3, 3], drawBorder: false },
              ticks: {
                color: '#6C7570',
                font: { family: 'Plus Jakarta Sans', size: 11 },
                callback: (v) => formatFRCompact(v)
              }
            }
          }
        }
      });
    }

    // Category Drill-Down: Internal Expense Breakdown Pie/Donut Chart
    function renderCategoryBreakdownPieChart(txs, catName) {
      const ctx = document.getElementById('categoryBreakdownPieChart');
      const legendList = document.getElementById('category-pie-legend-list');
      const totalBadge = document.getElementById('cat-pie-total-badge');
      if (!ctx) return;

      if (AppState.categoryBreakdownPieChart) {
        AppState.categoryBreakdownPieChart.destroy();
        AppState.categoryBreakdownPieChart = null;
      }

      const isIncome = (catName === 'Salaires & Revenus' || catName === 'Remboursements & Avoirs');

      // Cluster transactions by merchant / payer
      const merchantMap = {};
      txs.forEach(t => {
        const isCredit = (t.type === 'Credit' || (t.amount || 0) > 0);
        if (isIncome && !isCredit) return;
        if (!isIncome && isCredit && catName !== 'Investissements & Épargne') return;

        const merch = (t.merchant || t.description || 'Autre').trim();
        const absAmt = Math.abs(t.amount || 0);
        if (!merchantMap[merch]) {
          merchantMap[merch] = { merchant: merch, total: 0, count: 0 };
        }
        merchantMap[merch].total += absAmt;
        merchantMap[merch].count += 1;
      });

      const sorted = Object.values(merchantMap).sort((a, b) => b.total - a.total);
      const grandTotal = sorted.reduce((sum, item) => sum + item.total, 0);

      if (totalBadge) {
        totalBadge.textContent = formatFR(grandTotal);
      }

      if (sorted.length === 0) {
        if (legendList) {
          legendList.innerHTML = '<div class="text-xs text-century-muted italic py-6 text-center">Aucune opération trouvée pour cette période.</div>';
        }
        return;
      }

      // Group top 5 + "Autres"
      let displayItems = [];
      if (sorted.length <= 6) {
        displayItems = sorted;
      } else {
        displayItems = sorted.slice(0, 5);
        const others = sorted.slice(5);
        const othersTotal = others.reduce((s, x) => s + x.total, 0);
        const othersCount = others.reduce((s, x) => s + x.count, 0);
        displayItems.push({
          merchant: `Autres (${others.length} commerçants)`,
          total: othersTotal,
          count: othersCount,
          isOtherGroup: true,
          originalMerchants: others.map(o => o.merchant)
        });
      }

      const PALETTE = ['#2D5A3C', '#C08435', '#2C4A6F', '#9E4756', '#366B80', '#5B7B7A', '#8C8D89'];
      const sliceColors = displayItems.map((item, idx) => item.isOtherGroup ? '#8C8D89' : (PALETTE[idx % PALETTE.length]));

      AppState.currentCategoryBreakdownItems = displayItems;
      AppState.currentCategoryBreakdownTotal = grandTotal;
      AppState.currentCategoryBreakdownColors = sliceColors;

      renderCategoryPieLegend(displayItems, grandTotal, sliceColors);

      AppState.categoryBreakdownPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: displayItems.map(d => d.merchant),
          datasets: [{
            data: displayItems.map(d => d.total),
            backgroundColor: sliceColors,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            hoverOffset: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const val = c.raw || 0;
                  const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : 0;
                  return ` ${c.label} : ${formatFR(val)} (${pct}%)`;
                }
              }
            }
          },
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              const clickedItem = displayItems[idx];
              if (clickedItem) {
                toggleCategoryMerchantFilter(clickedItem);
              }
            }
          }
        }
      });
    }

    function renderCategoryPieLegend(displayItems, grandTotal, sliceColors) {
      const legendList = document.getElementById('category-pie-legend-list');
      if (!legendList) return;
      legendList.innerHTML = '';

      displayItems.forEach((item, idx) => {
        const color = sliceColors[idx % sliceColors.length];
        const pct = grandTotal > 0 ? ((item.total / grandTotal) * 100).toFixed(1) : '0';
        const isSelected = AppState.activeCategoryMerchantFilter && (
          (item.isOtherGroup && AppState.activeCategoryMerchantFilter.isOtherGroup) ||
          (!item.isOtherGroup && AppState.activeCategoryMerchantFilter.name === item.merchant)
        );

        const div = document.createElement('div');
        div.className = `flex items-center justify-between text-xs px-2 py-1.5 rounded cursor-pointer transition select-none ${
          isSelected 
            ? 'bg-[#E8F0EC] border border-[#CDE0D4] text-[#2D5A3C] font-semibold shadow-2xs' 
            : 'hover:bg-[#FAF9F5] border border-transparent text-century-charcoal'
        }`;
        div.title = `Cliquer pour filtrer sur ${item.merchant}`;
        div.onclick = () => toggleCategoryMerchantFilter(item);

        div.innerHTML = `
          <div class="flex items-center space-x-2 min-w-0 pr-2">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color};"></span>
            <span class="truncate text-[11px]">${item.merchant}</span>
          </div>
          <div class="flex items-center space-x-2 shrink-0 font-mono text-[11px]">
            <span class="text-century-muted">${pct}%</span>
            <span class="font-bold font-sans">${formatFR(item.total)}</span>
          </div>
        `;
        legendList.appendChild(div);
      });
    }

    function toggleCategoryMerchantFilter(item) {
      if (AppState.activeCategoryMerchantFilter && (
        (item.isOtherGroup && AppState.activeCategoryMerchantFilter.isOtherGroup) ||
        (!item.isOtherGroup && AppState.activeCategoryMerchantFilter.name === item.merchant)
      )) {
        clearCategoryMerchantFilter();
      } else {
        filterCategoryByMerchant(item);
      }
    }

    function filterCategoryByMerchant(item) {
      AppState.activeCategoryMerchantFilter = {
        name: item.merchant,
        isOtherGroup: !!item.isOtherGroup,
        originalMerchants: item.originalMerchants || null
      };

      const badge = document.getElementById('cat-active-merchant-badge');
      const nameEl = document.getElementById('cat-active-merchant-name');
      const resetBtn = document.getElementById('cat-pie-reset-filter');

      if (badge) {
        badge.classList.remove('hidden');
        badge.classList.add('inline-flex');
      }
      if (nameEl) nameEl.textContent = item.merchant;
      if (resetBtn) resetBtn.classList.remove('hidden');

      if (AppState.currentCategoryBreakdownItems) {
        renderCategoryPieLegend(
          AppState.currentCategoryBreakdownItems,
          AppState.currentCategoryBreakdownTotal,
          AppState.currentCategoryBreakdownColors
        );
      }

      filterCategoryDetailTransactions();
    }

    function clearCategoryMerchantFilter() {
      AppState.activeCategoryMerchantFilter = null;
      const badge = document.getElementById('cat-active-merchant-badge');
      const resetBtn = document.getElementById('cat-pie-reset-filter');

      if (badge) {
        badge.classList.add('hidden');
        badge.classList.remove('inline-flex');
      }
      if (resetBtn) resetBtn.classList.add('hidden');

      if (AppState.currentCategoryBreakdownItems) {
        renderCategoryPieLegend(
          AppState.currentCategoryBreakdownItems,
          AppState.currentCategoryBreakdownTotal,
          AppState.currentCategoryBreakdownColors
        );
      }

      filterCategoryDetailTransactions();
    }

    function renderCategoryDetailTransactions(txs) {
      const tbody = document.getElementById('cat-detail-transactions-body');
      const countLabel = document.getElementById('cat-detail-tx-count-label');
      if (!tbody) return;
      tbody.innerHTML = '';

      // Reset selection state when rows are re-rendered
      clearCatDetailSelection();
      
      if (countLabel) countLabel.textContent = `${txs.length} opération(s) enregistrée(s)`;

      if (txs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-century-muted">Aucune opération trouvée pour cette catégorie.</td></tr>`;
        return;
      }

      txs.forEach(t => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-[#FAF9F5] transition';
        const cleanMerchant = t.merchant || t.description || 'Opération';
        const isCredit = t.type === 'Credit' || t.amount > 0;
        const amtClass = isCredit ? 'text-[#2D5A3C] font-semibold' : 'text-[#6E2D38] font-bold';
        const formattedAmt = isCredit ? `+${formatFR(Math.abs(t.amount))}` : formatFR(t.amount);
        row.innerHTML = `
          <td class="py-3 pl-4 pr-2">
            <input type="checkbox" class="tx-select-checkbox rounded border-[#D2D4CA] text-[#2D5A3C] focus:ring-[#2D5A3C] cursor-pointer" data-id="${t.id}" onchange="updateCatDetailBulkBar()">
          </td>
          <td class="py-3 px-4 text-century-muted whitespace-nowrap font-mono text-[11px]">${t.date}</td>
          <td class="py-3 px-4">
            <div class="font-semibold text-century-charcoal text-xs flex items-center space-x-1.5">
              <span>${cleanMerchant}</span>
              ${isCredit ? '<span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#E8F0EC] text-[#2D5A3C] border border-[#2D5A3C]/20 uppercase tracking-wider">Crédit / Avoir</span>' : ''}
            </div>
            <div class="text-[11px] text-century-muted truncate max-w-md">${t.description}</div>
          </td>
          <td class="py-3 px-4 text-century-muted text-[11px] whitespace-nowrap font-mono">${t.statement_file || ''}</td>
          <td class="py-3 px-4 text-right text-xs whitespace-nowrap ${amtClass}">${formattedAmt}</td>
          <td class="py-3 px-4 text-center">
            <button onclick="openCategoryModal('${t.id}')" title="Changer la catégorie" class="p-1 rounded text-century-muted hover:text-century-charcoal hover:bg-[#EAEAE5] transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }


    function filterCategoryDetailTransactions() {
      if (!AppState.data || !AppState.activeCategoryDetail) return;
      const catName = AppState.activeCategoryDetail;
      const profile = AppState.data?.workspace?.profile || {};
      const accountHolders = profile.account_holder_keywords || [];
      const rentKeywords = profile.rent_keywords || ['LOYER', 'RENT'];
      const q = (document.getElementById('cat-detail-tx-search').value || '').toLowerCase().trim();
      const txs = (AppState.data.transactions || []).filter(t => {
        let matchCat = (t.category === catName);
        if (!matchCat) {
          if (catName === 'Investissements & Épargne') {
            const desc = (t.description || '').toUpperCase();
            const merch = (t.merchant || '').toUpperCase();
            matchCat = desc.includes('LIVRET') || merch.includes('LIVRET') || desc.includes('BROKER') || merch.includes('BROKER') || (accountHolders.some(k => desc.includes(k.toUpperCase())) && desc.includes('VIR RECU'));
          } else if (catName === 'Logement & Énergie') {
            const desc = (t.description || '').toUpperCase();
            const merch = (t.merchant || '').toUpperCase();
            matchCat = rentKeywords.some(k => merch.includes(k.toUpperCase()) || desc.includes(k.toUpperCase()));
          }
        }
        if (!matchCat) return false;

        // Apply merchant filter if active
        if (AppState.activeCategoryMerchantFilter) {
          const mFilter = AppState.activeCategoryMerchantFilter;
          const tMerch = (t.merchant || t.description || 'Autre').trim();
          if (mFilter.isOtherGroup && mFilter.originalMerchants) {
            if (!mFilter.originalMerchants.includes(tMerch)) return false;
          } else {
            if (tMerch !== mFilter.name) return false;
          }
        }

        if (!q) return true;
        return (t.merchant && t.merchant.toLowerCase().includes(q)) ||
               (t.description && t.description.toLowerCase().includes(q)) ||
               (t.amount && t.amount.toString().includes(q)) ||
               (t.date && t.date.includes(q));
      });
      renderCategoryDetailTransactions(txs);
    }

    function exportCurrentCategoryCSV() {
      if (!AppState.data || !AppState.activeCategoryDetail) return;
      const catName = AppState.activeCategoryDetail;
      const profile = AppState.data?.workspace?.profile || {};
      const accountHolders = profile.account_holder_keywords || [];
      const rentKeywords = profile.rent_keywords || ['LOYER', 'RENT'];
      const txs = (AppState.data.transactions || []).filter(t => {
        if (t.category === catName) return true;
        if (catName === 'Investissements & Épargne') {
          const desc = (t.description || '').toUpperCase();
          const merch = (t.merchant || '').toUpperCase();
          return desc.includes('LIVRET') || merch.includes('LIVRET') || desc.includes('BROKER') || merch.includes('BROKER') || (accountHolders.some(k => desc.includes(k.toUpperCase())) && desc.includes('VIR RECU'));
        }
        if (catName === 'Logement & Énergie') {
          const desc = (t.description || '').toUpperCase();
          const merch = (t.merchant || '').toUpperCase();
          return rentKeywords.some(k => merch.includes(k.toUpperCase()) || desc.includes(k.toUpperCase()));
        }
        return false;
      });
      let exportTxs = txs;
      let filenameSuffix = '';
      if (AppState.activeCategoryMerchantFilter) {
        const mFilter = AppState.activeCategoryMerchantFilter;
        exportTxs = txs.filter(t => {
          const tMerch = (t.merchant || t.description || 'Autre').trim();
          if (mFilter.isOtherGroup && mFilter.originalMerchants) {
            return mFilter.originalMerchants.includes(tMerch);
          }
          return tMerch === mFilter.name;
        });
        filenameSuffix = `_${(mFilter.name || 'filtre').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      }

      if (exportTxs.length === 0) {
        alert("Aucune transaction à exporter pour cette sélection.");
        return;
      }
      const headers = ["Date", "Catégorie", "Commerçant", "Description", "Montant", "Relevé"];
      const rows = exportTxs.map(t => [
        t.date || '',
        `"${(t.category || '').replace(/"/g, '""')}"`,
        `"${(t.merchant || '').replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.amount !== undefined ? t.amount : 0,
        `"${(t.statement_file || '').replace(/"/g, '""')}"`
      ]);
      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}${filenameSuffix}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

