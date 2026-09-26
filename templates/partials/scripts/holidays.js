// ========================================================
// VIEW 9: SÉJOURS & VACANCES (HOLIDAYS TRACKER)
// ========================================================
    // ========================================================
    // SÉJOURS & VACANCES (HOLIDAY TRIPS) LOGIC
    // ========================================================
    function renderHolidayTrips(data) {
      const trips = (data && data.holiday_trips) ? data.holiday_trips : [];
      const countEl = document.getElementById('holiday-kpi-count');
      const spentEl = document.getElementById('holiday-kpi-total-spent');
      const budgetEl = document.getElementById('holiday-kpi-total-budget');
      const avgEl = document.getElementById('holiday-kpi-avg-trip');

      let totalSpent = 0;
      let totalBudget = 0;
      trips.forEach(t => {
        totalSpent += (t.total_spent || 0);
        totalBudget += (t.budget || 0);
      });
      const avgSpent = trips.length > 0 ? (totalSpent / trips.length) : 0;

      if (countEl) countEl.textContent = trips.length;
      if (spentEl) spentEl.textContent = formatFR(totalSpent);
      if (budgetEl) budgetEl.textContent = formatFR(totalBudget);
      if (avgEl) avgEl.textContent = formatFR(avgSpent);

      const grid = document.getElementById('holiday-trips-grid');
      const emptyState = document.getElementById('holiday-trips-empty-state');
      if (!grid) return;

      grid.innerHTML = '';
      if (trips.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }
      if (emptyState) emptyState.classList.add('hidden');

      trips.forEach(trip => {
        const card = document.createElement('div');
        card.className = 'c-card p-6 space-y-5 border-t-4 transition duration-200 hover:shadow-md';
        card.style.borderTopColor = trip.color || '#366B80';

        const hasBudget = (trip.budget || 0) > 0;
        const spent = trip.total_spent || 0;
        const budget = trip.budget || 0;
        const pct = hasBudget ? Math.round((spent / budget) * 100) : 0;
        const remaining = Math.max(0, budget - spent);
        const overBudget = spent > budget && hasBudget;

        // Progress color
        let barColor = 'bg-[#10b981]';
        if (pct > 100) barColor = 'bg-[#f43f5e]';
        else if (pct >= 85) barColor = 'bg-[#f59e0b]';

        // Date string
        let dateLabel = "Dates non définies";
        if (trip.date_start && trip.date_end) {
          const ds = trip.date_start.split('-').reverse().join('/');
          const de = trip.date_end.split('-').reverse().join('/');
          dateLabel = `Du ${ds} au ${de}`;
        } else if (trip.date_start) {
          dateLabel = `À partir du ${trip.date_start.split('-').reverse().join('/')}`;
        }

        // Top categories badges
        const catEntries = Object.entries(trip.categories || {}).sort((a, b) => b[1] - a[1]);
        const catBadgesHtml = catEntries.length > 0 
          ? catEntries.map(([cat, amt]) => `
              <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FAF9F5] border border-[#EAEAE5] text-century-charcoal">
                <span>${cat}</span>
                <span class="font-bold font-sans text-century-muted">${formatFR(amt)}</span>
              </span>
            `).join('')
          : '<span class="text-xs text-century-muted italic">Aucune dépense catégorisée</span>';

        // Transactions belonging to this trip
        const tripTxs = (data.transactions || []).filter(t => t.holiday_trip_id === trip.id);

        let txListHtml = '';
        if (tripTxs.length > 0) {
          txListHtml = `
            <div id="trip-txs-${trip.id}" class="hidden pt-3 border-t border-[#EAEAE5] space-y-2">
              <div class="text-[11px] font-semibold text-century-muted uppercase tracking-wider mb-1">Dépenses associées à ce séjour</div>
              <div class="max-h-48 overflow-y-auto divide-y divide-[#EAEAE5]/60 border border-[#EAEAE5] rounded-xl bg-[#FAF9F6]">
                ${tripTxs.map(t => `
                  <div class="flex items-center justify-between p-2.5 text-xs hover:bg-white transition">
                    <div class="flex items-center space-x-2 truncate flex-1 min-w-0 pr-2">
                      <span class="font-mono text-[11px] text-century-muted shrink-0">${t.date}</span>
                      <span class="truncate font-semibold text-century-charcoal">${escapeHtml(t.merchant || t.description)}</span>
                      <span class="text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium" style="background-color: ${t.color || '#8C8D89'}15; color: ${t.color || '#64748B'};">${t.category}</span>
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                      <span class="font-bold text-xs font-sans text-[#6E2D38]">${formatFR(t.amount, true)}</span>
                      <button onclick="removeTxFromHolidayTrip('${trip.id}', '${t.id}')" title="Détacher cette opération du séjour" class="p-1 text-century-muted hover:text-red-600 transition">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        card.innerHTML = `
          <!-- Header -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start space-x-3">
              <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-xs" style="background-color: ${trip.color || '#366B80'}18;">
                ${trip.icon || '🏖️'}
              </div>
              <div>
                <h3 class="font-serif-title text-lg font-bold text-century-charcoal leading-snug">${escapeHtml(trip.name)}</h3>
                <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-century-muted">
                  ${trip.destination ? `
                    <span class="inline-flex items-center space-x-1">
                      <svg class="w-3.5 h-3.5 text-century-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <span>${escapeHtml(trip.destination)}</span>
                    </span>
                    <span>•</span>
                  ` : ''}
                  <span class="inline-flex items-center space-x-1 font-mono text-[11px]">
                    <svg class="w-3.5 h-3.5 text-century-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span>${dateLabel}</span>
                  </span>
                </div>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center space-x-1 shrink-0">
              <button onclick="openHolidayTripModal('${trip.id}')" title="Modifier le séjour" class="p-1.5 rounded-lg text-century-muted hover:text-century-charcoal hover:bg-[#FAF9F5] border border-transparent hover:border-[#EAEAE5] transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button onclick="deleteHolidayTrip('${trip.id}')" title="Supprimer le séjour" class="p-1.5 rounded-lg text-century-muted hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <!-- Notes (if any) -->
          ${trip.notes ? `<p class="text-xs text-century-muted italic bg-[#FAF9F6] p-2.5 rounded-xl border border-[#EAEAE5]/60">${escapeHtml(trip.notes)}</p>` : ''}

          <!-- Financial status & Progress -->
          <div class="space-y-2 pt-1">
            <div class="flex items-baseline justify-between text-xs">
              <div>
                <span class="text-century-muted block text-[11px]">Dépensé</span>
                <span class="font-bold font-sans text-lg text-century-charcoal">${formatFR(spent)}</span>
              </div>
              <div class="text-right">
                <span class="text-century-muted block text-[11px]">Budget prévisionnel</span>
                <span class="font-bold font-sans text-sm ${hasBudget ? 'text-century-charcoal' : 'text-century-muted'}">
                  ${hasBudget ? formatFR(budget) : 'Non défini'}
                </span>
              </div>
            </div>

            ${hasBudget ? `
              <div class="space-y-1">
                <div class="h-2 rounded-full bg-[#EAEAE5] overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300 ${barColor}" style="width: ${Math.min(100, pct)}%"></div>
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-medium ${overBudget ? 'text-red-600 font-semibold' : 'text-century-muted'}">
                    ${overBudget ? `Dépassement de ${formatFR(spent - budget)} (+${pct - 100}%)` : `${pct}% consommé`}
                  </span>
                  <span class="text-century-muted font-medium">
                    ${!overBudget ? `Reste ${formatFR(remaining)}` : ''}
                  </span>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Breakdown per Category -->
          <div class="space-y-1.5 pt-1">
            <div class="text-[11px] font-semibold text-century-muted uppercase tracking-wider">Répartition des dépenses</div>
            <div class="flex flex-wrap gap-1.5">
              ${catBadgesHtml}
            </div>
          </div>

          <!-- Toggle Transactions List & Assign Button -->
          <div class="pt-2 border-t border-[#EAEAE5] flex items-center justify-between">
            ${tripTxs.length > 0 ? `
              <button onclick="toggleTripTxCollapse('${trip.id}')" class="text-xs font-semibold text-[#2D5A3C] hover:underline flex items-center space-x-1">
                <span id="trip-txs-btn-text-${trip.id}">Voir les ${tripTxs.length} opération${tripTxs.length > 1 ? 's' : ''}</span>
                <svg id="trip-txs-arrow-${trip.id}" class="w-3.5 h-3.5 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
            ` : `
              <span class="text-xs text-century-muted italic">0 opération rattachée</span>
            `}

            <button onclick="openHolidayAssignModal('${trip.id}')" class="px-3 py-1.5 rounded-lg border border-[#2D5A3C]/30 text-[#2D5A3C] bg-[#E8F0EC]/50 hover:bg-[#E8F0EC] text-xs font-semibold transition flex items-center space-x-1.5 shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              <span>Rattacher des dépenses</span>
            </button>
          </div>

          <!-- Collapsible Tx List -->
          ${txListHtml}
        `;

        grid.appendChild(card);
      });
    }

    function toggleTripTxCollapse(tripId) {
      const el = document.getElementById(`trip-txs-${tripId}`);
      const arrow = document.getElementById(`trip-txs-arrow-${tripId}`);
      if (!el) return;
      el.classList.toggle('hidden');
      if (arrow) arrow.classList.toggle('rotate-180');
    }

    function openHolidayTripModal(tripId) {
      const modal = document.getElementById('holiday-trip-modal');
      const titleEl = document.getElementById('holiday-modal-title');
      const idInput = document.getElementById('holiday-trip-edit-id');
      const nameInput = document.getElementById('holiday-trip-name');
      const destInput = document.getElementById('holiday-trip-destination');
      const startInput = document.getElementById('holiday-trip-start');
      const endInput = document.getElementById('holiday-trip-end');
      const budgetInput = document.getElementById('holiday-trip-budget');
      const iconInput = document.getElementById('holiday-trip-icon');
      const colorInput = document.getElementById('holiday-trip-color');
      const notesInput = document.getElementById('holiday-trip-notes');
      const autoAssignInput = document.getElementById('holiday-trip-auto-assign');
      const iconPrev = document.getElementById('holiday-modal-icon-preview');

      if (tripId && AppState.data && AppState.data.holiday_trips) {
        const trip = AppState.data.holiday_trips.find(t => t.id === tripId);
        if (trip) {
          if (titleEl) titleEl.textContent = "Modifier le Séjour / Voyage";
          if (idInput) idInput.value = trip.id;
          if (nameInput) nameInput.value = trip.name || '';
          if (destInput) destInput.value = trip.destination || '';
          if (startInput) startInput.value = trip.date_start || '';
          if (endInput) endInput.value = trip.date_end || '';
          if (budgetInput) budgetInput.value = trip.budget > 0 ? trip.budget : '';
          if (iconInput) iconInput.value = trip.icon || '🏖️';
          if (colorInput) colorInput.value = trip.color || '#366B80';
          if (notesInput) notesInput.value = trip.notes || '';
          if (autoAssignInput) autoAssignInput.checked = false;
          if (iconPrev) iconPrev.textContent = trip.icon || '🏖️';
          if (modal) modal.classList.remove('hidden');
          return;
        }
      }

      // New trip
      if (titleEl) titleEl.textContent = "Nouveau Séjour / Voyage";
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (destInput) destInput.value = '';
      if (startInput) startInput.value = '';
      if (endInput) endInput.value = '';
      if (budgetInput) budgetInput.value = '';
      if (iconInput) iconInput.value = '🏖️';
      if (colorInput) colorInput.value = '#0ea5e9';
      if (notesInput) notesInput.value = '';
      if (autoAssignInput) autoAssignInput.checked = false;
      if (iconPrev) iconPrev.textContent = '🏖️';
      if (modal) modal.classList.remove('hidden');
    }

    function closeHolidayTripModal() {
      const modal = document.getElementById('holiday-trip-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function handleHolidayTripSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('holiday-trip-edit-id')?.value || '';
      const name = (document.getElementById('holiday-trip-name')?.value || '').trim();
      const destination = (document.getElementById('holiday-trip-destination')?.value || '').trim();
      const date_start = document.getElementById('holiday-trip-start')?.value || '';
      const date_end = document.getElementById('holiday-trip-end')?.value || '';
      const budget = parseFloat(document.getElementById('holiday-trip-budget')?.value) || 0;
      const icon = document.getElementById('holiday-trip-icon')?.value || '🏖️';
      const color = document.getElementById('holiday-trip-color')?.value || '#0ea5e9';
      const notes = (document.getElementById('holiday-trip-notes')?.value || '').trim();
      const auto_assign_dates = document.getElementById('holiday-trip-auto-assign')?.checked || false;

      if (!name) return;

      try {
        const res = await fetch('/api/holiday-trips/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: AppState.activeWorkspace || 'default',
            id,
            name,
            destination,
            date_start,
            date_end,
            budget,
            icon,
            color,
            notes,
            auto_assign_dates
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          closeHolidayTripModal();
          loadDashboardData();
        } else {
          alert(`Erreur: ${json.error || "Impossible d'enregistrer le séjour"}`);
        }
      } catch (err) {
        alert("Erreur de communication avec le serveur.");
      }
    }

    async function deleteHolidayTrip(tripId) {
      if (!confirm("Voulez-vous vraiment supprimer ce séjour ? Les dépenses associées ne seront pas effacées mais simplement détachées de ce voyage.")) return;

      try {
        const res = await fetch('/api/holiday-trips/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: AppState.activeWorkspace || 'default',
            id: tripId
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          loadDashboardData();
        } else {
          alert(`Erreur: ${json.error || "Impossible de supprimer le séjour"}`);
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Holiday Assign Modal State & Methods
    AppState.holidayAssignState = {
      tripId: null,
      selectedTxIds: new Set()
    };

    function openHolidayAssignModal(tripId) {
      if (!AppState.data || !AppState.data.holiday_trips) return;
      const trip = AppState.data.holiday_trips.find(t => t.id === tripId);
      if (!trip) return;

      AppState.holidayAssignState.tripId = tripId;
      AppState.holidayAssignState.selectedTxIds = new Set(trip.transaction_ids || []);

      const modal = document.getElementById('holiday-assign-modal');
      const titleEl = document.getElementById('holiday-assign-modal-title');
      const subEl = document.getElementById('holiday-assign-modal-sub');
      const catSelect = document.getElementById('holiday-assign-cat-filter');
      const searchInput = document.getElementById('holiday-assign-search');

      if (titleEl) titleEl.textContent = `Associer des dépenses à « ${trip.name} »`;
      if (subEl) subEl.textContent = `Sélectionnez les dépenses à regrouper dans ce séjour de vacances`;
      if (searchInput) searchInput.value = '';

      if (catSelect) {
        catSelect.innerHTML = '<option value="ALL">Toutes les catégories</option>';
        (AppState.data.categories || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          catSelect.appendChild(opt);
        });
        catSelect.value = 'ALL';
      }

      filterHolidayAssignTransactions();
      if (modal) modal.classList.remove('hidden');
    }

    function closeHolidayAssignModal() {
      const modal = document.getElementById('holiday-assign-modal');
      if (modal) modal.classList.add('hidden');
      AppState.holidayAssignState.tripId = null;
      AppState.holidayAssignState.selectedTxIds.clear();
    }

    function filterHolidayAssignTransactions() {
      if (!AppState.data || !AppState.data.transactions) return;

      const q = (document.getElementById('holiday-assign-search')?.value || '').toLowerCase().trim();
      const cat = document.getElementById('holiday-assign-cat-filter')?.value || 'ALL';
      const currentTripId = AppState.holidayAssignState.tripId;

      const allTxs = AppState.data.transactions;
      const filtered = allTxs.filter(t => {
        const matchQ = !q || 
          (t.merchant && t.merchant.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.amount && t.amount.toString().includes(q));

        const matchCat = (cat === 'ALL') || (t.category === cat);
        return matchQ && matchCat;
      });

      const tbody = document.getElementById('holiday-assign-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-century-muted italic">Aucune opération trouvée pour ces critères</td></tr>`;
        updateHolidayAssignStats();
        return;
      }

      filtered.forEach(tx => {
        const isChecked = AppState.holidayAssignState.selectedTxIds.has(tx.id);
        const isOtherTrip = tx.holiday_trip_id && tx.holiday_trip_id !== currentTripId;
        const otherTrip = isOtherTrip ? AppState.data.holiday_trips.find(tr => tr.id === tx.holiday_trip_id) : null;

        const row = document.createElement('tr');
        row.className = `hover:bg-[#FAF9F5] transition cursor-pointer ${isChecked ? 'bg-[#F0FDF4]' : ''}`;
        row.onclick = (e) => {
          if (e.target.tagName.toLowerCase() === 'input') return;
          toggleHolidayAssignTx(tx.id);
        };

        row.innerHTML = `
          <td class="py-2.5 px-3 text-center">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleHolidayAssignTx('${tx.id}')" class="rounded border-[#CBD5E1] text-[#2D5A3C] focus:ring-[#2D5A3C] w-4 h-4 cursor-pointer">
          </td>
          <td class="py-2.5 px-3 font-mono text-[11px] text-century-muted whitespace-nowrap">${tx.date}</td>
          <td class="py-2.5 px-3">
            <div class="font-semibold text-century-charcoal truncate max-w-xs">${escapeHtml(tx.merchant || tx.description)}</div>
            ${otherTrip ? `<span class="text-[10px] text-amber-600 block">Déjà associé à : ${escapeHtml(otherTrip.name)}</span>` : ''}
          </td>
          <td class="py-2.5 px-3 whitespace-nowrap">
            <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style="background-color: ${tx.color}15; color: ${tx.color};">
              <span>${tx.icon || '📦'}</span>
              <span>${tx.category}</span>
            </span>
          </td>
          <td class="py-2.5 px-3 text-right font-bold text-xs whitespace-nowrap ${tx.type === 'Credit' ? 'text-[#2D5A3C]' : 'text-[#6E2D38]'}">
            ${formatFR(tx.amount, true)}
          </td>
        `;
        tbody.appendChild(row);
      });

      updateHolidayAssignStats();
    }

    function toggleHolidayAssignTx(txId) {
      if (AppState.holidayAssignState.selectedTxIds.has(txId)) {
        AppState.holidayAssignState.selectedTxIds.delete(txId);
      } else {
        AppState.holidayAssignState.selectedTxIds.add(txId);
      }
      filterHolidayAssignTransactions();
    }

    function toggleAllHolidayAssignTx() {
      const q = (document.getElementById('holiday-assign-search')?.value || '').toLowerCase().trim();
      const cat = document.getElementById('holiday-assign-cat-filter')?.value || 'ALL';

      const allTxs = AppState.data.transactions || [];
      const visible = allTxs.filter(t => {
        const matchQ = !q || 
          (t.merchant && t.merchant.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.amount && t.amount.toString().includes(q));
        const matchCat = (cat === 'ALL') || (t.category === cat);
        return matchQ && matchCat;
      });

      const allVisibleChecked = visible.every(t => AppState.holidayAssignState.selectedTxIds.has(t.id));

      if (allVisibleChecked) {
        visible.forEach(t => AppState.holidayAssignState.selectedTxIds.delete(t.id));
      } else {
        visible.forEach(t => AppState.holidayAssignState.selectedTxIds.add(t.id));
      }

      filterHolidayAssignTransactions();
    }

    function updateHolidayAssignStats() {
      const count = AppState.holidayAssignState.selectedTxIds.size;
      const statsEl = document.getElementById('holiday-assign-stats');
      if (statsEl) {
        let sum = 0;
        (AppState.data?.transactions || []).forEach(t => {
          if (AppState.holidayAssignState.selectedTxIds.has(t.id)) {
            sum += Math.abs(t.amount || 0);
          }
        });
        statsEl.textContent = `${count} opération${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''} (${formatFR(sum)})`;
      }
    }

    async function saveHolidayAssignSelection() {
      const tripId = AppState.holidayAssignState.tripId;
      if (!tripId) return;

      const txIds = Array.from(AppState.holidayAssignState.selectedTxIds);

      try {
        const res = await fetch('/api/holiday-trips/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: AppState.activeWorkspace || 'default',
            trip_id: tripId,
            transaction_ids: txIds
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          closeHolidayAssignModal();
          loadDashboardData();
        } else {
          alert(`Erreur: ${json.error || "Impossible d'associer les opérations"}`);
        }
      } catch (err) {
        alert("Erreur de communication avec le serveur.");
      }
    }

    async function removeTxFromHolidayTrip(tripId, txId) {
      if (!tripId || !txId) return;
      try {
        const res = await fetch('/api/update-category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: AppState.activeWorkspace || 'default',
            id: txId,
            holiday_trip_id: ''
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

