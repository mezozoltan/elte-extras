(async () => {
  'use strict';
  const inputs = [...document.querySelectorAll('input[type="checkbox"]')];
  const status = document.getElementById('status');
  try {
    const {siteEnabled = {}} = await browser.storage.local.get('siteEnabled');
    for (const input of inputs) { input.checked = siteEnabled[input.name] !== false; input.disabled = false; }
  } catch {
    status.textContent = 'A beállítások nem tölthetők be. Nyisd meg újra a menüt.';
    return;
  }
  document.querySelector('form').addEventListener('submit', event => event.preventDefault());
  for (const input of inputs) input.addEventListener('change', async () => {
    const checked = input.checked;
    inputs.forEach(control => { control.disabled = true; });
    try {
      const {siteEnabled = {}} = await browser.storage.local.get('siteEnabled');
      await browser.storage.local.set({siteEnabled:{...siteEnabled,[input.name]:checked}});
      status.textContent = 'Mentve. Töltsd újra az érintett oldalt.';
    } catch {
      input.checked = !checked;
      status.textContent = 'Nem sikerült menteni. Próbáld újra.';
    } finally {
      inputs.forEach(control => { control.disabled = false; });
    }
  });
})();
