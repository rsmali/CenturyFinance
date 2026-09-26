// ========================================================
// WORKSPACE & MULTI-ACCOUNT MANAGEMENT
// ========================================================
    // Workspace / Multi-Account Management
    function renderWorkspaceSwitcher(data) {
      const activeWs = data.workspace || { id: 'default', name: 'Compte Principal (SG)', icon: '🏦' };
      const allWorkspaces = data.workspaces || [activeWs];
      const pdfCount = (data.statements_detailed && data.statements_detailed.length) 
        ? data.statements_detailed.length 
        : (data.statements ? data.statements.length : 0);

      const iconEl = document.getElementById('active-ws-icon');
      const nameEl = document.getElementById('active-ws-name');
      const countEl = document.getElementById('active-ws-count');
      if (iconEl) iconEl.textContent = activeWs.icon || '🏦';
      if (nameEl) nameEl.textContent = activeWs.name || 'Compte Principal (SG)';
      if (countEl) countEl.textContent = `${pdfCount} relevé${pdfCount > 1 ? 's' : ''} PDF`;

      const itemsContainer = document.getElementById('workspace-dropdown-items');
      if (!itemsContainer) return;
      itemsContainer.innerHTML = '';

      allWorkspaces.forEach(ws => {
        const isCurrent = ws.id === activeWs.id;
        const item = document.createElement('div');
        item.className = `flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition ${
          isCurrent ? 'bg-[#E8F0EC] text-[#2D5A3C] font-semibold' : 'hover:bg-[#FAF9F5] text-century-charcoal'
        }`;
        
        const deleteBtnHtml = (ws.id !== 'default') 
          ? `<button type="button" onclick="deleteWorkspacePrompt(event, '${ws.id}', '${(ws.name || '').replace(/'/g, "\\'")}')" title="Supprimer cet espace" class="p-1 rounded text-century-muted hover:text-red-600 hover:bg-red-50 transition ml-2">
               <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
             </button>`
          : '';

        item.innerHTML = `
          <div class="flex items-center space-x-2.5 truncate flex-1" onclick="switchWorkspace('${ws.id}')">
            <span class="text-base">${ws.icon || '📁'}</span>
            <div class="truncate">
              <span class="text-xs truncate block">${ws.name}</span>
              <span class="text-[10px] text-century-muted block">${ws.account_type || 'Compte'}</span>
            </div>
          </div>
          <div class="flex items-center shrink-0">
            ${isCurrent ? '<span class="text-xs font-bold text-[#2D5A3C] ml-1">✓</span>' : ''}
            ${deleteBtnHtml}
          </div>
        `;
        itemsContainer.appendChild(item);
      });
    }

    function toggleWorkspaceDropdown(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('workspace-dropdown-menu');
      if (menu) menu.classList.toggle('hidden');
    }

    // Close workspace dropdown when clicking outside
    window.addEventListener('click', (e) => {
      const btn = document.getElementById('workspace-switcher-btn');
      const menu = document.getElementById('workspace-dropdown-menu');
      if (menu && !menu.classList.contains('hidden') && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    function switchWorkspace(wsId) {
      AppState.activeWorkspace = wsId;
      try { localStorage.setItem('cf_active_workspace', wsId); } catch (e) {}
      const menu = document.getElementById('workspace-dropdown-menu');
      if (menu) menu.classList.add('hidden');
      closeCategoryDetail();
      AppState.budget = null;
      loadDashboardData();
    }

    function openCreateWorkspaceModal() {
      const modal = document.getElementById('workspace-create-modal');
      const menu = document.getElementById('workspace-dropdown-menu');
      if (menu) menu.classList.add('hidden');
      if (modal) modal.classList.remove('hidden');
    }

    function closeCreateWorkspaceModal() {
      const modal = document.getElementById('workspace-create-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function handleCreateWorkspaceSubmit(e) {
      e.preventDefault();
      const name = (document.getElementById('ws-new-name').value || '').trim();
      const accType = document.getElementById('ws-new-type').value;
      const icon = document.getElementById('ws-new-icon').value;

      if (!name) return;

      try {
        const res = await fetch('/api/workspaces/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, account_type: accType, icon })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          closeCreateWorkspaceModal();
          document.getElementById('ws-new-name').value = '';
          switchWorkspace(json.workspace.id);
        } else {
          alert(`Erreur: ${json.error || "Impossible de créer l'espace"}`);
        }
      } catch (err) {
        alert("Erreur de communication lors de la création de l'espace");
      }
    }

    async function deleteWorkspacePrompt(e, wsId, wsName) {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement l'espace "${wsName}" ainsi que tous ses relevés PDF ?`)) return;

      try {
        const res = await fetch('/api/workspaces/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: wsId })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          if (AppState.activeWorkspace === wsId) {
            AppState.activeWorkspace = 'default';
          }
          loadDashboardData();
        } else {
          alert(`Erreur: ${json.error || "Impossible de supprimer l'espace"}`);
        }
      } catch (err) {
        console.error(err);
      }
    }


    function openWorkspaceSettingsModal() {
      const menu = document.getElementById('workspace-dropdown-menu');
      if (menu) menu.classList.add('hidden');

      const modal = document.getElementById('workspace-profile-modal');
      if (!modal) return;

      const profile = (AppState.data && AppState.data.workspace && AppState.data.workspace.profile) 
        ? AppState.data.workspace.profile 
        : {
            salary_employer_name: '',
            salary_keywords: ['SALAIRE', 'REMUNERATION', 'PAYE'],
            account_holder_keywords: [],
            rent_keywords: ['LOYER', 'RENT'],
            family_keywords: [],
            investment_accounts: [
              { id: 'livret_a', name: 'Livret A', keywords: ['LIVRET', 'RETRAIT LIVRET'] },
              { id: 'cto', name: 'CTO / Bourse', keywords: ['INTERACTIVE', 'IBKR', 'CTO'] }
            ]
          };

      document.getElementById('prof-emp-name').value = profile.salary_employer_name || '';
      document.getElementById('prof-salary-keywords').value = (profile.salary_keywords || []).join(', ');
      document.getElementById('prof-holder-keywords').value = (profile.account_holder_keywords || []).join(', ');
      document.getElementById('prof-rent-keywords').value = (profile.rent_keywords || []).join(', ');
      document.getElementById('prof-family-keywords').value = (profile.family_keywords || []).join(', ');

      renderInvestmentAccountRows(profile.investment_accounts || []);
      modal.classList.remove('hidden');
    }

    function closeWorkspaceSettingsModal() {
      const modal = document.getElementById('workspace-profile-modal');
      if (modal) modal.classList.add('hidden');
    }

    function renderInvestmentAccountRows(accounts) {
      const container = document.getElementById('prof-investment-accounts-list');
      if (!container) return;
      container.innerHTML = '';

      if (!accounts || accounts.length === 0) {
        accounts = [
          { id: 'livret_a', name: 'Livret A', keywords: ['LIVRET', 'RETRAIT LIVRET'] },
          { id: 'cto', name: 'CTO / Bourse', keywords: ['INTERACTIVE', 'IBKR', 'CTO'] }
        ];
      }

      accounts.forEach((acc) => {
        const row = document.createElement('div');
        row.className = 'investment-account-row flex items-center space-x-2 bg-[#FAF9F6] p-2 rounded-lg border border-[#EAEAE5]';
        row.innerHTML = `
          <input type="text" placeholder="Nom du compte (ex: Livret A)" value="${escapeHtml(acc.name || '')}" class="inv-acc-name w-1/3 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAEAE5] text-xs font-semibold text-century-charcoal focus:border-[#2D5A3C]">
          <input type="text" placeholder="Mots-clés (séparés par virgules)" value="${escapeHtml((acc.keywords || []).join(', '))}" class="inv-acc-keys flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAEAE5] text-xs text-century-charcoal focus:border-[#2D5A3C]">
          <button type="button" onclick="this.closest('.investment-account-row').remove()" class="p-1.5 rounded-lg text-century-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Supprimer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        `;
        container.appendChild(row);
      });
    }

    function addInvestmentAccountRow() {
      const container = document.getElementById('prof-investment-accounts-list');
      if (!container) return;
      const row = document.createElement('div');
      row.className = 'investment-account-row flex items-center space-x-2 bg-[#FAF9F6] p-2 rounded-lg border border-[#EAEAE5] animate-in fade-in duration-100';
      row.innerHTML = `
        <input type="text" placeholder="Nom du support (ex: PEA, Assurance Vie)" value="" class="inv-acc-name w-1/3 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAEAE5] text-xs font-semibold text-century-charcoal focus:border-[#2D5A3C]">
        <input type="text" placeholder="Mots-clés (séparés par virgules, ex: BOURSO, PEA)" value="" class="inv-acc-keys flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAEAE5] text-xs text-century-charcoal focus:border-[#2D5A3C]">
        <button type="button" onclick="this.closest('.investment-account-row').remove()" class="p-1.5 rounded-lg text-century-muted hover:text-rose-600 hover:bg-rose-50 transition" title="Supprimer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      `;
      container.appendChild(row);
    }

    function resetProfileToDefault() {
      if (!confirm("Réinitialiser le profil avec les paramètres par défaut ?")) return;
      document.getElementById('prof-emp-name').value = '';
      document.getElementById('prof-salary-keywords').value = 'SALAIRE, REMUNERATION, PAYE, VIREMENT SALAIRE';
      document.getElementById('prof-holder-keywords').value = '';
      document.getElementById('prof-rent-keywords').value = 'LOYER, RENT';
      document.getElementById('prof-family-keywords').value = '';
      renderInvestmentAccountRows([
        { id: 'livret_a', name: 'Livret A', keywords: ['LIVRET', 'RETRAIT LIVRET'] },
        { id: 'cto', name: 'CTO / Bourse', keywords: ['INTERACTIVE', 'IBKR', 'CTO'] }
      ]);
    }

    async function handleWorkspaceProfileSubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-save-workspace-profile');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin mr-1 inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>Recalcul en cours...</span>`;

      const parseCsv = (val) => (val || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

      const investmentAccounts = [];
      const rows = document.querySelectorAll('.investment-account-row');
      rows.forEach(r => {
        const name = (r.querySelector('.inv-acc-name')?.value || '').trim();
        const keys = parseCsv(r.querySelector('.inv-acc-keys')?.value || '');
        if (name) {
          const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          investmentAccounts.push({ id, name, keywords: keys });
        }
      });

      const updatedProfile = {
        salary_employer_name: (document.getElementById('prof-emp-name').value || '').trim(),
        salary_keywords: parseCsv(document.getElementById('prof-salary-keywords').value || ''),
        account_holder_keywords: parseCsv(document.getElementById('prof-holder-keywords').value || ''),
        rent_keywords: parseCsv(document.getElementById('prof-rent-keywords').value || ''),
        family_keywords: parseCsv(document.getElementById('prof-family-keywords').value || ''),
        investment_accounts: investmentAccounts
      };

      try {
        const res = await fetch('/api/workspace/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: AppState.activeWorkspace,
            profile: updatedProfile
          })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          closeWorkspaceSettingsModal();
          loadDashboardData();
        } else {
          alert(`Erreur: ${json.error || 'Impossible de mettre à jour le profil'}`);
        }
      } catch (err) {
        console.error(err);
        alert('Erreur réseau lors de la mise à jour du profil');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }

