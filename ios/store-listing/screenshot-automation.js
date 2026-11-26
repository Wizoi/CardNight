// Screenshot-only automation, injected into a CI-only build of index.html
// (see .github/workflows/ios-store-screenshots.yml) -- never shipped in a
// real build. Drives the real app through its own button click handlers
// (not synthetic touch events) to reach two states worth screenshotting:
// the clean setup/roster screen, and a dealt hand in progress. Every step
// and its wait time was verified live against the running app before
// being committed here (not guessed at) -- see CLAUDE.md/ios/README.md
// for the "Duo"/screenshot session history this replaces.
(async function screenshotAutomation() {
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  await wait(1000);
  document.getElementById('discard-saved-night-btn')?.click();
  await wait(800);
  document.getElementById('tutorial-skip-btn')?.click();
  await wait(500);

  // Clean setup/roster screen sits here for ~5s -- CI takes "opening
  // screen" screenshot somewhere in this window before the script moves on.
  await wait(5000);

  document.getElementById('setup-start')?.click();
  await wait(1500);

  document.querySelectorAll('[data-cutfordeal-slot]')[0]?.click();
  await wait(7000); // AI seats auto-claim their own cards on a timer

  document.getElementById('cutfordeal-continue-btn')?.click();
  await wait(1000);

  const cartridgeItems = Array.from(document.querySelectorAll('.pv-cartridge-item'));
  cartridgeItems.find(e => /midnight baseball/i.test(e.textContent))?.click();
  await wait(500);

  const dealBtn = Array.from(document.querySelectorAll('#picker-view button'))
    .find(b => /call.*deal/i.test(b.textContent));
  dealBtn?.click();
  await wait(1500);

  document.getElementById('deal-first-hand-btn')?.click();
  await wait(3000);

  // Hand dealt, betting round visible -- CI takes "in-game view" screenshot
  // shortly after this point.
})();
