// ========================================================
// VIEW 7: BUDGET SIMULATOR (50/30/20 & SCENARIOS)
// ========================================================
    // ========================================================
    // BUDGET & SCENARIO SIMULATOR LOGIC
    // ========================================================
    const BUDGET_CAT_MAP = {
      'Logement & Énergie': { input: 'sim-input-logement', range: 'sim-range-logement', max: 2500, type: 'fixed' },
      'Télécom & Abonnements': { input: 'sim-input-telecom', range: 'sim-range-telecom', max: 250, type: 'fixed' },
      'Transports & Péages': { input: 'sim-input-transports', range: 'sim-range-transports', max: 350, type: 'fixed' },
      'Frais Bancaires': { input: 'sim-input-frais-bancaires', range: 'sim-range-frais-bancaires', max: 100, type: 'fixed' },
      'Alimentation & Supermarchés': { input: 'sim-input-alimentation', range: 'sim-range-alimentation', max: 800, type: 'essential' },
      'Santé & Pharmacie': { input: 'sim-input-sante', range: 'sim-range-sante', max: 250, type: 'essential' },
      'Restaurants & Sorties': { input: 'sim-input-restaurants', range: 'sim-range-restaurants', max: 600, type: 'lifestyle' },
      'Sports & Fitness': { input: 'sim-input-sports', range: 'sim-range-sports', max: 150, type: 'lifestyle' },
      'Shopping & Soins': { input: 'sim-input-shopping', range: 'sim-range-shopping', max: 300, type: 'lifestyle' },
      'High-Tech & Équipement': { input: 'sim-input-hightech', range: 'sim-range-hightech', max: 300, type: 'lifestyle' },
      'Voyages & Vacances': { input: 'sim-input-vacances', range: 'sim-range-vacances', max: 800, type: 'lifestyle' },
      'Autre': { input: 'sim-input-autre', range: 'sim-range-autre', max: 300, type: 'lifestyle' }
    };

    function highlightScenarioPill(scenarioKey) {
      document.querySelectorAll('.scenario-pill').forEach(btn => {
        btn.classList.remove('bg-[#E8F0EC]', 'text-[#2D5A3C]', 'border-[#CDE0D4]', 'font-semibold');
        btn.classList.add('bg-white', 'text-century-charcoal', 'border-[#EAEAE5]', 'font-medium');
      });
      const active = document.getElementById(`scenario-btn-${scenarioKey}`);
      if (active) {
        active.classList.remove('bg-white', 'text-century-charcoal', 'border-[#EAEAE5]', 'font-medium');
        active.classList.add('bg-[#E8F0EC]', 'text-[#2D5A3C]', 'border-[#CDE0D4]', 'font-semibold');
      }
    }

    function applyBudgetScenario(scenarioKey) {
      if (!AppState.budget) resetBudgetToBaseline();
      highlightScenarioPill(scenarioKey);

      const bl = AppState.budgetBaseline || {};
      const blCats = bl.categories || {};

      if (scenarioKey === 'baseline') {
        resetBudgetToBaseline();
        return;
      }

      if (scenarioKey === 'moving_t2') {
        AppState.budget.categories['Logement & Énergie'] = 850;
        AppState.budget.categories['Télécom & Abonnements'] = 40;
      } else if (scenarioKey === 'moving_t3') {
        AppState.budget.categories['Logement & Énergie'] = 1150;
        AppState.budget.categories['Télécom & Abonnements'] = 50;
      } else if (scenarioKey === 'savings_30') {
        const restBase = blCats['Restaurants & Sorties'] || 300;
        AppState.budget.categories['Restaurants & Sorties'] = Math.round(restBase * 0.65);
        AppState.budget.categories['Shopping & Soins'] = 50;
        AppState.budget.categories['Voyages & Vacances'] = 150;
        if (AppState.budget.investments) {
          for (const k of Object.keys(AppState.budget.investments)) {
            AppState.budget.investments[k] = Math.round((AppState.budget.investments[k] || 100) * 1.35);
          }
        }
      } else if (scenarioKey === 'frugal') {
        const restBase = blCats['Restaurants & Sorties'] || 300;
        AppState.budget.categories['Restaurants & Sorties'] = Math.round(restBase * 0.60);
        AppState.budget.categories['Shopping & Soins'] = 40;
        AppState.budget.categories['Voyages & Vacances'] = 100;
        AppState.budget.categories['Sports & Fitness'] = 0;
        AppState.budget.categories['Télécom & Abonnements'] = 25;
      }

      syncBudgetDOM();
      calculateBudget();
    }

    function switchBudgetTab(tabKey) {
      document.querySelectorAll('.budget-tab-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-century-charcoal', 'font-semibold', 'shadow-2xs');
        btn.classList.add('text-century-muted');
      });
      const activeBtn = document.getElementById(`budget-tab-${tabKey}`);
      if (activeBtn) {
        activeBtn.classList.remove('text-century-muted');
        activeBtn.classList.add('bg-white', 'text-century-charcoal', 'font-semibold', 'shadow-2xs');
      }

      document.querySelectorAll('.budget-section-block').forEach(block => {
        const bucket = block.getAttribute('data-budget-bucket');
        if (tabKey === 'all' || bucket === tabKey) {
          block.classList.remove('hidden');
        } else {
          block.classList.add('hidden');
        }
      });
    }

    function initBudgetSimulator(data) {
      const baseline = data.budget_baseline || {};
      AppState.budgetBaseline = baseline;

      const hintEl = document.getElementById('sim-salary-baseline-hint');
      if (hintEl) {
        hintEl.textContent = `Moyenne 4 mois : ${formatFR(baseline.income || 0)}`;
      }
      const periodBadge = document.getElementById('sim-baseline-period-badge');
      if (periodBadge && baseline.months_considered && baseline.months_considered.length > 0) {
        periodBadge.textContent = `Base 4 mois : ${baseline.months_considered.join(', ')}`;
      }

      if (!AppState.budget) {
        resetBudgetToBaseline();
      } else {
        syncBudgetDOM();
        calculateBudget();
      }
    }

    function resetBudgetToBaseline() {
      highlightScenarioPill('baseline');
      const bl = AppState.budgetBaseline || {};
      const blCats = bl.categories || {};
      const invAccs = (AppState.data?.workspace?.profile?.investment_accounts) 
                      || (bl.investment_accounts) 
                      || [ { id: 'livret_a', name: 'Livret A', color: '#2C4A6F' } ];
      const blInvestByAcc = bl.investments_by_account || {};

      const investState = {};
      invAccs.forEach(acc => {
        if (blInvestByAcc[acc.id] !== undefined) {
          investState[acc.id] = blInvestByAcc[acc.id];
        } else if (acc.id === 'livret_a') {
          investState[acc.id] = bl.investments_livret_a !== undefined ? bl.investments_livret_a : 100;
        } else {
          investState[acc.id] = bl.investments_cto !== undefined ? bl.investments_cto : 225;
        }
      });

      AppState.budget = {
        salary: bl.income_salary !== undefined ? bl.income_salary : (bl.income || 0),
        other_income: 0,
        categories: {
          'Logement & Énergie': blCats['Logement & Énergie'] || 0,
          'Télécom & Abonnements': blCats['Télécom & Abonnements'] || 0,
          'Transports & Péages': blCats['Transports & Péages'] || 0,
          'Frais Bancaires': blCats['Frais Bancaires'] || 0,
          'Alimentation & Supermarchés': blCats['Alimentation & Supermarchés'] || 0,
          'Santé & Pharmacie': blCats['Santé & Pharmacie'] || 0,
          'Restaurants & Sorties': blCats['Restaurants & Sorties'] || 0,
          'Sports & Fitness': blCats['Sports & Fitness'] || 0,
          'Shopping & Soins': blCats['Shopping & Soins'] || 0,
          'High-Tech & Équipement': blCats['High-Tech & Équipement'] || 0,
          'Voyages & Vacances': blCats['Voyages & Vacances'] || 0,
          'Autre': (blCats['Autre'] || 0) + (blCats['Tabac & Presse'] || 0) + (blCats['Retraits & Espèces'] || 0)
        },
        investments: investState
      };

      syncBudgetDOM();
      calculateBudget();
    }

    function syncBudgetDOM() {
      if (!AppState.budget) return;

      const salInput = document.getElementById('sim-input-salary');
      const salRange = document.getElementById('sim-range-salary');
      if (salInput) salInput.value = Math.round(AppState.budget.salary);
      if (salRange) salRange.value = Math.min(6000, Math.round(AppState.budget.salary));

      const oIncInput = document.getElementById('sim-input-other-income');
      if (oIncInput) oIncInput.value = Math.round(AppState.budget.other_income);

      for (const [catName, cfg] of Object.entries(BUDGET_CAT_MAP)) {
        const val = AppState.budget.categories[catName] !== undefined ? Math.round(AppState.budget.categories[catName]) : 0;
        const inp = document.getElementById(cfg.input);
        const rng = document.getElementById(cfg.range);
        if (inp) inp.value = val;
        if (rng) rng.value = Math.min(cfg.max, val);
      }

      const investContainer = document.getElementById('sim-investments-container');
      const invAccs = (AppState.data?.workspace?.profile?.investment_accounts) 
                      || (AppState.budgetBaseline?.investment_accounts) 
                      || [ { id: 'livret_a', name: 'Livret A', color: '#2C4A6F' } ];
      if (investContainer) {
        let invHtml = '';
        invAccs.forEach(acc => {
          const val = AppState.budget.investments && AppState.budget.investments[acc.id] !== undefined 
                      ? Math.round(AppState.budget.investments[acc.id]) 
                      : 0;
          invHtml += `
            <div class="p-3 rounded-xl bg-[#FAF9F5] border border-[#EAEAE5] space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-century-charcoal">${acc.name}</span>
                <div class="relative">
                  <input type="number" id="sim-input-invest-${acc.id}" step="25" min="0" value="${val}" oninput="onBudgetInvestChange('${acc.id}', this.value)"
                    class="w-20 px-1.5 py-0.5 text-right rounded bg-white border border-[#D4D6CE] text-xs font-bold font-mono focus:outline-hidden text-[#2D5A3C]">
                  <span class="absolute right-1 top-0.5 text-xs text-century-muted pointer-events-none">€</span>
                </div>
              </div>
              <input type="range" id="sim-range-invest-${acc.id}" min="0" max="1500" step="25" value="${Math.min(1500, val)}" oninput="onBudgetInvestSliderChange('${acc.id}', this.value)"
                class="w-full h-1 bg-[#EAEAE5] rounded appearance-none cursor-pointer accent-[#2D5A3C]">
              <div class="flex gap-1 text-[10px]">
                <button type="button" onclick="onBudgetInvestChange('${acc.id}', 100)" class="px-1.5 py-0.5 rounded border border-[#EAEAE5] bg-white hover:bg-[#F6F6F2] text-century-muted">100 €</button>
                <button type="button" onclick="onBudgetInvestChange('${acc.id}', 250)" class="px-1.5 py-0.5 rounded border border-[#EAEAE5] bg-white hover:bg-[#F6F6F2] text-century-muted">250 €</button>
                <button type="button" onclick="onBudgetInvestChange('${acc.id}', 500)" class="px-1.5 py-0.5 rounded border border-[#EAEAE5] bg-white hover:bg-[#F6F6F2] text-century-muted">500 €</button>
              </div>
            </div>
          `;
        });
        investContainer.innerHTML = invHtml;
      }
    }

    function onBudgetInputChange(field, val) {
      const num = Math.max(0, parseFloat(val) || 0);
      if (field === 'salary') {
        AppState.budget.salary = num;
        const rng = document.getElementById('sim-range-salary');
        if (rng) rng.value = Math.min(6000, num);
      } else if (field === 'other_income') {
        AppState.budget.other_income = num;
      }
      calculateBudget();
    }

    function onBudgetSliderChange(field, val) {
      const num = parseFloat(val) || 0;
      if (field === 'salary') {
        AppState.budget.salary = num;
        const inp = document.getElementById('sim-input-salary');
        if (inp) inp.value = num;
      }
      calculateBudget();
    }

    function onBudgetCategoryInputChange(catName, val) {
      const num = Math.max(0, parseFloat(val) || 0);
      AppState.budget.categories[catName] = num;
      const cfg = BUDGET_CAT_MAP[catName];
      if (cfg) {
        const rng = document.getElementById(cfg.range);
        if (rng) rng.value = Math.min(cfg.max, num);
      }
      calculateBudget();
    }

    function onBudgetCategorySliderChange(catName, val) {
      const num = parseFloat(val) || 0;
      AppState.budget.categories[catName] = num;
      const cfg = BUDGET_CAT_MAP[catName];
      if (cfg) {
        const inp = document.getElementById(cfg.input);
        if (inp) inp.value = num;
      }
      calculateBudget();
    }

    function setBudgetCategoryPreset(catName, val) {
      onBudgetCategoryInputChange(catName, val);
      const cfg = BUDGET_CAT_MAP[catName];
      if (cfg) {
        const inp = document.getElementById(cfg.input);
        if (inp) inp.value = val;
        const rng = document.getElementById(cfg.range);
        if (rng) rng.value = Math.min(cfg.max, val);
      }
    }

    function adjustCategoryPct(catName, deltaPct) {
      const current = AppState.budget.categories[catName] || 0;
      const next = Math.max(0, Math.round(current * (1 + deltaPct)));
      setBudgetCategoryPreset(catName, next);
    }

    function resetSingleCategoryToBaseline(catName) {
      const bl = AppState.budgetBaseline || {};
      const blCats = bl.categories || {};
      let val = blCats[catName] || 0;
      if (catName === 'Autre') {
        val += (blCats['Tabac & Presse'] || 0) + (blCats['Retraits & Espèces'] || 0);
      }
      setBudgetCategoryPreset(catName, Math.round(val));
    }

    function onBudgetInvestChange(field, val) {
      const num = Math.max(0, parseFloat(val) || 0);
      if (!AppState.budget.investments) AppState.budget.investments = {};
      AppState.budget.investments[field] = num;
      const rng = document.getElementById(`sim-range-invest-${field}`);
      if (rng) rng.value = Math.min(1500, num);
      const inp = document.getElementById(`sim-input-invest-${field}`);
      if (inp) inp.value = num;
      calculateBudget();
    }

    function onBudgetInvestSliderChange(field, val) {
      const num = parseFloat(val) || 0;
      if (!AppState.budget.investments) AppState.budget.investments = {};
      AppState.budget.investments[field] = num;
      const inp = document.getElementById(`sim-input-invest-${field}`);
      if (inp) inp.value = num;
      calculateBudget();
    }

    function calculateBudget() {
      if (!AppState.budget) return;

      const totalIncome = (AppState.budget.salary || 0) + (AppState.budget.other_income || 0);

      let totalFixed = 0;
      let totalEssentials = 0;
      let totalLifestyle = 0;

      for (const [catName, cfg] of Object.entries(BUDGET_CAT_MAP)) {
        const amt = AppState.budget.categories[catName] || 0;
        if (cfg.type === 'fixed') totalFixed += amt;
        else if (cfg.type === 'essential') totalEssentials += amt;
        else if (cfg.type === 'lifestyle') totalLifestyle += amt;
      }

      // Update Category Delta Badges vs 4-month baseline
      const bl = AppState.budgetBaseline || {};
      const blCats = bl.categories || {};
      for (const [catName, cfg] of Object.entries(BUDGET_CAT_MAP)) {
        const currentVal = AppState.budget.categories[catName] || 0;
        let baseVal = blCats[catName] || 0;
        if (catName === 'Autre') {
          baseVal += (blCats['Tabac & Presse'] || 0) + (blCats['Retraits & Espèces'] || 0);
        }
        const delta = Math.round(currentVal - baseVal);
        const badge = document.getElementById(`delta-badge-${catName}`);
        if (badge) {
          if (delta > 0) {
            badge.textContent = `+${formatFR(delta)}`;
            badge.className = 'text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#FEF3C7] text-[#B45309] font-medium';
          } else if (delta < 0) {
            badge.textContent = `${formatFR(delta)}`;
            badge.className = 'text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E8F0EC] text-[#2D5A3C] font-semibold';
          } else {
            badge.textContent = 'Moyenne';
            badge.className = 'text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-[#EAEAE5] text-century-muted';
          }
        }
      }

      const totalLivingExpenses = totalFixed + totalEssentials + totalLifestyle;
      const totalInvestments = Object.values(AppState.budget.investments || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
      const leftover = totalIncome - totalLivingExpenses - totalInvestments;
      const annualWealth = (leftover + totalInvestments) * 12;
      const savingsRate = totalIncome > 0 ? ((leftover + totalInvestments) / totalIncome * 100) : 0;

      const secInvest = document.getElementById('sim-sec-invest-total');
      if (secInvest) secInvest.textContent = formatFR(totalInvestments);

      // Update Top KPIs
      const incEl = document.getElementById('sim-kpi-income');
      if (incEl) incEl.textContent = formatFR(totalIncome);

      const expEl = document.getElementById('sim-kpi-expenses');
      if (expEl) expEl.textContent = formatFR(totalLivingExpenses);

      const invEl = document.getElementById('sim-kpi-investments');
      if (invEl) invEl.textContent = formatFR(totalInvestments);

      const leftEl = document.getElementById('sim-kpi-leftover');
      if (leftEl) {
        leftEl.textContent = formatFR(leftover, true);
        if (leftover >= 0) {
          leftEl.className = 'text-3xl md:text-4xl font-bold font-mono tracking-tight text-[#059669]';
        } else {
          leftEl.className = 'text-3xl md:text-4xl font-bold font-mono tracking-tight text-[#DC2626]';
        }
      }

      // Section totals
      const sIncEl = document.getElementById('sim-sec-income-total');
      if (sIncEl) sIncEl.textContent = formatFR(totalIncome);

      const sFixEl = document.getElementById('sim-sec-fixed-total');
      if (sFixEl) sFixEl.textContent = formatFR(totalFixed);

      const sEssEl = document.getElementById('sim-sec-essentials-total');
      if (sEssEl) sEssEl.textContent = formatFR(totalEssentials);

      const sLifeEl = document.getElementById('sim-sec-lifestyle-total');
      if (sLifeEl) sLifeEl.textContent = formatFR(totalLifestyle);

      const sInvEl = document.getElementById('sim-sec-invest-total');
      if (sInvEl) sInvEl.textContent = formatFR(totalInvestments);

      // Annual wealth heading
      const annEl = document.getElementById('sim-annual-wealth');
      if (annEl) annEl.textContent = `${formatFR(annualWealth)} / an`;

      const rateEl = document.getElementById('sim-savings-rate-badge');
      if (rateEl) {
        rateEl.textContent = `${savingsRate.toFixed(1)}% d'épargne`;
        rateEl.className = `px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${savingsRate >= 20 ? 'bg-[#E8F0EC] text-[#2D5A3C]' : (savingsRate >= 10 ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#FEE2E2] text-[#DC2626]')}`;
      }

      // Delta comparison message vs baseline
      const deltaMsg = document.getElementById('sim-delta-message');
      if (deltaMsg) {
        const blLeft = bl.money_left_over || 0;
        const diffLeft = leftover - blLeft;
        if (leftover >= 0) {
          if (diffLeft >= 5) {
            deltaMsg.innerHTML = `<span class="font-semibold text-[#2D5A3C]">Surplus en hausse :</span> vos ajustements dégagent <strong>+${formatFR(diffLeft)} / mois</strong> de plus que votre moyenne historique.`;
          } else if (diffLeft <= -5) {
            deltaMsg.innerHTML = `<span class="font-semibold text-[#B45309]">Surplus resserré :</span> marge de sécurité de <strong>${formatFR(leftover)} / mois</strong> (${formatFR(diffLeft)} vs historique).`;
          } else {
            deltaMsg.innerHTML = `<span class="font-semibold text-century-charcoal">Scénario de référence :</span> projections alignées sur vos habitudes réelles des 4 derniers mois.`;
          }
        } else {
          deltaMsg.innerHTML = `<span class="text-rose-600 font-semibold">⚠️ Déficit prévisionnel :</span> vos dépenses dépassent vos revenus de <strong>${formatFR(Math.abs(leftover))} / mois</strong>.`;
        }
      }

      // 50/30/20 Benchmark
      const needsTotal = totalFixed + totalEssentials;
      const wantsTotal = totalLifestyle;
      const savingsTotal = Math.max(0, totalInvestments + leftover);

      const needsPct = totalIncome > 0 ? Math.round((needsTotal / totalIncome) * 100) : 0;
      const wantsPct = totalIncome > 0 ? Math.round((wantsTotal / totalIncome) * 100) : 0;
      const savingsPct = totalIncome > 0 ? Math.round((savingsTotal / totalIncome) * 100) : 0;

      const bNeedsVal = document.getElementById('bench-needs-val');
      if (bNeedsVal) bNeedsVal.textContent = `${needsPct}%`;
      const bNeedsBar = document.getElementById('bench-needs-bar');
      if (bNeedsBar) bNeedsBar.style.width = `${Math.min(100, needsPct)}%`;

      const bWantsVal = document.getElementById('bench-wants-val');
      if (bWantsVal) bWantsVal.textContent = `${wantsPct}%`;
      const bWantsBar = document.getElementById('bench-wants-bar');
      if (bWantsBar) bWantsBar.style.width = `${Math.min(100, wantsPct)}%`;

      const bSavVal = document.getElementById('bench-savings-val');
      if (bSavVal) bSavVal.textContent = `${savingsPct}%`;
      const bSavBar = document.getElementById('bench-savings-bar');
      if (bSavBar) bSavBar.style.width = `${Math.min(100, savingsPct)}%`;

      // Donut percentages
      const pctNeedsEl = document.getElementById('sim-pct-needs');
      if (pctNeedsEl) pctNeedsEl.textContent = `${needsPct}%`;
      const pctWantsEl = document.getElementById('sim-pct-wants');
      if (pctWantsEl) pctWantsEl.textContent = `${wantsPct}%`;
      const pctSavEl = document.getElementById('sim-pct-savings');
      if (pctSavEl) pctSavEl.textContent = `${savingsPct}%`;

      // Advice message
      const benchAdvice = document.getElementById('sim-bench-advice');
      if (benchAdvice) {
        if (needsPct > 55) {
          benchAdvice.innerHTML = `⚠️ <strong>Charges élevées :</strong> les besoins fixes représentent <strong>${needsPct}%</strong> des revenus (cible ≤ 50%). Allégez le logement ou les abonnements pour augmenter votre marge.`;
        } else if (savingsPct >= 20) {
          benchAdvice.innerHTML = `✓ <strong>Règle 50/30/20 validée :</strong> votre taux d'épargne et surplus atteint <strong>${savingsPct}%</strong>. Votre équilibre financier est optimal.`;
        } else {
          benchAdvice.innerHTML = `💡 <strong>Épargne à renforcer :</strong> taux actuel à <strong>${savingsPct}%</strong> (cible ≥ 20%). Un arbitrage sur les restaurants (-35%) permettrait d'atteindre l'objectif.`;
        }
      }

      renderBudgetDonutChart(needsTotal, wantsTotal, savingsTotal);
    }

    function renderBudgetDonutChart(needs, wants, savings) {
      const ctx = document.getElementById('budgetBreakdownDonutChart');
      if (!ctx) return;
      if (AppState.budgetDonutChart) {
        AppState.budgetDonutChart.destroy();
      }

      AppState.budgetDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Besoins & Logement', 'Envies & Sorties', 'Épargne & Reste à vivre'],
          datasets: [{
            data: [Math.max(0, needs), Math.max(0, wants), Math.max(0, savings)],
            backgroundColor: ['#2563EB', '#F59E0B', '#10B981'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.label}: ${formatFR(c.raw)}`
              }
            }
          }
        }
      });
    }

    function renderBudgetSimulator() {
      if (AppState.data && AppState.data.budget_baseline) {
        initBudgetSimulator(AppState.data);
      }
    }

