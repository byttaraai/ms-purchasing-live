/* Build 83: approved table-left / dark-controls-right layout only.
   Moves the existing Build 82 DOM nodes, retaining handlers, drafts and v81 RPC authority. */
(function () {
  'use strict';
  const baseRender = window.supplierQuestRender;
  if (typeof baseRender !== 'function') throw new Error('Supplier Quest renderer is required.');
  const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 979px)') : {matches:false};
  let controlsOpen = false;
  let previousStage = null;
  const boundDialogs = new WeakSet();

  function node(tag, className, label) {
    const el = document.createElement(tag);
    el.className = className;
    if (label) el.setAttribute('aria-label', label);
    return el;
  }
  function button(id, text, className) {
    const el = node('button', 'sq-btn ' + className);
    el.type = 'button'; el.id = id; el.textContent = text;
    return el;
  }
  function responsive(focus) {
    const dialog = document.getElementById('supplierTaskDialog');
    if (!dialog?.classList.contains('sq83')) return;
    const workspace = dialog.querySelector('.sq83-workspace');
    const sidebar = dialog.querySelector('.sq83-controls');
    const footer = dialog.querySelector('.sq-footer');
    const toggle = document.getElementById('supplierQuestControlsToggle');
    if (!workspace || !sidebar || !footer) return;
    const drawer = narrow.matches && controlsOpen;
    dialog.classList.toggle('sq83-controls-open', drawer);
    workspace.inert = drawer;
    sidebar.inert = narrow.matches && !drawer;
    sidebar.setAttribute('aria-hidden', String(sidebar.inert));
    toggle.setAttribute('aria-expanded', String(drawer));
    // One set of real actions: sidebar on desktop, bottom bar on compact screens.
    const parent = narrow.matches && !drawer ? workspace : sidebar;
    if (footer.parentElement !== parent) parent.append(footer);
    if (focus) {
      const target = drawer ? document.getElementById('supplierQuestControlsBack') : toggle;
      target?.focus({preventScroll:true});
    } else if (sidebar.inert && sidebar.contains(document.activeElement)) {
      dialog.querySelector('.sq-stage h3')?.focus({preventScroll:true});
    }
  }
  function setControls(open, focus) { controlsOpen = open; responsive(focus); }

  window.supplierQuestRender = function (task, response) {
    const result = baseRender(task, response);
    const dialog = result?.dialog || document.getElementById('supplierTaskDialog');
    const shell = dialog?.querySelector('.sq-shell');
    if (!shell || shell.querySelector('.sq83-workspace')) return result;
    const header = shell.querySelector('.sq-header');
    const steps = shell.querySelector('.sq-steps');
    const stage = shell.querySelector('.sq-stage');
    const tools = stage.querySelector('.sq-tools');
    const helpText = stage.querySelector('.sq-stage-title p');
    const messages = shell.querySelector('.sq-messages');
    const content = shell.querySelector('.sq-content');
    const footer = shell.querySelector('.sq-footer');
    const scroll = content.scrollTop;
    const key = supplierQuestStage();
    if (previousStage !== key) controlsOpen = false;
    if (SupplierQuestUI.error) controlsOpen = true;
    previousStage = key;
    dialog.classList.add('sq83');
    if (!boundDialogs.has(dialog)) {
      // Search fields consume Escape by default; close only this compact drawer first.
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape' && narrow.matches && controlsOpen) {
          event.preventDefault(); event.stopPropagation(); setControls(false, true);
        }
      }, true);
      boundDialogs.add(dialog);
    }

    const workspace = node('section', 'sq83-workspace', 'Product data workspace');
    const sidebar = node('aside', 'sq83-controls', 'Supplier review controls');
    sidebar.id = 'supplierQuestControlPanel';
    const body = node('div', 'sq83-control-body');
    const toggle = button('supplierQuestControlsToggle', 'Stages & tools', 'sq83-controls-toggle');
    toggle.setAttribute('aria-controls', sidebar.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = () => setControls(true, true);
    stage.querySelector('.sq-stage-title').append(toggle);
    const heading = stage.querySelector('h3');
    if (heading) heading.tabIndex = -1;
    const back = button('supplierQuestControlsBack', 'Back to table', 'sq83-controls-back');
    back.onclick = () => setControls(false, true);
    header.prepend(back);

    body.append(steps);
    if (tools) body.append(tools);
    // Help and technical/error/reconfirm details belong to the control panel, not above products.
    if (helpText) {
      const help = node('details', 'sq83-help');
      const summary = node('summary', ''); summary.textContent = 'Stage help';
      help.append(summary, helpText); body.append(help);
    }
    if (messages) body.append(messages);
    workspace.append(stage, content);
    sidebar.append(header, body, footer);
    const scrim = button('supplierQuestControlsBackdrop', 'Return to table', 'sq83-scrim');
    scrim.tabIndex = -1; scrim.setAttribute('aria-hidden', 'true');
    scrim.onclick = () => setControls(false, true);
    shell.replaceChildren(workspace, scrim, sidebar);

    const cancel = dialog.oncancel;
    dialog.oncancel = function (event) {
      if (narrow.matches && controlsOpen) { event.preventDefault(); setControls(false, true); }
      else if (cancel) cancel.call(this, event);
    };
    responsive(false);
    content.scrollTop = scroll;
    if (narrow.matches && !controlsOpen) heading?.focus({preventScroll:true});
    return result;
  };
  window.renderSupplierTaskPopup = window.supplierQuestRender;
  if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', () => responsive(false));
})();
