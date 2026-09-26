// ========================================================
// VIEW 1: FINANCIAL OVERVIEW & AUDIT MODAL
// ========================================================
    // Render View 1: Financial Overview (Screenshot 2)
    function renderOverview(data) {
      const summary = data.summary || {};
      
      document.getElementById('overview-subtitle').textContent = 
        `${summary.total_count || 0} opérations analysées sur ${data.statements ? data.statements.length : 0} relevés`;

      document.getElementById('overview-range-label').textContent = data.date_range_label || "Toutes les périodes";

      // Populate KPIs: Income strictly Seize Consulting, Expenses strictly living (without investments)
      const useNet = AppState.deductReimbursements;
      const expGross = Math.abs(summary.total_living_debits_gross !== undefined ? summary.total_living_debits_gross : summary.total_living_debits || 0);
      const expNet = Math.abs(summary.total_living_debits_net !== undefined ? summary.total_living_debits_net : expGross);
      const displayedExp = useNet ? expNet : expGross;

      document.getElementById('kpi-total-tx').textContent = summary.total_count || 0;
      document.getElementById('kpi-total-income').textContent = formatFR(summary.total_salary !== undefined ? summary.total_salary : summary.total_credits || 0, true);
      document.getElementById('kpi-total-expenses').textContent = formatFR(displayedExp);

      const expTitle = document.getElementById('kpi-expenses-title');
      if (expTitle) {
        expTitle.textContent = useNet ? "Dépenses nettes (après remb.)" : "Dépenses de vie (hors invest.)";
      }
      const expSub = document.getElementById('kpi-expenses-sub');
      if (expSub) {
        expSub.textContent = useNet ? `Brut : ${formatFR(expGross)}` : `Net remb. : ${formatFR(expNet)}`;
      }

      const netSavingsVal = useNet 
        ? (summary.net_real_with_reimb !== undefined ? summary.net_real_with_reimb : summary.net_real || 0)
        : (summary.net_real !== undefined ? summary.net_real : summary.net || 0);
      document.getElementById('kpi-net-savings').textContent = formatFR(netSavingsVal, true);

      const savingsRateVal = useNet 
        ? (summary.savings_rate_net !== undefined ? summary.savings_rate_net : summary.savings_rate || 0)
        : (summary.savings_rate_gross !== undefined ? summary.savings_rate_gross : summary.savings_rate || 0);
      const rateSub = document.getElementById('kpi-savings-rate-sub');
      if (rateSub) {
        rateSub.textContent = `Taux : ${savingsRateVal}%`;
      }

      // Update dynamic employer & salary labels across dashboard
      const empName = data.workspace?.profile?.salary_employer_name || 'Salaires';
      const kpiIncomeTitle = document.getElementById('kpi-income-title');
      if (kpiIncomeTitle) kpiIncomeTitle.textContent = `Revenus Totaux (${empName})`;

      const chartSub = document.getElementById('chart-spending-subtitle');
      if (chartSub) chartSub.textContent = `Revenus (${empName}) vs Dépenses de vie courante (total dépensé - investissements)`;

      const legendInc = document.getElementById('chart-legend-income-label');
      if (legendInc) legendInc.textContent = `Revenus (${empName})`;

      const simSalaryLabel = document.getElementById('sim-salary-label');
      if (simSalaryLabel) simSalaryLabel.textContent = `Salaire Net Mensuel (${empName})`;

      const tmSub = document.getElementById('tm-spending-subtitle');
      if (tmSub) tmSub.textContent = `Revenus (${empName}) vs Dépenses de vie courante (hors investissements)`;

      const tmLegendInc = document.getElementById('tm-legend-income-label');
      if (tmLegendInc) tmLegendInc.textContent = `Revenus (${empName})`;

      // Sync checkbox in overview and modal
      const toggleEl = document.getElementById('toggle-deduct-reimb');
      if (toggleEl) toggleEl.checked = useNet;
      const modalToggleEl = document.getElementById('modal-audit-toggle-reimb');
      if (modalToggleEl) modalToggleEl.checked = useNet;
      
      // Render dynamic investment KPI buttons and legend
      const investContainer = document.getElementById('invest-kpi-badges-container');
      const investLegend = document.getElementById('investments-chart-legend');
      const invByAcc = summary.investments_by_account || {};
      const invAccounts = (data.workspace && data.workspace.profile && data.workspace.profile.investment_accounts) 
                          || (summary.investment_accounts) 
                          || [ { id: 'livret_a', name: 'Livret A', color: '#2C4A6F', type: 'savings' } ];

      if (investContainer) {
        let btnsHtml = '';
        invAccounts.forEach(acc => {
          const accData = invByAcc[acc.id] || { net: 0 };
          const isBrokerage = (acc.type === 'brokerage') || (acc.id !== 'livret_a');
          const bgCol = isBrokerage ? 'bg-[#F5F3FF] hover:bg-[#ECE8FF] text-[#7C3AED] border-[#7C3AED]/20' : 'bg-[#EEF4FF] hover:bg-[#E0ECFF] text-[#2C4A6F] border-[#2C4A6F]/20';
          btnsHtml += `
            <button onclick="openKpiAuditModal('${acc.id}')" title="Voir les mouvements vers ${acc.name}" class="px-3.5 py-1.5 rounded-xl border ${bgCol} text-xs text-left transition shadow-xs group">
              <span class="block text-[10px] text-century-muted uppercase font-medium">${acc.name}</span>
              <div class="flex items-center space-x-1.5">
                <span id="invest-kpi-${acc.id}" class="font-sans text-sm font-bold">${formatFR(accData.net || 0)}</span>
                <span class="text-[10px] group-hover:translate-x-0.5 transition-transform">🔍</span>
              </div>
            </button>
          `;
        });

        // Add Total Invested button
        btnsHtml += `
          <button onclick="openKpiAuditModal('investments')" title="Vérifier la somme totale investie" class="px-3.5 py-1.5 rounded-xl bg-[#E8F0EC] hover:bg-[#D5E5DB] text-[#2D5A3C] border border-[#2D5A3C]/20 text-xs text-left transition shadow-xs group">
            <span class="block text-[10px] text-century-muted uppercase font-medium">Total Investi (Somme)</span>
            <div class="flex items-center space-x-1.5">
              <span id="invest-kpi-total" class="font-sans text-sm font-bold">${formatFR(summary.total_investments || 0)}</span>
              <span class="text-[10px] text-[#2D5A3C] group-hover:translate-x-0.5 transition-transform">🔍</span>
            </div>
          </button>
        `;
        investContainer.innerHTML = btnsHtml;
      }

      if (investLegend) {
        let legHtml = '';
        invAccounts.forEach(acc => {
          legHtml += `
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${acc.color || '#2C4A6F'}"></span>
              <span class="font-medium">${acc.name}</span>
            </div>
          `;
        });
        investLegend.innerHTML = legHtml;
      }

      // Render Month Filter Pills
      renderMonthFilterPills(data);

      // Render Charts
      renderOverviewChart();
      renderInvestmentsChart();
      renderMajorExpenditures(data);
    }

    function renderMajorExpenditures(data) {
      const container = document.getElementById('major-expenditures-container');
      const countBadge = document.getElementById('major-exp-count-badge');
      const totalBadge = document.getElementById('major-exp-total-badge');
      if (!container) return;

      const majorList = data.major_expenditures || [];
      const totalAmt = (data.summary && data.summary.total_major_expenditures !== undefined)
        ? data.summary.total_major_expenditures
        : majorList.reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);

      if (countBadge) {
        countBadge.textContent = `${majorList.length} dépense${majorList.length > 1 ? 's' : ''}`;
      }
      if (totalBadge) {
        totalBadge.textContent = formatFR(totalAmt);
      }

      container.innerHTML = '';
      if (majorList.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-century-muted bg-[#FAF9F5] rounded-xl border border-[#EAEAE5]">
            Aucune dépense majeure (> 300 €) sur cette période. Vos charges restent dans votre cadre de fonctionnement habituel.
          </div>
        `;
        return;
      }

      majorList.forEach(t => {
        const item = document.createElement('div');
        item.className = 'c-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF9F6] transition';
        const cleanMerchant = t.merchant || t.description || 'Achat exceptionnel';
        const amtFormatted = formatFR(t.amount);

        item.innerHTML = `
          <div class="flex items-center space-x-3.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0" style="background-color: ${t.color || '#0ea5e9'}15; color: ${t.color || '#0ea5e9'};">
              ${t.icon || '💻'}
            </div>
            <div>
              <div class="flex items-center space-x-2 flex-wrap">
                <span class="font-bold text-sm text-century-charcoal">${cleanMerchant}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold" style="background-color: ${t.color || '#0ea5e9'}15; color: ${t.color || '#0ea5e9'};">
                  ${t.category}
                </span>
              </div>
              <div class="text-[11px] text-century-muted mt-0.5 space-x-2">
                <span class="font-mono">${t.date}</span>
                <span>•</span>
                <span class="truncate max-w-xs inline-block align-bottom">${t.description}</span>
                <span>•</span>
                <span class="font-mono">${t.statement_file || ''}</span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="font-sans font-bold text-base text-[#6E2D38] block">${amtFormatted}</span>
            <span class="text-[10px] text-century-muted uppercase font-medium">Dépense isolée</span>
          </div>
        `;
        container.appendChild(item);
      });
    }

    function renderMonthFilterPills(data) {
      const container = document.getElementById('dynamic-month-pills');
      if (!container) return;
      container.innerHTML = '';

      const months = (data.trends && data.trends.months) ? data.trends.months : [];
      months.forEach(m => {
        const btn = document.createElement('button');
        const isActive = AppState.selectedMonth === m;
        btn.className = `px-3.5 py-1.5 rounded-lg border text-xs font-medium transition ${
          isActive 
            ? 'filter-pill-active border-[#CDE0D4]' 
            : 'border-transparent text-[#6C7570] hover:text-century-charcoal'
        }`;
        
        const mData = data.trends.monthly_data.find(d => d.month_key === m);
        btn.textContent = mData ? mData.label : m;
        btn.onclick = () => selectMonthFilter(m);
        container.appendChild(btn);
      });
    }

    function selectMonthFilter(monthKey) {
      AppState.selectedMonth = monthKey;
      try { localStorage.setItem('cf_selected_month', monthKey); } catch (e) {}
      
      const allPill = document.getElementById('filter-pill-all');
      if (allPill) {
        if (monthKey === 'ALL') {
          allPill.classList.add('filter-pill-active');
        } else {
          allPill.classList.remove('filter-pill-active');
        }
      }

      loadDashboardData();
    }

    function selectQuickFilter(type) {
      if (type === 'latest' && AppState.data && AppState.data.trends && AppState.data.trends.months.length) {
        const lastMonth = AppState.data.trends.months[AppState.data.trends.months.length - 1];
        selectMonthFilter(lastMonth);
      }
    }

    // Chart.js: Financial Overview Spline Curve (Income = Seize Consulting, Expenses = All money spent - investments)
    function renderOverviewChart() {
      const ctx = document.getElementById('overviewTrendChart');
      if (!ctx || !AppState.data) return;

      if (AppState.overviewChart) {
        AppState.overviewChart.destroy();
      }

      const trends = AppState.data.trends || {};
      const monthly = trends.monthly_data || [];

      const labels = monthly.map(m => m.label);
      const incomeData = monthly.map(m => m.income);
      const useNet = AppState.deductReimbursements;
      const expLabel = useNet ? 'Dépenses de vie nettes (après remb.)' : 'Dépenses de vie (hors invest.)';
      const legendLabel = document.getElementById('chart-legend-expenses-label');
      if (legendLabel) legendLabel.textContent = expLabel;

      const expensesData = monthly.map(m => {
        if (useNet) {
          return m.expenses_living_net !== undefined ? m.expenses_living_net : (m.expenses_living || m.expenses);
        } else {
          return m.expenses_living !== undefined ? m.expenses_living : m.expenses;
        }
      });

      const chartCtx = ctx.getContext('2d');
      const greenGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
      greenGradient.addColorStop(0, 'rgba(45, 90, 60, 0.28)');
      greenGradient.addColorStop(1, 'rgba(45, 90, 60, 0.02)');

      const burgundyGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
      burgundyGradient.addColorStop(0, 'rgba(110, 45, 56, 0.24)');
      burgundyGradient.addColorStop(1, 'rgba(110, 45, 56, 0.02)');

      AppState.overviewChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: `Revenus (${AppState.data?.workspace?.profile?.salary_employer_name || 'Salaires'})`,
              data: incomeData,
              borderColor: '#2D5A3C',
              backgroundColor: greenGradient,
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: '#2D5A3C',
            },
            {
              label: expLabel,
              data: expensesData,
              borderColor: '#6E2D38',
              backgroundColor: burgundyGradient,
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: '#6E2D38',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: customChartTooltip
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
                callback: (val) => formatFRCompact(val)
              }
            }
          }
        }
      });
    }

    // Chart.js: SEPARATE INVESTMENTS GRAPH (Livret A vs CTO Interactive Brokers)
    function renderInvestmentsChart() {
      const ctx = document.getElementById('investmentsSplineChart');
      if (!ctx || !AppState.data) return;

      if (AppState.investmentsChart) {
        AppState.investmentsChart.destroy();
      }

      const trends = AppState.data.trends || {};
      const monthly = trends.monthly_data || [];

      const labels = monthly.map(m => m.label);
      const invAccounts = (AppState.data.workspace && AppState.data.workspace.profile && AppState.data.workspace.profile.investment_accounts)
                          || (AppState.data.summary && AppState.data.summary.investment_accounts)
                          || [ { id: 'livret_a', name: 'Livret A', color: '#2C4A6F', type: 'savings' } ];

      const chartCtx = ctx.getContext('2d');

      const datasets = invAccounts.map((acc, idx) => {
        const hexColor = acc.color || (idx === 0 ? '#2C4A6F' : '#8B5CF6');
        const grad = chartCtx.createLinearGradient(0, 0, 0, 280);
        let rgb = '44, 74, 111';
        if (hexColor.startsWith('#') && hexColor.length === 7) {
          const r = parseInt(hexColor.slice(1, 3), 16);
          const g = parseInt(hexColor.slice(3, 5), 16);
          const b = parseInt(hexColor.slice(5, 7), 16);
          rgb = `${r}, ${g}, ${b}`;
        }
        grad.addColorStop(0, `rgba(${rgb}, 0.25)`);
        grad.addColorStop(1, `rgba(${rgb}, 0.01)`);

        const accData = monthly.map(m => {
          if (m.investments_by_account && m.investments_by_account[acc.id] !== undefined) {
            return Math.max(0, m.investments_by_account[acc.id].net || m.investments_by_account[acc.id].deposits || 0);
          }
          if (acc.id === 'livret_a') {
            return Math.max(0, m.investments_livret_a_deposits !== undefined ? m.investments_livret_a_deposits : (m.investments_livret_a || 0));
          }
          return Math.max(0, m.investments_cto || 0);
        });

        return {
          label: acc.name,
          data: accData,
          borderColor: hexColor,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          borderWidth: 2.2,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: hexColor,
        };
      });

      AppState.investmentsChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: function(context) {
                let tooltipEl = document.getElementById('chartjs-custom-tooltip');
                const tooltipModel = context.tooltip;
                if (tooltipModel.opacity === 0) {
                  tooltipEl.style.opacity = 0;
                  return;
                }
                if (tooltipModel.body) {
                  const title = tooltipModel.title[0] || '';
                  let innerHtml = `<div class="font-serif-title font-semibold text-sm text-century-charcoal mb-1.5">${title}</div>`;
                  tooltipModel.dataPoints.forEach(dp => {
                    const ds = AppState.investmentsChart.data.datasets[dp.datasetIndex];
                    const label = ds ? ds.label : '';
                    const color = ds ? ds.borderColor : '#2C4A6F';
                    innerHtml += `
                      <div class="flex items-center justify-between space-x-4 text-xs">
                        <span class="text-century-muted">${label} :</span>
                        <div class="text-right">
                          <span class="font-bold font-sans" style="color: ${color}">${formatFR(dp.raw)}</span>
                        </div>
                      </div>
                    `;
                  });
                  tooltipEl.innerHTML = innerHtml;
                }
                const position = context.chart.canvas.getBoundingClientRect();
                tooltipEl.style.opacity = 1;
                tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
                tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY - 10 + 'px';
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
                callback: (val) => formatFRCompact(val)
              }
            }
          }
        }
      });
    }

    // ========================================================
    // KPI AUDIT & EXPLANATION MODAL LOGIC
    // ========================================================
    function toggleDeductReimbursements(checked) {
      AppState.deductReimbursements = checked;
      const toggleEl = document.getElementById('toggle-deduct-reimb');
      if (toggleEl) toggleEl.checked = checked;
      const modalToggleEl = document.getElementById('modal-audit-toggle-reimb');
      if (modalToggleEl) modalToggleEl.checked = checked;

      if (AppState.data) {
        renderOverview(AppState.data);
        if (!document.getElementById('kpi-audit-modal').classList.contains('hidden') && AppState.activeAuditType) {
          openKpiAuditModal(AppState.activeAuditType);
        }
      }
    }

    function closeKpiAuditModal() {
      const modal = document.getElementById('kpi-audit-modal');
      if (modal) modal.classList.add('hidden');
      AppState.activeAuditType = null;
    }

    function openKpiAuditModal(type) {
      if (!AppState.data) return;
      AppState.activeAuditType = type;
      const summary = AppState.data.summary || {};
      const txs = AppState.data.transactions || [];
      const useNet = AppState.deductReimbursements;
      const empName = AppState.data?.workspace?.profile?.salary_employer_name || 'Salaire';
      const totDeb = Math.abs(summary.total_debits || 0);
      const totRentReimb = Math.abs(summary.total_rent_reimbursements || 0);

      const modal = document.getElementById('kpi-audit-modal');
      const titleEl = document.getElementById('audit-modal-title');
      const subEl = document.getElementById('audit-modal-subtitle');
      const iconBadge = document.getElementById('audit-modal-icon-badge');
      const cardsGrid = document.getElementById('audit-modal-formula-cards');
      const noticeBox = document.getElementById('audit-modal-notice');
      const searchInput = document.getElementById('audit-tx-search');
      if (searchInput) searchInput.value = '';

      let modalTxs = [];

      if (type === 'expenses') {
        iconBadge.className = 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#FDF0F2] text-[#6E2D38]';
        iconBadge.textContent = '💳';
        titleEl.textContent = 'Audit & Calcul : Dépenses de vie courante';
        subEl.textContent = 'Débits bancaires − Investissements isolés (Livret A + CTO) − Remboursements';

        const totDebits = Math.abs(summary.total_debits || 0);
        const totInvest = summary.total_investments || 0;
        const grossLiving = Math.abs(summary.total_living_debits_gross !== undefined ? summary.total_living_debits_gross : summary.total_living_debits || 0);
        const reimb = summary.total_reimbursements || 0;
        const netLiving = Math.abs(summary.total_living_debits_net !== undefined ? summary.total_living_debits_net : Math.max(0, grossLiving - reimb));
        const invAccNames = (AppState.data?.workspace?.profile?.investment_accounts || AppState.data?.summary?.investment_accounts || []).map(a => a.name).join(' + ') || 'Épargne & Investissements';

        cardsGrid.innerHTML = `
          <div class="p-3.5 rounded-xl border border-[#EAEAE5] bg-[#FAF9F6]">
            <span class="text-[10px] text-century-muted uppercase font-medium block">1. Débits totaux relevé</span>
            <span class="text-base font-bold font-sans text-century-charcoal block mt-0.5">${formatFR(totDebits)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">${summary.count_debits || 0} opérations débitrices</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#2C4A6F]/20 bg-[#EEF4FF]">
            <span class="text-[10px] text-[#2C4A6F] uppercase font-semibold block">2. − Épargne & Investi</span>
            <span class="text-base font-bold font-sans text-[#2C4A6F] block mt-0.5">− ${formatFR(totInvest)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">${invAccNames}</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#6E2D38]/20 bg-[#FDF0F2]">
            <span class="text-[10px] text-[#6E2D38] uppercase font-semibold block">3. = Dépenses de vie Brutes</span>
            <span class="text-base font-bold font-sans text-[#6E2D38] block mt-0.5">${formatFR(grossLiving)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Total débité hors investissements</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#0d9488]/20 bg-[#F0FDFA]">
            <span class="text-[10px] text-[#0d9488] uppercase font-semibold block">4. − Remboursements / Avoirs</span>
            <span class="text-base font-bold font-sans text-[#0d9488] block mt-0.5">− ${formatFR(reimb)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Loyer famille, CAF, CPAM...</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC] sm:col-span-2">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">5. = Dépenses Nettes à votre charge</span>
                <span class="text-lg font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(netLiving)}</span>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold ${useNet ? 'bg-[#2D5A3C] text-white' : 'bg-white text-century-muted border border-[#EAEAE5]'}">
                ${useNet ? 'Option active sur le dashboard' : 'Activable via la case ci-dessous'}
              </span>
            </div>
            <p class="text-[11px] text-century-charcoal/80 mt-1">Dépenses réellement assumées sur vos revenus (${empName}).</p>
          </div>
        `;

        noticeBox.innerHTML = `
          <div class="flex items-start space-x-2.5">
            <span class="text-base shrink-0">💡</span>
            <div class="space-y-1.5 text-century-charcoal leading-relaxed">
              <p class="font-semibold text-xs text-[#6E2D38]">Formule de calcul appliquée :</p>
              <p class="text-[11px] text-century-muted">
                • <strong>Total des débits :</strong> Votre relevé comptabilise <strong>${formatFR(totDeb)}</strong> de sorties totales.<br>
                • <strong>Épargne isolée :</strong> <strong>${formatFR(totInvest)}</strong> ont été transférés sur vos comptes d'épargne ou investissements.<br>
                • <strong>Dépenses de vie brutes :</strong> ${formatFR(totDeb)} − ${formatFR(totInvest)} = <strong>${formatFR(grossLiving)}</strong>.<br>
                ${totRentReimb > 0 ? `• <strong>Neutralisation loyer :</strong> <strong>${formatFR(totRentReimb)}</strong> de remboursement ou compensation de loyer reçus viennent annuler les dépenses de loyer correspondantes.<br>` : ''}
                • <strong>Résultat net réel :</strong> En activant <em>« Déduire les remboursements »</em>, vos dépenses nettes réelles s'établissent à <strong>${formatFR(netLiving)}</strong>.
              </p>
            </div>
          </div>
        `;

        modalTxs = txs.filter(t => 
          (t.type === 'Debit' && t.category !== 'Investissements & Épargne') || 
          (t.type === 'Credit' && (t.category === 'Remboursements & Avoirs' || (t.merchant || '').includes('Remboursement') || (t.description || '').toUpperCase().includes('RENT') || (t.description || '').toUpperCase().includes('LOYER')))
        );

      } else if (type === 'investments' || (AppState.data?.workspace?.profile?.investment_accounts || AppState.data?.summary?.investment_accounts || []).some(a => a.id === type) || type === 'livret_a' || type === 'cto' || type === 'pea') {
        const invAccounts = (AppState.data?.workspace?.profile?.investment_accounts) 
                            || (AppState.data?.summary?.investment_accounts) 
                            || [ { id: 'livret_a', name: 'Livret A', keywords: ['LIVRET'], type: 'savings' } ];

        if (type === 'investments') {
          iconBadge.className = 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#E8F0EC] text-[#2D5A3C]';
          iconBadge.textContent = '💎';
          titleEl.textContent = 'Audit : Total Investi & Épargne (Somme nette)';
          subEl.textContent = 'Somme des montants nets placés sur l\'ensemble de vos comptes d\'épargne et d\'investissement';

          modalTxs = txs.filter(t => t.category === 'Investissements & Épargne');
          const sumTotalDeposits = modalTxs.filter(t => t.type === 'Debit').reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);
          const sumTotalWithdrawals = modalTxs.filter(t => t.type === 'Credit').reduce((acc, t) => acc + (t.amount || 0), 0);
          const netTotal = sumTotalDeposits - sumTotalWithdrawals;

          cardsGrid.innerHTML = `
            <div class="p-3.5 rounded-xl border border-[#2C4A6F]/20 bg-[#EEF4FF]">
              <span class="text-[10px] text-[#2C4A6F] uppercase font-semibold block">1. Total des versements émis</span>
              <span class="text-base font-bold font-sans text-[#2C4A6F] block mt-0.5">${formatFR(sumTotalDeposits)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">${modalTxs.filter(t => t.type === 'Debit').length} virement(s) d'épargne</span>
            </div>
            <div class="p-3.5 rounded-xl border border-[#7C3AED]/20 bg-[#F5F3FF]">
              <span class="text-[10px] text-[#7C3AED] uppercase font-semibold block">2. − Retraits d'épargne</span>
              <span class="text-base font-bold font-sans text-[#7C3AED] block mt-0.5">− ${formatFR(sumTotalWithdrawals)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">${modalTxs.filter(t => t.type === 'Credit').length} virement(s) reçus</span>
            </div>
            <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC]">
              <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">3. = Total Net Investi</span>
              <span class="text-base font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(netTotal)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">Patrimoine total accumulé</span>
            </div>
          `;

          noticeBox.innerHTML = `
            <div class="flex items-start space-x-2.5">
              <span class="text-base shrink-0">✅</span>
              <div class="text-[11px] text-century-charcoal leading-relaxed">
                <strong>Somme vérifiée :</strong> La somme nette totale investie (<strong>${formatFR(netTotal)}</strong>) correspond au cumul de tous les versements émis vers vos comptes d'investissement (${formatFR(sumTotalDeposits)}) déduction faite de tous les retraits d'épargne (${formatFR(sumTotalWithdrawals)}).
              </div>
            </div>
          `;
        } else {
          // Specific investment account
          const matchedAccount = invAccounts.find(a => a.id === type) 
                                 || (type === 'livret_a' ? invAccounts[0] : (invAccounts.length > 1 ? invAccounts[1] : invAccounts[0]));
          const isBrokerage = matchedAccount.type === 'brokerage' || matchedAccount.id !== 'livret_a';
          iconBadge.className = isBrokerage
            ? 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#F5F3FF] text-[#7C3AED]'
            : 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#EEF4FF] text-[#2C4A6F]';
          iconBadge.textContent = isBrokerage ? '📈' : '🏦';
          titleEl.textContent = `Audit : ${matchedAccount.name}`;
          subEl.textContent = `Flux et versements vers ${matchedAccount.name}`;

          const accKeywords = (matchedAccount.keywords || []).map(k => k.toUpperCase().trim()).filter(Boolean);
          const accNameU = (matchedAccount.name || '').toUpperCase();

          modalTxs = txs.filter(t => {
            if (t.category !== 'Investissements & Épargne') return false;
            const desc = (t.description || '').toUpperCase();
            const merch = (t.merchant || '').toUpperCase();
            const matchesKeyword = accKeywords.some(k => desc.includes(k) || merch.includes(k));
            const matchesName = accNameU && (merch.includes(accNameU) || desc.includes(accNameU));
            if (matchesKeyword || matchesName) return true;
            if (invAccounts.length === 1) return true;
            return false;
          });

          const sumDeposits = modalTxs.filter(t => t.type === 'Debit').reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);
          const sumWithdrawals = modalTxs.filter(t => t.type === 'Credit').reduce((acc, t) => acc + (t.amount || 0), 0);
          const netAccount = sumDeposits - sumWithdrawals;

          cardsGrid.innerHTML = `
            <div class="p-3.5 rounded-xl border border-[#2C4A6F]/20 bg-[#EEF4FF]">
              <span class="text-[10px] text-[#2C4A6F] uppercase font-semibold block">1. Versements vers ${matchedAccount.name}</span>
              <span class="text-base font-bold font-sans text-[#2C4A6F] block mt-0.5">${formatFR(sumDeposits)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">${modalTxs.filter(t => t.type === 'Debit').length} virement(s) émis</span>
            </div>
            <div class="p-3.5 rounded-xl border border-[#7C3AED]/20 bg-[#F5F3FF]">
              <span class="text-[10px] text-[#7C3AED] uppercase font-semibold block">2. − Retraits / Retours vers courant</span>
              <span class="text-base font-bold font-sans text-[#7C3AED] block mt-0.5">− ${formatFR(sumWithdrawals)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">${modalTxs.filter(t => t.type === 'Credit').length} virement(s) reçu(s)</span>
            </div>
            <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC]">
              <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">3. = Solde Net Investi</span>
              <span class="text-base font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(netAccount)}</span>
              <span class="text-[10px] text-century-muted mt-0.5 block">Net réel accumulé sur ${matchedAccount.name}</span>
            </div>
          `;

          noticeBox.innerHTML = `
            <div class="flex items-start space-x-2.5">
              <span class="text-base shrink-0">ℹ️</span>
              <div class="text-[11px] text-century-charcoal leading-relaxed">
                <strong>Calcul ${matchedAccount.name} :</strong> Les versements totalisent <strong>${formatFR(sumDeposits)}</strong>. Les retraits ou retours vers le compte courant (<strong>${formatFR(sumWithdrawals)}</strong>) sont automatiquement déduits, ce qui porte votre solde net investi à <strong>${formatFR(netAccount)}</strong>.
              </div>
            </div>
          `;
        }

      } else if (type === 'income') {
        iconBadge.className = 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#E8F0EC] text-[#2D5A3C]';
        iconBadge.textContent = '💰';
        titleEl.textContent = 'Audit & Calcul : Revenus Totaux';
        subEl.textContent = `100% Revenus (${empName}) (hors virements de tiers et aides)`;

        modalTxs = txs.filter(t => t.type === 'Credit');
        const salaryTxs = modalTxs.filter(t => t.category === 'Salaires & Revenus');
        const sumSalary = salaryTxs.reduce((acc, t) => acc + (t.amount || 0), 0);
        const reimbTxs = modalTxs.filter(t => t.category === 'Remboursements & Avoirs');
        const sumReimb = reimbTxs.reduce((acc, t) => acc + (t.amount || 0), 0);
        const giftTxs = modalTxs.filter(t => t.category === 'Cadeaux & Dons');
        const sumGifts = giftTxs.reduce((acc, t) => acc + (t.amount || 0), 0);

        cardsGrid.innerHTML = `
          <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC]">
            <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">1. Revenus d'activité (${empName})</span>
            <span class="text-base font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(sumSalary, true)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">100% retenu pour les revenus d'activité</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#EAEAE5] bg-[#FAF9F6]">
            <span class="text-[10px] text-century-muted uppercase font-medium block">2. Remboursements / Avances loyer</span>
            <span class="text-base font-bold font-sans text-century-charcoal block mt-0.5">${formatFR(sumReimb, true)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Remboursements et compensations</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#EAEAE5] bg-[#FAF9F6]">
            <span class="text-[10px] text-century-muted uppercase font-medium block">3. Cadeaux & Dons</span>
            <span class="text-base font-bold font-sans text-century-charcoal block mt-0.5">${formatFR(sumGifts, true)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Exclus des revenus professionnels</span>
          </div>
        `;

        noticeBox.innerHTML = `
          <div class="flex items-start space-x-2.5">
            <span class="text-base shrink-0">ℹ️</span>
            <div class="text-[11px] text-century-charcoal leading-relaxed">
              <strong>Règle stricte des revenus :</strong> Seuls les virements identifiés comme salaires ou revenus professionnels (<em>${empName}</em>) sont considérés comme des revenus. Les virements familiaux et remboursements (CAF, CPAM) ne gonflent pas votre revenu d'activité.
            </div>
          </div>
        `;

      } else if (type === 'savings') {
        iconBadge.className = 'w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-[#E8F0EC] text-[#2D5A3C]';
        iconBadge.textContent = '🌱';
        titleEl.textContent = 'Audit : Épargne Nette (Capacité d\'Épargne)';
        subEl.textContent = `Revenus (${empName}) − Dépenses de vie courante`;

        const totSal = summary.total_salary || 0;
        const grossLiving = Math.abs(summary.total_living_debits_gross !== undefined ? summary.total_living_debits_gross : summary.total_living_debits || 0);
        const netLiving = Math.abs(summary.total_living_debits_net !== undefined ? summary.total_living_debits_net : grossLiving);
        const netSavingsGross = summary.net_real !== undefined ? summary.net_real : (totSal - grossLiving);
        const netSavingsNet = summary.net_real_with_reimb !== undefined ? summary.net_real_with_reimb : (totSal - netLiving);

        cardsGrid.innerHTML = `
          <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC]">
            <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">1. Salaire (${empName})</span>
            <span class="text-base font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(totSal, true)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Revenus professionnels</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#6E2D38]/20 bg-[#FDF0F2]">
            <span class="text-[10px] text-[#6E2D38] uppercase font-semibold block">2. − Dépenses de vie ${useNet ? 'Nettes' : 'Brutes'}</span>
            <span class="text-base font-bold font-sans text-[#6E2D38] block mt-0.5">− ${formatFR(useNet ? netLiving : grossLiving)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">${useNet ? 'Après déduction des remboursements' : 'Hors déduction'}</span>
          </div>
          <div class="p-3.5 rounded-xl border border-[#2D5A3C]/20 bg-[#E8F0EC]">
            <span class="text-[10px] text-[#2D5A3C] uppercase font-semibold block">3. = Épargne Nette Dégagée</span>
            <span class="text-base font-bold font-sans text-[#2D5A3C] block mt-0.5">${formatFR(useNet ? netSavingsNet : netSavingsGross, true)}</span>
            <span class="text-[10px] text-century-muted mt-0.5 block">Taux : ${useNet ? summary.savings_rate_net : summary.savings_rate_gross}%</span>
          </div>
        `;

        noticeBox.innerHTML = `
          <div class="flex items-start space-x-2.5">
            <span class="text-base shrink-0">💡</span>
            <div class="text-[11px] text-century-charcoal leading-relaxed">
              <strong>Capacité d'épargne réelle :</strong> Ce montant mesure combien il vous reste chaque mois après avoir payé toutes vos charges de vie courante (alimentation, sorties, abonnements, transports). Les versements sur votre Livret A ou CTO sont ensuite alimentés par ce solde positif.
            </div>
          </div>
        `;

        modalTxs = txs.filter(t => (t.type === 'Debit' && t.category !== 'Investissements & Épargne') || (t.type === 'Credit'));
      }

      AppState.auditTransactions = modalTxs;
      renderAuditModalTable(modalTxs);

      modal.classList.remove('hidden');
    }

    function renderAuditModalTable(list) {
      const tbody = document.getElementById('audit-modal-tx-tbody');
      const countBadge = document.getElementById('audit-tx-count-badge');
      const sumBadge = document.getElementById('audit-tx-sum-badge');
      if (!tbody) return;

      tbody.innerHTML = '';
      if (!list || list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="py-8 text-center text-xs text-century-muted">
              Aucune opération correspondant aux critères de cet audit.
            </td>
          </tr>
        `;
        if (countBadge) countBadge.textContent = '0 opération';
        if (sumBadge) sumBadge.textContent = '0,00 €';
        return;
      }

      const totalSum = list.reduce((acc, t) => acc + (t.amount || 0), 0);
      if (countBadge) countBadge.textContent = `${list.length} opération${list.length > 1 ? 's' : ''}`;
      if (sumBadge) sumBadge.textContent = formatFR(totalSum, true);

      list.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#FAF9F5] transition text-xs';
        const isCredit = (t.amount || 0) > 0;
        const amtStr = formatFR(t.amount, isCredit);
        const cleanDesc = t.description || '';
        const cleanMerchant = t.merchant || cleanDesc;

        let impactBadge = '';
        if (t.category === 'Investissements & Épargne') {
          if (isCredit) {
            impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5F3FF] text-[#7C3AED]">Retrait Épargne (Déduit)</span>';
          } else {
            impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF4FF] text-[#2C4A6F]">Épargne Isolée</span>';
          }
        } else if (t.category === 'Livres') {
          impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309]">Livres / Culture</span>';
        } else if (t.category === 'Salaires & Revenus') {
          impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8F0EC] text-[#2D5A3C]">Revenu Salarié</span>';
        } else if (t.category === 'Remboursements & Avoirs') {
          impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0FDFA] text-[#0d9488]">Remboursement Déduit</span>';
        } else if (t.category === 'Cadeaux & Dons') {
          impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF2F8] text-[#be185d]">Don / Cadeau (Exclu)</span>';
        } else {
          impactBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF0F2] text-[#6E2D38]">Dépense de vie</span>';
        }

        tr.innerHTML = `
          <td class="py-2.5 px-3 font-mono text-[11px] text-century-muted whitespace-nowrap">${t.date || ''}</td>
          <td class="py-2.5 px-3">
            <span class="font-semibold text-century-charcoal block">${cleanMerchant}</span>
            <span class="text-[11px] text-century-muted font-mono truncate max-w-xs block">${cleanDesc}</span>
          </td>
          <td class="py-2.5 px-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-medium" style="background-color: ${t.color || '#94a3b8'}20; color: ${t.color || '#94a3b8'};">
              ${t.category}
            </span>
          </td>
          <td class="py-2.5 px-3 text-right font-sans font-bold whitespace-nowrap ${isCredit ? 'text-[#2D5A3C]' : 'text-[#6E2D38]'}">
            ${amtStr}
          </td>
          <td class="py-2.5 px-3 text-center whitespace-nowrap">
            ${impactBadge}
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function filterAuditModalTransactions() {
      const q = (document.getElementById('audit-tx-search').value || '').trim().toLowerCase();
      if (!AppState.auditTransactions) return;
      if (!q) {
        renderAuditModalTable(AppState.auditTransactions);
        return;
      }
      const filtered = AppState.auditTransactions.filter(t => {
        const desc = (t.description || '').toLowerCase();
        const merch = (t.merchant || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const amt = (t.amount || '').toString();
        const date = (t.date || '').toLowerCase();
        return desc.includes(q) || merch.includes(q) || cat.includes(q) || amt.includes(q) || date.includes(q);
      });
      renderAuditModalTable(filtered);
    }

    // Custom Tooltip Matching Screenshot 2 exactly
    function customChartTooltip(context) {
      let tooltipEl = document.getElementById('chartjs-custom-tooltip');
      const tooltipModel = context.tooltip;

      if (tooltipModel.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
      }

      if (tooltipModel.body) {
        const title = tooltipModel.title[0] || '';
        let innerHtml = `<div class="font-serif-title font-semibold text-sm text-century-charcoal mb-1.5">${title}</div>`;

        tooltipModel.dataPoints.forEach(dp => {
          const isIncome = dp.datasetIndex === 0;
          const empName = AppState.data?.workspace?.profile?.salary_employer_name || 'Salaires';
          const label = isIncome ? `Revenus (${empName})` : 'Dépenses de vie';
          const color = isIncome ? 'text-[#2D5A3C]' : 'text-[#6E2D38]';
          const formattedAmt = formatFR(dp.raw);
          innerHtml += `
            <div class="flex items-center justify-between space-x-4 text-xs">
              <span class="text-century-muted">${label} :</span>
              <span class="font-bold font-sans ${color}">${formattedAmt}</span>
            </div>
          `;
        });

        tooltipEl.innerHTML = innerHtml;
      }

      const position = context.chart.canvas.getBoundingClientRect();
      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
      tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY - 10 + 'px';
    }

