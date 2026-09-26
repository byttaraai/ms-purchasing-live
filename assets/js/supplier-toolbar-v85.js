/* Build 85: table-local search tools. Presentation and view controls only.
   Reuses the existing inputs, selection handlers and server-authoritative Quest engine. */
(function () {
  'use strict';
  const render = window.supplierQuestRender;
  const paint = window.sqPaintControls;
  const updateCount = window.sqUpdateContentCount;
  const bound = new WeakSet();
  let current = null;
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;

  function button(id, text, className) {
    const el = document.createElement('button');
    el.id = id; el.type = 'button'; el.className = 'sq-btn ' + className;
    el.textContent = text; return el;
  }
  function valid() { return current && current.row.isConnected && current.dialog.open; }
  function setOpen(open, focus) {
    if (!valid() || !current.tools) return;
    const c = current;
    c.open = c.compact && open;
    c.row.classList.toggle('sq85-filter-open', c.open);
    c.tools.hidden = c.compact && !c.open;
    c.tools.inert = c.tools.hidden;
    c.toggle.setAttribute('aria-expanded', String(c.open));
    if (focus) (c.open ? c.search : c.toggle)?.focus({preventScroll:true});
  }
  function layout() {
    if (!valid() || !current.tools) return;
    const c = current, wasCompact = c.compact;
    // Use the actual white workspace width, not only the screen width.
    const minimum = c.kind === 'data' ? 750 : c.kind === 'decision' ? 660 : 805;
    c.compact = innerWidth < 980 || c.row.clientWidth < minimum;
    const inside = c.tools.contains(document.activeElement);
    c.row.classList.toggle('sq85-compact', c.compact);
    c.toggle.hidden = !c.compact;
    if (wasCompact !== c.compact) c.open = c.compact && (inside || wasCompact === null && c.open);
    setOpen(c.open, false);
  }
  function sync() {
    if (!valid() || !current.tools) return;
    const c = current, ui = SupplierQuestUI;
    const query = String(ui.query || '').trim();
    let rows, visible;
    if (c.kind === 'data') {
      rows = sqDataRows(ui.task).filter(r => ui.dataView === 'resolved' ? !(r.needs_review || r.blocking_review) : r.needs_review || r.blocking_review);
      visible = rows.filter(r => sqMatches(r, query));
    } else {
      rows = supplierQuestStageRows(ui.task, supplierQuestStage());
      visible = sqVisibleRows(rows);
    }
    const filtered = Boolean(query || ui.selectedOnly);
    const text = filtered ? visible.length + ' of ' + rows.length : rows.length + (rows.length === 1 ? ' product' : ' products');
    if (c.count.textContent !== text) c.count.textContent = text;
    c.count.classList.toggle('sq85-filtered-count', filtered);
    c.count.setAttribute('aria-label', visible.length + ' of ' + rows.length + ' products visible');
    c.toggle.classList.toggle('sq85-filtered', filtered);
    c.toggle.setAttribute('aria-label', 'Search & Filter' + (filtered ? ' - filters active' : ''));
    c.toggle.disabled = Boolean(ui.busy);
    c.clearSearch.hidden = !c.search.value;
    c.clearSearch.disabled = Boolean(ui.busy) || !c.search.value;
  }
  function bind(dialog) {
    if (bound.has(dialog)) return;
    bound.add(dialog);
    dialog.addEventListener('keydown', e => {
      if (!valid() || !current.open || e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation(); setOpen(false, true);
    }, true);
    dialog.addEventListener('pointerdown', e => {
      if (!valid() || !current.open || current.tools.contains(e.target) || current.toggle.contains(e.target)) return;
      setOpen(false, false);
    }, true);
    dialog.addEventListener('focusin', e => {
      if (!valid() || !current.open || current.tools.contains(e.target) || current.toggle.contains(e.target)) return;
      setOpen(false, false);
    });
    dialog.addEventListener('change', e => {
      // Select-all-visible must also refresh an active selected-only view.
      if (e.target.id === 'supplierQuestSelectAll' && SupplierQuestUI.selectedOnly) sqUpdateContent();
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return; // Ignore a queued close from an earlier opening.
      observer?.disconnect(); current = null;
    });
  }
  function install(dialog) {
    if (!dialog?.classList.contains('sq84')) return;
    const row = dialog.querySelector('.sq83-workspace .sq-stage-title');
    if (!row || row.querySelector('.sq85-identity')) return;
    const key = sqStageKey(SupplierQuestUI.task, supplierQuestStage());
    const previousOpen = current?.key === key && current.open;
    observer?.disconnect();
    const tools = dialog.querySelector('.sq-tools');
    const count = row.querySelector(':scope > .sq-chip');
    const title = row.querySelector(':scope > div');
    const identity = document.createElement('div'); identity.className = 'sq85-identity';
    identity.append(title, count); row.prepend(identity);
    const stages = document.getElementById('supplierQuestControlsToggle');
    if (stages) {
      stages.textContent = 'Stages'; stages.title = 'Supplier stages and review details';
      stages.setAttribute('aria-label', 'Supplier stages and review details');
    }
    dialog.classList.add('sq85');
    if (!tools) { current = null; return; }
    tools.id = 'supplierQuestTableTools';
    tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Product table search and filters');
    const toggle = button('supplierQuestFilterToggle', 'Search & Filter', 'sq85-filter-toggle');
    toggle.setAttribute('aria-controls', tools.id); toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Search and filter the product table';
    row.insertBefore(tools, stages); row.insertBefore(toggle, stages);
    const visibleCount = document.getElementById('supplierQuestVisibleCount');
    if (visibleCount) visibleCount.hidden = true;
    count.id = 'supplierQuestTableCount'; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const search = document.getElementById('supplierQuestSearch');
    search.placeholder = 'Search product or code';
    const clearSearch = button('supplierQuestSearchClear', '\u00d7', 'sq85-search-clear');
    clearSearch.setAttribute('aria-label', 'Clear product search'); clearSearch.title = 'Clear product search';
    clearSearch.hidden = !search.value;
    search.parentElement.append(clearSearch);
    clearSearch.onclick = () => {
      if (SupplierQuestUI.busy) return;
      search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true})); search.focus({preventScroll:true});
    };
    const clear = document.getElementById('supplierQuestClear');
    if (clear) {
      clear.title = 'Clear all selected products in this stage, including hidden selections';
      clear.setAttribute('aria-label', clear.title);
    }
    current = {dialog, row, tools, count, toggle, search, clearSearch, key, kind:supplierQuestCurrentStageDef().kind, compact:null, open:Boolean(previousOpen)};
    toggle.onclick = () => setOpen(!current.open, !current.open);
    bind(dialog); layout(); sync();
    observer?.observe(row);
  }
  window.supplierQuestRender = function (...args) {
    const result = render.apply(this, args);
    install(result?.dialog || document.getElementById('supplierTaskDialog'));
    return result;
  };
  window.renderSupplierTaskPopup = window.supplierQuestRender;
  window.sqPaintControls = function (...args) {
    const result = paint.apply(this, args); sync(); return result;
  };
  window.sqUpdateContentCount = function (...args) {
    const result = updateCount.apply(this, args); sync(); return result;
  };
  addEventListener('resize', layout);
})();
