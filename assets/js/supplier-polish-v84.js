/* Build 84: presentation polish only. Retains the Build 82 engine and Build 83 layout. */
(function () {
  'use strict';
  const render = window.supplierQuestRender;
  const paint = window.sqPaintControls;
  if (typeof render !== 'function' || typeof paint !== 'function') throw new Error('Supplier Quest UI is required.');
  const bound = new WeakSet();
  const paths = {
    back: 'M19 12H5m7-7-7 7 7 7',
    next: 'M5 12h14m-7-7 7 7-7 7',
    print: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z',
    info: 'M12 11v6m0-10v.01'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false'); svg.classList.add('sq84-icon');
    if (name === 'info') {
      const circle = document.createElementNS(svg.namespaceURI, 'circle');
      circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '9'); svg.append(circle);
    }
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path);
    return svg;
  }
  function hint(el, text) {
    el.setAttribute('aria-label', text); el.setAttribute('title', text); el.dataset.sq84Hint = text;
  }
  function smallButton(button, name, label) {
    if (!button) return;
    button.classList.add('sq84-icon-button'); hint(button, label);
    if (button.dataset.sq84Icon !== name) { button.replaceChildren(icon(name)); button.dataset.sq84Icon = name; }
  }
  function header(dialog) {
    const heading = dialog.querySelector('.sq-heading');
    if (!heading || heading.querySelector('.sq84-meta')) return;
    const row = heading.querySelector('.sq-title-row'), status = row.querySelector('.sq-chip');
    const meta = document.createElement('div'); meta.className = 'sq84-meta';
    const eyebrow = heading.querySelector('.sq-eyebrow'), actions = dialog.querySelector('.sq-header-actions');
    const fullStatus = status.textContent;
    status.textContent = sqSubmitted() ? 'Pending verification' : 'In progress'; hint(status, fullStatus);
    meta.append(eyebrow, status, actions); heading.prepend(meta);
    smallButton(document.getElementById('supplierQuestDetails'), 'info', 'Review details');
  }
  function stagePresentation(dialog) {
    const key = supplierQuestStage(), data = SupplierQuestUI.quest?.stage_data || {};
    for (const button of dialog.querySelectorAll('.sq-steps [data-quest-stage]')) {
      const stage = button.dataset.questStage, definition = SupplierQuestModel.STAGES.find(s => s.key === stage);
      const active = stage === key, changed = SupplierQuestUI.staleStages.has(stage);
      const draft = SupplierQuestUI.drafts.get(sqStageKey(SupplierQuestUI.task, stage));
      const dirty = !!draft && sqCanonical(draft) !== sqCanonical(sqSavedDraft(stage));
      const reviewed = definition.kind !== 'summary' && !!data[stage];
      button.dataset.sq84State = changed ? 'changed' : dirty ? 'draft' : reviewed ? 'reviewed' : 'pending';
      button.classList.toggle('sq84-current', active);
      const mark = button.querySelector('.sq-step-icon');
      mark.textContent = !active && reviewed && !changed && !dirty ? '\u2713' : String(SupplierQuestModel.stageIndex(stage) + 1);
      let meta = button.querySelector('.sq84-step-meta');
      if (!meta) {
        meta = document.createElement('span'); meta.className = 'sq84-step-meta';
        const count = button.querySelector('small'); if (count) meta.append(count); button.append(meta);
      }
      meta.querySelector('.sq84-step-flag')?.remove();
      if (changed || dirty) {
        const flag = document.createElement('span'); flag.className = 'sq84-step-flag';
        flag.textContent = changed ? 'Changed' : 'Draft'; flag.setAttribute('aria-hidden', 'true'); meta.prepend(flag);
      }
      const label = stage === '200_300' ? 'Branch reallocation, 200 to 300 percent' : definition.title;
      const state = changed ? 'Product data changed. Reconfirm this stage.' : dirty ? 'Draft choices are not confirmed.' : reviewed ? 'Stage review saved. This does not complete the supplier task.' : 'Not reviewed yet.';
      hint(button, label + '. ' + (active ? 'Current stage. ' : '') + state + (changed && dirty ? ' Draft choices are also retained.' : ''));
    }
  }
  function shortAction(stage) {
    if (SupplierQuestUI.busy) return 'Saving...';
    if (sqSubmitted()) return 'Review saved';
    const n = SupplierQuestUI.selected.size;
    if (stage.kind === 'purchase') return n ? 'Add ' + n + ' to BO' : 'No Purchase Required';
    if (stage.kind === 'reallocation') return n ? 'Add ' + n + ' to Warehouse' : 'No Reallocation Required';
    if (stage.kind === 'decision') return 'Confirm Decisions';
    if (stage.kind === 'data') return 'Confirm Review';
    return 'Finish Review';
  }
  function footer(dialog) {
    const stage = supplierQuestCurrentStageDef(), key = stage.key;
    const primary = document.getElementById('supplierQuestPrimary');
    if (primary) {
      const label = document.createElement('span'); label.className = 'sq84-primary-label'; label.textContent = shortAction(stage);
      primary.replaceChildren(label, icon('next'));
      const full = SupplierQuestUI.busy ? 'Saving review' : supplierQuestPrimaryLabel(stage, supplierQuestStageRows(SupplierQuestUI.task, key));
      hint(primary, full); primary.classList.toggle('sq84-saving', SupplierQuestUI.busy);
    }
    smallButton(document.getElementById('supplierQuestPrevious'), 'back', 'Previous stage');
    const print = document.getElementById('supplierQuestPrint') || document.getElementById('supplierQuestPrintBo');
    const printLabel = stage.kind === 'data' ? 'Print Data Review' : stage.kind === 'decision' ? 'Print Decisions' : stage.kind === 'summary' ? 'Print Supplier BO' : 'Print Selected';
    smallButton(print, 'print', printLabel);
    const status = document.getElementById('supplierQuestSaveStatus'), totals = document.getElementById('supplierQuestTotals');
    if (status) {
      const draft = SupplierQuestUI.drafts.get(sqStageKey(SupplierQuestUI.task, key));
      const dirty = !!draft && sqCanonical(draft) !== sqCanonical(sqSavedDraft(key));
      const saved = !!SupplierQuestUI.quest?.stage_data?.[key];
      const value = SupplierQuestUI.busy ? 'saving' : SupplierQuestUI.error ? 'error' : sqSubmitted() ? 'saved' : dirty ? 'draft' : SupplierQuestUI.staleStages.has(key) ? 'changed' : saved ? 'saved' : 'draft';
      status.dataset.sq84Feedback = value;
      status.textContent = {saving:'Saving...',error:'Not saved',saved:'Saved',draft:'Draft',changed:'Reconfirm'}[value];
    }
    if (totals) {
      if (stage.kind === 'data') {
        totals.textContent = supplierQuestBlockingRows(SupplierQuestUI.task).length + ' blocking \u00b7 ' + supplierQuestAttentionRows(SupplierQuestUI.task).length + ' attention';
      } else if (stage.kind === 'summary') {
        totals.textContent = sqSubmitted() ? 'Pending inventory verification' : 'Review only, not task completion';
      } else {
        // Compact the existing engine's count text without recalculating BO quantities.
        for (const child of totals.childNodes) if (child.nodeType === Node.TEXT_NODE) child.textContent = child.textContent.replace(' selected in this stage', ' selected').replace(' decisions selected', ' decisions');
      }
    }
  }
  function priceHints(dialog) {
    for (const cell of dialog.querySelectorAll('.sq-purchase tbody td:nth-child(6)')) {
      if (cell.textContent.trim() !== '\u2014' || cell.querySelector('.sq84-missing-price')) continue;
      const value = document.createElement('span'); value.className = 'sq84-missing-price'; value.textContent = '\u2014'; value.tabIndex = 0;
      hint(value, 'Purchase price missing'); cell.replaceChildren(value);
    }
  }
  function tooltips(dialog) {
    if (bound.has(dialog)) return; bound.add(dialog);
    let current = null, hovered = null;
    function clear() { if (current) current.removeAttribute('aria-describedby'); current = null; dialog.querySelector('.sq84-tooltip')?.remove(); }
    function update() {
      // Keyboard focus may scroll a cell into view after focusin. Re-anchor its hint;
      // do not dismiss it because of that queued scroll or an unrelated pointerout.
      const focused = dialog.contains(document.activeElement) ? document.activeElement.closest('[data-sq84-hint]') : null;
      const target = focused || hovered;
      if (!dialog.open || !target?.isConnected || !dialog.contains(target) || target.disabled || target.closest('[inert]')) { clear(); return; }
      let tip = dialog.querySelector('.sq84-tooltip');
      if (current !== target || !tip) {
        clear(); current = target; tip = document.createElement('div'); tip.className = 'sq84-tooltip'; tip.id = 'sq84Tooltip';
        tip.setAttribute('role', 'tooltip'); dialog.append(tip); target.setAttribute('aria-describedby', tip.id);
      }
      tip.textContent = target.dataset.sq84Hint;
      const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + (r.width - t.width) / 2)) + 'px';
      tip.style.top = (r.top > t.height + 12 ? r.top - t.height - 8 : r.bottom + 8) + 'px';
    }
    dialog.addEventListener('focusin', update);
    dialog.addEventListener('focusout', () => requestAnimationFrame(update));
    dialog.addEventListener('pointerover', e => { hovered = e.target.closest('[data-sq84-hint]'); update(); });
    dialog.addEventListener('pointerout', e => { if (hovered && !hovered.contains(e.relatedTarget)) hovered = null; update(); });
    dialog.addEventListener('scroll', () => requestAnimationFrame(update), true);
    dialog.addEventListener('close', () => { if (!dialog.open) { hovered = null; clear(); } });
  }
  function polish(dialog) {
    if (!dialog?.classList.contains('sq84')) return;
    stagePresentation(dialog); footer(dialog); priceHints(dialog);
  }
  window.sqPaintControls = function (...args) { const result = paint.apply(this, args); polish(document.getElementById('supplierTaskDialog')); return result; };
  window.supplierQuestRender = function (task, response) {
    const result = render(task, response), dialog = result?.dialog || document.getElementById('supplierTaskDialog');
    if (dialog?.classList.contains('sq83')) { dialog.classList.add('sq84'); header(dialog); polish(dialog); tooltips(dialog); }
    return result;
  };
  window.renderSupplierTaskPopup = window.supplierQuestRender;
})();
