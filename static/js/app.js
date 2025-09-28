/* /static/app.js
 * Minimal, framework-agnostic helpers for:
 *  - A robust modal (for Aid 1 / Aid 2 popups)
 *  - Safe event wiring (works regardless of when HTML is inserted)
 *  - Defensive button behavior (no accidental form submits)
 *
 * Usage options:
 *   1) Call window.showHintModal({ titleText, html }) directly, OR
 *   2) Add data attributes on any button/link and this file will auto-wire:
 *        data-hint1="...html..."   (opens as 'Hint')
 *        data-hint2="...html..."   (opens as 'More Help')
 *      Optional:
 *        data-hint-title="Custom Title"
 *
 * Requires: an element with id="helpModal" + inner structure created below.
 * If you don’t have it in your HTML already, this file will inject it.
 */

(function () {
  // --- Inject modal HTML if it's missing ---
  function ensureModalHTML() {
    if (document.getElementById('helpModal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div id="helpModal" class="hidden fixed inset-0 z-[1000] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" data-close aria-label="Close overlay"></div>
        <div class="relative max-w-2xl w-[90%] bg-white rounded-xl shadow-xl p-4 md:p-6"
             role="dialog" aria-modal="true" aria-labelledby="helpTitle">
          <button type="button" data-close
                  class="absolute right-2 top-2 rounded-md px-2 py-1 border border-gray-300 hover:bg-gray-100"
                  aria-label="Close">✕</button>

          <h2 id="helpTitle" class="text-xl font-semibold mb-3">Hint</h2>
          <div id="helpBody" class="prose max-w-none text-gray-800">Loading…</div>

          <div class="mt-4 text-right">
            <button type="button" data-close
                    class="rounded-md px-4 py-2 border border-gray-300 hover:bg-gray-100">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper.firstElementChild);
  }

  // --- Modal controller ---
  let modal, bodyEl, titleEl;
  function cacheEls() {
    modal   = document.getElementById('helpModal');
    bodyEl  = document.getElementById('helpBody');
    titleEl = document.getElementById('helpTitle');
  }

  function openModal({ titleText = 'Hint', html = '' } = {}) {
    if (!modal) return;
    titleEl.textContent = titleText || 'Hint';
    bodyEl.innerHTML = (html && String(html).trim()) ? html : '<p>No extra info for this one yet.</p>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Expose for app usage
  window.showHintModal = openModal;

  // --- Safe wiring for close behavior + delegated hint buttons ---
  function safeWire() {
    // Close on overlay or any element with [data-close]
    modal.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-close')) {
        e.preventDefault();
        closeModal();
      }
    });

    // Ensure all existing [data-close] aren't type=submit
    modal.querySelectorAll('[data-close]').forEach(btn => {
      if (!btn.getAttribute('type')) btn.setAttribute('type', 'button');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
      });
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    // Delegate clicks for any hint buttons that appear later:
    // Use either data-hint1 or data-hint2; optional data-hint-title overrides title.
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-hint1], [data-hint2]');
      if (!t) return;

      e.preventDefault();

      // never let these be implicit submit buttons
      if (t.tagName === 'BUTTON' && !t.getAttribute('type')) t.setAttribute('type', 'button');

      const html1  = t.getAttribute('data-hint1');
      const html2  = t.getAttribute('data-hint2');
      const title  = t.getAttribute('data-hint-title');

      if (html1) {
        openModal({ titleText: title || 'Hint', html: html1 });
      } else if (html2) {
        openModal({ titleText: title || 'More Help', html: html2 });
      } else {
        openModal({ titleText: 'Hint', html: '<p>No extra info provided.</p>' });
      }
    });
  }

  // --- Initialize ASAP (script loaded with defer recommended) ---
  function init() {
    ensureModalHTML();
    cacheEls();
    safeWire();

    // Optional: small guard to reveal why a modal might look empty
    // (Open DevTools → Console to see logs.)
    window.debugHint = function (html) {
      console.log('[debugHint] opening modal with:', html);
      openModal({ html });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
