// ========================================================
// VIEW 2: FINANCIAL TIME MACHINE & PATTERNS
// ========================================================
    // Render View 2: Financial Time Machine & Discovered Patterns (Screenshot 1)
    function renderTimeMachine(data) {
      const summary = data.summary || {};
      const patterns = data.patterns || [];

      document.getElementById('tm-kpi-analyzed').textContent = summary.total_count || 113;
      document.getElementById('tm-kpi-patterns').textContent = patterns.length;
      const monthlySavings = summary.monthly_avg_savings !== undefined ? summary.monthly_avg_savings : (summary.net_real || 0);
      document.getElementById('tm-kpi-savings').textContent = `${formatFR(monthlySavings)}/mois`;
      document.getElementById('tm-kpi-period').textContent = data.date_range_label || "Fév 2026 - Mai 2026";
      document.getElementById('tm-period-select-label').textContent = data.date_range_label || "Période d'analyse";

      const grid = document.getElementById('discovered-patterns-grid');
      if (!grid) return;
      grid.innerHTML = '';

      patterns.forEach(p => {
        let badgeBg = 'bg-blue-50 text-blue-700';
        if (p.badge_color === 'purple') badgeBg = 'bg-purple-50 text-purple-700';
        if (p.badge_color === 'rose') badgeBg = 'bg-rose-50 text-rose-700';
        if (p.badge_color === 'amber') badgeBg = 'bg-amber-50 text-amber-700';
        if (p.badge_color === 'emerald') badgeBg = 'bg-emerald-50 text-emerald-700';
        if (p.badge_color === 'pink') badgeBg = 'bg-pink-50 text-pink-700';

        const card = document.createElement('div');
        card.className = 'c-card p-5 space-y-3';
        card.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-base">${p.icon}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${badgeBg}">${p.type}</span>
              <span class="text-xs font-bold text-century-muted">${p.badge}</span>
            </div>
            <svg class="w-4 h-4 text-century-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div>
            <h4 class="font-sans font-bold text-sm text-century-charcoal">${p.title}</h4>
            <p class="text-xs text-century-muted mt-1 leading-relaxed">${p.description}</p>
          </div>
          ${p.details ? `<div class="pt-2 border-t border-[#EAEAE5] text-[11px] text-[#2D5A3C] font-medium leading-relaxed">${p.details}</div>` : ''}
        `;
        grid.appendChild(card);
      });

      renderTimeMachineChart();
    }

    // Chart.js: Time Machine Spending Over Time (Screenshot 1)
    function renderTimeMachineChart() {
      const ctx = document.getElementById('timeMachineChart');
      if (!ctx || !AppState.data) return;

      if (AppState.timeMachineChart) {
        AppState.timeMachineChart.destroy();
      }

      const trends = AppState.data.trends || {};
      const monthly = trends.monthly_data || [];

      const labels = monthly.map(m => m.label);
      const incomeData = monthly.map(m => m.income);
      const spendingData = monthly.map(m => m.expenses_living !== undefined ? m.expenses_living : m.expenses);

      const chartCtx = ctx.getContext('2d');
      const greenGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
      greenGradient.addColorStop(0, 'rgba(45, 90, 60, 0.28)');
      greenGradient.addColorStop(1, 'rgba(45, 90, 60, 0.02)');

      const burgundyGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
      burgundyGradient.addColorStop(0, 'rgba(110, 45, 56, 0.24)');
      burgundyGradient.addColorStop(1, 'rgba(110, 45, 56, 0.02)');

      AppState.timeMachineChart = new Chart(ctx, {
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
              label: 'Dépenses (Vie courante)',
              data: spendingData,
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

