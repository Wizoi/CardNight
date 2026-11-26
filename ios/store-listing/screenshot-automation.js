// Screenshot-only automation, injected into a CI-only build of index.html
// (see .github/workflows/ios-store-screenshots.yml) -- never shipped in a
// real build. Drives the real app through its own button click handlers
// (not synthetic touch events) to reach two states worth screenshotting:
// the clean setup/roster screen, and a dealt hand in progress.
//
// Adaptive, not a single fixed sequence: who wins the cut-for-deal (and
// therefore whether the picker screen shows a human-picks UI or an
// AI-picks confirmation screen) is randomized each run -- confirmed live
// by a real run landing on the AI-picks branch unexpectedly. pollFor()
// below waits for whichever actual DOM state shows up rather than
// assuming one fixed path.
(async function screenshotAutomation() {
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function pollFor(check, timeoutMs, intervalMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = check();
      if (result) return result;
      await wait(intervalMs || 300);
    }
    return null;
  }

  await wait(1000);
  document.getElementById('discard-saved-night-btn')?.click();
  await wait(800);
  document.getElementById('tutorial-skip-btn')?.click();
  await wait(500);

  // Clean setup/roster screen sits here for a while -- CI takes "opening
  // screen" screenshot somewhere in this window before the script moves
  // on. Widened from an initial 5s after a real device run's timing
  // diverged enough from live-browser calibration to miss that window
  // entirely (landed on the cut-for-deal screen instead).
  await wait(12000);

  document.getElementById('setup-start')?.click();

  // Cut-for-deal: tap one card in the fan, then wait for every AI seat to
  // auto-claim its own card (they do this on a staggered timer).
  await pollFor(() => document.querySelectorAll('[data-cutfordeal-slot]').length > 0, 5000, 300);
  document.querySelectorAll('[data-cutfordeal-slot]')[0]?.click();
  await pollFor(() => {
    const btn = document.getElementById('cutfordeal-continue-btn');
    return btn && btn.offsetParent !== null;
  }, 15000, 500);
  document.getElementById('cutfordeal-continue-btn')?.click();

  // Picker screen: either a human-picks UI (.pv-cartridge-item + a "Call &
  // Deal" button) or an AI-picks confirmation screen (data-confirm-continue,
  // shown ~900ms after the AI auto-pick timer fires). Wait for whichever
  // one actually shows up.
  const pickerState = await pollFor(() => {
    const cartridgeItems = document.querySelectorAll('.pv-cartridge-item');
    if (cartridgeItems.length > 0) return 'human';
    const confirmBtn = document.querySelector('[data-confirm-continue]');
    if (confirmBtn && confirmBtn.offsetParent !== null) return 'ai';
    return null;
  }, 8000, 300);

  if (pickerState === 'human') {
    const cartridgeItems = Array.from(document.querySelectorAll('.pv-cartridge-item'));
    const preferred = cartridgeItems.find(e => /midnight baseball/i.test(e.textContent));
    (preferred || cartridgeItems[0])?.click();
    await wait(500);
    const dealBtn = await pollFor(() => {
      const btn = Array.from(document.querySelectorAll('#picker-view button'))
        .find(b => /call.*deal/i.test(b.textContent) || b.hasAttribute('data-confirm-continue'));
      return btn && btn.offsetParent !== null ? btn : null;
    }, 5000, 300);
    dealBtn?.click();
  } else if (pickerState === 'ai') {
    document.querySelector('[data-confirm-continue]')?.click();
  }

  // Table view, whichever game ended up chosen -- deal the first hand.
  await pollFor(() => {
    const btn = document.getElementById('deal-first-hand-btn');
    return btn && btn.offsetParent !== null;
  }, 8000, 300);
  document.getElementById('deal-first-hand-btn')?.click();
  await wait(3000);

  // Hand dealt, betting round visible -- CI takes "in-game view" screenshot
  // shortly after this point.
})();
