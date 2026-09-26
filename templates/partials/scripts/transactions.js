// ========================================================
// VIEW 5: TRANSACTIONS REVIEW & BULK ACTIONS
// ========================================================
    // Render View 5: Transaction Review
    function renderTransactions(data) {
      const catFilter = document.getElementById('tx-category-filter');
      const curSelected = catFilter.value;
      catFilter.innerHTML = '<option value="ALL">Toutes les catégories</option>';
      (data.categories || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catFilter.appendChild(opt);
      });
      catFilter.value = curSelected;

      const holidayFilter = document.getElementById('tx-holiday-filter');
      if (holidayFilter) {
        const curHoliday = holidayFilter.value;
        holidayFilter.innerHTML = `
          <option value="ALL">Tous les séjours</option>
          <option value="ANY_TRIP">🌴 Dépenses en séjour</option>
          <option value="NO_TRIP">Hors séjours</option>
        `;
        const trips = data.holiday_trips || [];
        if (trips.length > 0) {
          const group = document.createElement('optgroup');
          group.label = "Séjours spécifiques";
          trips.forEach(tr => {
            const opt = document.createElement('option');
            opt.value = tr.id;
            opt.textContent = `${tr.icon || '🌴'} ${tr.name}`;
            group.appendChild(opt);
          });
          holidayFilter.appendChild(group);
        }
        holidayFilter.value = curHoliday || 'ALL';
      }

      const modalSelect = document.getElementById('modal-category-select');
      modalSelect.innerHTML = '';
      (data.categories || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        modalSelect.appendChild(opt);
      });

      const newRuleSelect = document.getElementById('new-rule-category');
      if (newRuleSelect) {
        newRuleSelect.innerHTML = '';
        (data.categories || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          newRuleSelect.appendChild(opt);
        });
      }

      applyTransactionFilters();
    }

    function applyTransactionFilters() {
      if (!AppState.data || !AppState.data.transactions) return;

      const q = (document.getElementById('tx-search-input').value || '').toLowerCase().trim();
      const cat = document.getElementById('tx-category-filter').value;
      const type = document.getElementById('tx-type-filter').value;
      const holidayVal = document.getElementById('tx-holiday-filter') ? document.getElementById('tx-holiday-filter').value : 'ALL';

      let filtered = AppState.data.transactions.filter(t => {
        const matchQ = !q || 
          (t.merchant && t.merchant.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.amount && t.amount.toString().includes(q));

        const matchCat = (cat === 'ALL') || (t.category === cat);
        const matchType = (type === 'ALL') || (t.type === type);

        let matchHoliday = true;
        if (holidayVal === 'ANY_TRIP') {
          matchHoliday = !!t.holiday_trip_id;
        } else if (holidayVal === 'NO_TRIP') {
          matchHoliday = !t.holiday_trip_id;
        } else if (holidayVal !== 'ALL') {
          matchHoliday = (t.holiday_trip_id === holidayVal);
        }

        return matchQ && matchCat && matchType && matchHoliday;
      });

      const tbody = document.getElementById('transactions-table-body');
      const emptyState = document.getElementById('tx-empty-state');
      tbody.innerHTML = '';

      // Reset bulk selection whenever the list is rebuilt
      const selAll = document.getElementById('tx-select-all');
      if (selAll) selAll.checked = false;
      const bulkBar = document.getElementById('tx-bulk-action-bar');
      if (bulkBar) bulkBar.classList.add('hidden');

      if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
      }
      emptyState.classList.add('hidden');

      filtered.forEach(tx => {
        const isCredit = tx.type === 'Credit';
        const amtFormatted = formatFR(tx.amount, true);
        const amtColor = isCredit ? 'text-[#2D5A3C]' : 'text-[#6E2D38]';
        const cleanMerchant = tx.merchant || tx.description || 'Opération';

        const trip = (AppState.data && AppState.data.holiday_trips) 
          ? AppState.data.holiday_trips.find(tr => tr.id === tx.holiday_trip_id) 
          : null;
        let tripHtml = '<span class="text-century-muted/40 text-[11px]">—</span>';
        if (trip) {
          tripHtml = `
            <button onclick="openHolidayTripModal('${trip.id}')" title="Voir le séjour : ${escapeHtml(trip.name)}" class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium border hover:opacity-80 transition" style="background-color: ${trip.color || '#366B80'}15; color: ${trip.color || '#366B80'}; border-color: ${trip.color || '#366B80'}35;">
              <span>${trip.icon || '🌴'}</span>
              <span class="truncate max-w-[120px]">${escapeHtml(trip.name)}</span>
            </button>
          `;
        } else if (tx.category === 'Voyages & Vacances') {
          tripHtml = `
            <button onclick="openCategoryModal('${tx.id}')" title="Rattacher à un séjour" class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#366B80] bg-[#EEF4F8] border border-[#366B80]/20 hover:bg-[#E3EDF3] transition">
              <span>+ Assigner</span>
            </button>
          `;
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-[#FAF9F5] transition';
        row.innerHTML = `
          <td class="py-3 pl-4 pr-2">
            <input type="checkbox" class="tx-select-checkbox rounded border-[#D2D4CA] text-[#2D5A3C] focus:ring-[#2D5A3C] cursor-pointer" data-id="${tx.id}" onchange="updateTxBulkBar()">
          </td>
          <td class="py-3 px-4 text-century-muted whitespace-nowrap font-mono text-[11px]">${tx.date}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium" style="background-color: ${tx.color}15; color: ${tx.color};">
              <span>${tx.icon || '📦'}</span>
              <span>${tx.category}</span>
            </span>
          </td>
          <td class="py-3 px-4">
            <div class="font-semibold text-century-charcoal text-xs">${cleanMerchant}</div>
            <div class="text-[11px] text-century-muted truncate max-w-md">${tx.description}</div>
          </td>
          <td class="py-3 px-4 whitespace-nowrap">${tripHtml}</td>
          <td class="py-3 px-4 text-century-muted text-[11px] whitespace-nowrap font-mono">${tx.statement_file || ''}</td>
          <td class="py-3 px-4 text-right font-bold text-xs whitespace-nowrap ${amtColor}">${amtFormatted}</td>
          <td class="py-3 px-4 text-center">
            <button onclick="openCategoryModal('${tx.id}')" title="Changer la catégorie ou le séjour" class="p-1 rounded text-century-muted hover:text-century-charcoal hover:bg-[#EAEAE5] transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    function openCategoryModal(txId) {
      if (!AppState.data || !AppState.data.transactions) return;
      const tx = AppState.data.transactions.find(t => t.id === txId);
      if (!tx) return;

      AppState.editingTxId = txId;
      document.getElementById('modal-tx-desc').textContent = tx.merchant || tx.description;
      document.getElementById('modal-tx-meta').textContent = `${tx.date} • ${formatFR(tx.amount, true)}`;
      document.getElementById('modal-category-select').value = tx.category;

      // Populate merchant name field
      const merchantInput = document.getElementById('modal-tx-merchant');
      if (merchantInput) {
        const genericMerchants = ['divers', 'autre', 'restauration & sorties', 'restaurants & sorties'];
        const currentMerchant = tx.merchant || '';
        merchantInput.value = genericMerchants.includes(currentMerchant.toLowerCase()) ? '' : currentMerchant;
      }

      const tripSelect = document.getElementById('modal-holiday-trip-select');
      if (tripSelect) {
        tripSelect.innerHTML = '<option value="">-- Aucun séjour associé --</option>';
        const trips = (AppState.data && AppState.data.holiday_trips) ? AppState.data.holiday_trips : [];
        trips.forEach(tr => {
          const opt = document.createElement('option');
          opt.value = tr.id;
          opt.textContent = `${tr.icon || '🌴'} ${tr.name} (${tr.destination || 'Sans destination'})`;
          tripSelect.appendChild(opt);
        });
        tripSelect.value = tx.holiday_trip_id || '';
      }
      
      let rawDesc = tx.description || "";
      let clean = rawDesc.replace(/^(?:CARTE\s+X\d+\s+\d\d\/\d\d\s+|PAIEMENT\s+CB\s+\d\d\/\d\d\s+|VIR\s+EUROPEEN\s+EMIS\s+LOGITEL\s+POUR:\s+|VIREMENT\s+SEPA\s+EMIS\s+|PRELEVEMENT\s+SEPA\s+|COTISATION\s+)/i, "").trim();
      let kwProposal = tx.merchant && tx.merchant.toUpperCase() !== "DIVERS" 
        ? tx.merchant 
        : (clean ? clean.split(/\s+/)[0] : "");
      
      if (kwProposal.toUpperCase() === "DIVERS") kwProposal = "";

      document.getElementById('modal-rule-keyword').value = kwProposal;
      document.getElementById('modal-remember-rule').checked = true;

      document.getElementById('category-edit-modal').classList.remove('hidden');
    }

    function closeCategoryModal() {
      document.getElementById('category-edit-modal').classList.add('hidden');
      AppState.editingTxId = null;
    }

    async function saveCategoryModalChange() {
      if (!AppState.editingTxId) return;

      const newCategory = document.getElementById('modal-category-select').value;
      const holidayTripId = document.getElementById('modal-holiday-trip-select') 
        ? document.getElementById('modal-holiday-trip-select').value 
        : '';
      const remember = document.getElementById('modal-remember-rule').checked;
      const customKw = document.getElementById('modal-rule-keyword').value.trim();
      const newMerchant = (document.getElementById('modal-tx-merchant')?.value || '').trim();

      try {
        const res = await fetch('/api/update-category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: AppState.editingTxId,
            category: newCategory,
            holiday_trip_id: holidayTripId,
            remember_rule: remember,
            pattern: customKw,
            merchant: newMerchant || undefined,
            workspace: AppState.activeWorkspace || 'default'
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          closeCategoryModal();
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

    // ─── Bulk Transaction Selection (Main Transactions Table) ────────────────────

    /** Populate the bulk-action category dropdown from CATEGORIES list */
    function populateBulkCategorySelect(selectId) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const cats = (AppState.data && AppState.data.categories) ? AppState.data.categories : [];
      const icons = (AppState.data && AppState.data.category_icons) ? AppState.data.category_icons : {};
      sel.innerHTML = '<option value="">— Choisir une catégorie —</option>';
      cats.forEach(catName => {
        const opt = document.createElement('option');
        opt.value = catName;
        opt.textContent = `${icons[catName] || '📦'} ${catName}`;
        sel.appendChild(opt);
      });
    }

    /** Get IDs of all checked rows in a tbody */
    function getCheckedTxIds(tbodyId) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return [];
      return Array.from(tbody.querySelectorAll('input.tx-select-checkbox:checked')).map(cb => cb.dataset.id);
    }

    /** Update the bulk action bar visibility and count label */
    function updateTxBulkBar() {
      const ids = getCheckedTxIds('transactions-table-body');
      const bar = document.getElementById('tx-bulk-action-bar');
      const countEl = document.getElementById('tx-bulk-count');
      if (!bar) return;
      if (ids.length > 0) {
        bar.classList.remove('hidden');
        countEl.textContent = `${ids.length} opération(s) sélectionnée(s)`;
        populateBulkCategorySelect('tx-bulk-category-select');
      } else {
        bar.classList.add('hidden');
        const selAll = document.getElementById('tx-select-all');
        if (selAll) selAll.checked = false;
      }
    }

    function toggleSelectAllTransactions(checked) {
      const tbody = document.getElementById('transactions-table-body');
      if (!tbody) return;
      tbody.querySelectorAll('input.tx-select-checkbox').forEach(cb => { cb.checked = checked; });
      updateTxBulkBar();
    }

    function clearTxSelection() {
      const tbody = document.getElementById('transactions-table-body');
      if (tbody) tbody.querySelectorAll('input.tx-select-checkbox').forEach(cb => { cb.checked = false; });
      const selAll = document.getElementById('tx-select-all');
      if (selAll) selAll.checked = false;
      const bar = document.getElementById('tx-bulk-action-bar');
      if (bar) bar.classList.add('hidden');
    }

    async function bulkUpdateSelectedTransactions() {
      const ids = getCheckedTxIds('transactions-table-body');
      const category = document.getElementById('tx-bulk-category-select')?.value;
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
          clearTxSelection();
          loadDashboardData();
        } else {
          alert('Erreur lors de la mise à jour : ' + (json.error || 'Inconnue'));
        }
      } catch (err) {
        console.error(err);
        alert('Erreur réseau lors de la mise à jour groupée.');
      }
    }

