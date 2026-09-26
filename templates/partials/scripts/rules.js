// ========================================================
// VIEW 8: RULES & KEYWORDS ENGINE
// ========================================================
    // Render View 7: Rules & Keywords
    function renderRules(data) {
      const rules = data.user_rules || [];
      document.getElementById('rules-count-badge').textContent = `${rules.length} règles`;

      const tbody = document.getElementById('rules-table-body');
      tbody.innerHTML = '';

      rules.forEach(r => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-[#FAF9F5] transition';
        row.innerHTML = `
          <td class="py-3 px-6 font-mono font-bold text-xs text-century-charcoal">${r.pattern}</td>
          <td class="py-3 px-6">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#E8F0EC] text-[#2D5A3C]">
              ${r.category}
            </span>
          </td>
          <td class="py-3 px-6 text-century-muted text-xs">${r.merchant || r.pattern}</td>
        `;
        tbody.appendChild(row);
      });
    }

    async function handleAddNewRule(e) {
      e.preventDefault();
      const pattern = document.getElementById('new-rule-pattern').value.trim();
      const category = document.getElementById('new-rule-category').value;
      const merchant = document.getElementById('new-rule-merchant').value.trim();

      if (!pattern) return;

      try {
        const res = await fetch('/api/custom-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pattern, category, merchant, workspace: AppState.activeWorkspace || 'default' })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          document.getElementById('new-rule-pattern').value = '';
          document.getElementById('new-rule-merchant').value = '';
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function triggerOllamaReclassify() {
      if (!confirm("Lancer la catégorisation intelligente locale avec le modèle Ollama (qwen2.5:7b) ?")) return;
      try {
        const res = await fetch('/api/reclassify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace: AppState.activeWorkspace || 'default' })
        });
        const json = await res.json();
        if (json.status === 'ok') {
          loadDashboardData();
        }
      } catch (err) {
        console.error(err);
      }
    }

