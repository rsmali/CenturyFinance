// ========================================================
// CORE DASHBOARD CONTROLLER & GLOBAL STATE
// ========================================================
    // Global State with localStorage persistence
    let AppState = {
      currentView: (function() {
        try { return localStorage.getItem('cf_current_view') || 'overview'; } catch (e) { return 'overview'; }
      })(),
      selectedMonth: (function() {
        try { return localStorage.getItem('cf_selected_month') || 'ALL'; } catch (e) { return 'ALL'; }
      })(),
      activeWorkspace: (function() {
        try { return localStorage.getItem('cf_active_workspace') || 'default'; } catch (e) { return 'default'; }
      })(),
      workspaces: [],
      data: null,
      overviewChart: null,
      investmentsChart: null,
      timeMachineChart: null,
      categoryCharts: [],
      budgetDonutChart: null,
      categoryZoomChart: null,
      categoryBreakdownPieChart: null,
      categoryDistributionChart: null,
      categoryDistributionMode: 'regular',
      activeCategoryDetail: null,
      activeCategoryMerchantFilter: null,
      currentCategoryBreakdownItems: null,
      currentCategoryBreakdownTotal: 0,
      currentCategoryBreakdownColors: [],
      editingTxId: null,
      budget: null,
      budgetBaseline: null,
      deductReimbursements: true,
      activeAuditType: null,
      auditTransactions: [],
    };

    // Strict French Number Formatter (1.468,48 €)
    function formatFR(amount, showSign = false) {
      if (amount === undefined || amount === null || isNaN(amount)) return "0,00 €";
      const isNeg = amount < 0;
      const abs = Math.abs(amount);
      const parts = abs.toFixed(2).split(".");
      // Replace thousands with dot '.'
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const decPart = parts[1];
      const formatted = `${intPart},${decPart} €`;
      if (isNeg) return `-${formatted}`;
      if (showSign && amount > 0) return `+${formatted}`;
      return formatted;
    }

    function formatFRCompact(val) {
      if (val === 0) return "0 €";
      if (Math.abs(val) >= 1000) {
        const k = (val / 1000).toFixed(1).replace(".", ",");
        return `${k.endsWith(",0") ? k.slice(0, -2) : k}k €`;
      }
      return `${val} €`;
    }

    // Switch between views
    function switchView(viewName) {
      AppState.currentView = viewName;
      try { localStorage.setItem('cf_current_view', viewName); } catch (e) {}
      
      const views = ['overview', 'budget', 'timemachine', 'upload', 'transactions', 'files', 'categories', 'rules', 'holidays'];
      views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const nav = document.getElementById(`nav-${v}`);
        if (el) el.classList.add('hidden');
        if (nav) nav.classList.remove('nav-item-active');
      });

      const activeEl = document.getElementById(`view-${viewName}`);
      const activeNav = document.getElementById(`nav-${viewName}`);
      if (activeEl) activeEl.classList.remove('hidden');
      if (activeNav) activeNav.classList.add('nav-item-active');

      // Refresh charts when changing view
      if (viewName === 'overview') {
        setTimeout(() => {
          renderOverviewChart();
          renderInvestmentsChart();
        }, 60);
      } else if (viewName === 'budget') {
        setTimeout(() => {
          renderBudgetSimulator();
        }, 60);
      } else if (viewName === 'timemachine') {
        setTimeout(renderTimeMachineChart, 60);
      } else if (viewName === 'categories') {
        setTimeout(() => {
          if (AppState.data) renderCategories(AppState.data);
        }, 60);
      } else if (viewName === 'holidays') {
        setTimeout(() => {
          if (AppState.data) renderHolidayTrips(AppState.data);
        }, 60);
      }
    }

    // Detect static demo hosting (GitHub Pages, file protocol, or port 8000)
    const isStaticDemo = window.location.hostname.endsWith('github.io') || 
                         window.location.protocol === 'file:' || 
                         window.location.port === '8000';

    function renderStaticDemoBanner() {
      if (document.getElementById('static-demo-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'static-demo-banner';
      banner.className = 'bg-[#EBF3ED] border-b border-[#2D5A3C]/20 px-4 py-2 text-xs text-century-charcoal flex items-center justify-between z-50 sticky top-0 backdrop-blur-md shadow-xs';
      banner.innerHTML = `
        <div class="flex items-center space-x-2 truncate">
          <span class="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
          <span class="font-bold text-century-green font-serif-title">Live Demo GitHub Pages</span>
          <span class="text-century-muted hidden sm:inline">— Navigation interactive avec données de démonstration anonymisées (6 mois).</span>
        </div>
        <div class="flex items-center space-x-3 shrink-0">
          <a href="https://github.com/votre-nom/century-finance" target="_blank" class="text-century-green hover:underline font-bold flex items-center space-x-1">
            <span>Dépôt GitHub (100% Local)</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </a>
        </div>
      `;
      const mainContent = document.querySelector('main') || document.body;
      mainContent.prepend(banner);
    }

    // Fetch complete data from Flask API (or static demo JSON for GitHub Pages)
    async function loadDashboardData() {
      try {
        let data;
        const monthKey = AppState.selectedMonth || 'ALL';
        const wsParam = AppState.activeWorkspace ? `&workspace=${AppState.activeWorkspace}` : '';

        if (isStaticDemo) {
          let res = await fetch(`./data/demo_${monthKey}.json`).catch(() => null);
          if (!res || !res.ok) {
            res = await fetch('./data/demo_ALL.json');
          }
          data = await res.json();
          renderStaticDemoBanner();
        } else {
          try {
            const res = await fetch(`/api/data?month=${AppState.selectedMonth}${wsParam}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
          } catch (apiErr) {
            console.warn("API backend injoignable, bascule automatique sur les données statiques.", apiErr);
            let res = await fetch(`./data/demo_${monthKey}.json`).catch(() => null);
            if (!res || !res.ok) {
              res = await fetch('./data/demo_ALL.json');
            }
            data = await res.json();
            renderStaticDemoBanner();
          }
        }

        AppState.data = data;
        AppState.workspaces = data.workspaces || [];
        if (data.workspace && data.workspace.id) {
          AppState.activeWorkspace = data.workspace.id;
        }
        
        renderWorkspaceSwitcher(data);
        renderOverview(data);
        renderTimeMachine(data);
        renderFileManagement(data);
        renderTransactions(data);
        renderCategories(data);
        renderRules(data);
        renderHolidayTrips(data);
        initBudgetSimulator(data);
        updateSidebarBadges(data);
      } catch (err) {
        console.error("Erreur de chargement des données:", err);
      }
    }


// Utility: HTML entity escaping
    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

// Sidebar badges update
    // Update sidebar counts & status
    function updateSidebarBadges(data) {
      const txCount = data.transactions ? data.transactions.length : 0;
      const pdfCount = data.statements ? data.statements.length : 0;
      const patternsCount = data.patterns ? data.patterns.length : 6;
      
      const txBadge = document.getElementById('nav-tx-count');
      if (txBadge) txBadge.textContent = txCount;

      const patternsBadge = document.getElementById('nav-patterns-badge');
      if (patternsBadge) patternsBadge.textContent = patternsCount;

      const holidaysCount = (data.holiday_trips && data.holiday_trips.length) ? data.holiday_trips.length : 0;
      const holidaysBadge = document.getElementById('nav-holidays-badge');
      if (holidaysBadge) holidaysBadge.textContent = holidaysCount;

      const stCount = document.getElementById('sidebar-statements-count');
      if (stCount) stCount.textContent = `${pdfCount} PDF`;
    }


// Mobile navigation & startup lifecycle
    function toggleMobileMenu() {
      const nav = document.getElementById('sidebar-nav');
      if (nav) nav.classList.toggle('hidden');
    }

    // Initial Startup
    window.addEventListener('DOMContentLoaded', () => {
      if (AppState.currentView && AppState.currentView !== 'overview') {
        switchView(AppState.currentView);
      }
      loadDashboardData();
    });
