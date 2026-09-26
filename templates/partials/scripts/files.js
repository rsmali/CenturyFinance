// ========================================================
// VIEW 3 & 4: FILE MANAGEMENT & STATEMENT UPLOAD
// ========================================================
    // Render View 3: File Management (Screenshot 0)
    function renderFileManagement(data) {
      const meta = data.statements_meta || {};
      const files = data.statements_detailed || [];

      document.getElementById('fm-total-files').textContent = meta.total_files || files.length;
      document.getElementById('fm-processed').textContent = meta.processed || files.length;
      document.getElementById('fm-processing').textContent = meta.processing || 0;
      document.getElementById('fm-total-size').textContent = meta.total_size_formatted || `${meta.total_size_kb || 0} KB`;

      const listContainer = document.getElementById('file-management-list');
      if (!listContainer) return;
      listContainer.innerHTML = '';

      if (files.length === 0) {
        listContainer.innerHTML = `
          <div class="c-card p-8 text-center text-xs text-century-muted">
            Aucun relevé PDF n'est actuellement chargé. Utilisez l'onglet Import de Relevés pour ajouter vos fichiers.
          </div>
        `;
        return;
      }

      files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'c-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4';
        card.innerHTML = `
          <div class="flex items-start md:items-center space-x-4">
            <div class="w-12 h-12 rounded-xl bg-[#E8F0EC] text-[#2D5A3C] flex items-center justify-center shrink-0">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div>
              <div class="flex items-center space-x-2.5 flex-wrap">
                <span class="font-sans font-bold text-sm text-century-charcoal">${f.filename}</span>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F0EC] text-[#2D5A3C]">✓ Traité</span>
              </div>
              <div class="text-xs text-century-muted mt-1 space-x-2">
                <span>Taille : ${f.size_formatted}</span>
                <span>•</span>
                <span>Type : PDF</span>
                <span>•</span>
                <span>Importé le : ${f.uploaded_date}</span>
              </div>
              <div class="text-xs text-[#555E58] mt-0.5 font-medium">
                ${f.tx_count} opération(s) extraite(s)
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-2 self-end md:self-center">
            <button onclick="reprocessStatement('${f.filename}')" title="Retraiter le relevé" class="p-2 rounded-lg border border-[#EAEAE5] bg-white text-century-muted hover:text-century-charcoal hover:bg-[#F6F6F2] transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            <button onclick="deleteStatement('${f.filename}')" title="Supprimer le relevé" class="p-2 rounded-lg border border-[#FCDADF] bg-white text-[#6E2D38] hover:bg-[#FDF0F2] transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        `;
        listContainer.appendChild(card);
      });
    }

    async function reprocessStatement(filename) {
      try {
        const res = await fetch('/api/reprocess-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, workspace: AppState.activeWorkspace || 'default' })
        });
        const data = await res.json();
        if (data.status === 'ok') {
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function deleteStatement(filename) {
      if (!confirm(`Supprimer définitivement le relevé ${filename} ?`)) return;
      try {
        const res = await fetch('/api/delete-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, workspace: AppState.activeWorkspace || 'default' })
        });
        const data = await res.json();
        if (data.status === 'ok') {
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function handleMultiplePDFUpload(input) {
      const files = input.files;
      if (!files || files.length === 0) return;

      const formData = new FormData();
      formData.append('workspace', AppState.activeWorkspace || 'default');
      for (let i = 0; i < files.length; i++) {
        formData.append('pdf', files[i]);
      }

      const statusBox = document.getElementById('upload-status-box');
      if (statusBox) {
        statusBox.classList.remove('hidden');
        statusBox.textContent = `Téléchargement et analyse de ${files.length} relevé(s) en cours...`;
      }

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        if (json.status === 'ok') {
          if (statusBox) statusBox.textContent = `✓ ${json.saved_count} relevé(s) analysé(s) avec succès !`;
          input.value = '';
          loadDashboardData();
          setTimeout(() => switchView('files'), 800);
        } else {
          if (statusBox) statusBox.textContent = `Erreur: ${json.error || 'Échec de traitement'}`;
        }
      } catch (err) {
        if (statusBox) statusBox.textContent = `Erreur de communication avec le serveur.`;
      }
    }

