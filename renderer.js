let selectedZip = '';
let selectedSim = 'FS2020'; // Default sim
const simPaths = { FS2020: '', FS2024: '' };

function zipBase(p) {
  const name = String(p || '').split(/[\\/]/).pop() || '';
  return name.replace(/\.zip$/i, '');
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg || '';
  el.style.color = isError ? '#ff8a80' : '#9bd59b';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Try auto-detect paths
  try {
    if (window.electron?.getDefaultInstallPath) {
      const p2020 = await window.electron.getDefaultInstallPath();
      if (p2020) simPaths.FS2020 = p2020;
    }
    if (window.electron?.getDefaultInstallPath2024) {
      const p2024 = await window.electron.getDefaultInstallPath2024();
      if (p2024) simPaths.FS2024 = p2024;
    }
  } catch {}

  document.getElementById('simSelect').addEventListener('change', (e) => {
    selectedSim = e.target.value;
    document.getElementById('pathLabel').textContent = simPaths[selectedSim] || 'No folder selected';
  });

  document.getElementById('zipInput').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    selectedZip = (f && f.path) || '';
  });

  document.getElementById('chooseFolder').addEventListener('click', async () => {
    if (!window.electron?.selectFolder) {
      alert('Folder picker not available (preload).');
      return;
    }
    const chosenPath = await window.electron.selectFolder();
    if (chosenPath) {
      simPaths[selectedSim] = chosenPath;
      document.getElementById('pathLabel').textContent = chosenPath;
    }
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    const selectedPath = simPaths[selectedSim];
    if (!selectedZip || !selectedPath) {
      setStatus('ZIP and Community path required.', true);
      return;
    }

    const bar = document.getElementById('progressBar');
    bar.style.width = '0%';
    setStatus('Installing...');

    // Fake progress bar while PowerShell expands (no progress events wired)
    let pct = 0;
    const timer = setInterval(() => {
      pct = Math.min(95, pct + 5);
      bar.style.width = pct + '%';
    }, 120);

    try {
      const result = await window.electron.installAircraft({
        aircraftZipPath: selectedZip,
        installPath: selectedPath,
        channel: selectedSim
      });
      clearInterval(timer);
      bar.style.width = '100%';
      setStatus(result.success ? 'Installation complete!' : ('Error: ' + result.error), !result.success);
    } catch (err) {
      clearInterval(timer);
      setStatus('Error: ' + (err?.message || String(err)), true);
    }
  });

  document.getElementById('uninstallBtn').addEventListener('click', async () => {
    const selectedPath = simPaths[selectedSim];
    if (!selectedPath) {
      setStatus('Select Community path first.', true);
      return;
    }
    // Best effort: derive folder from selected zip; else try by name (sim)
    const folderGuess = selectedZip ? zipBase(selectedZip) : '';
    try {
      const result = await window.electron.uninstallAircraft({
        // Prefer folder+installPath (exact), else name+installPath (best-match)
        installPath: selectedPath,
        folder: folderGuess || undefined,
        name: folderGuess || selectedSim
      });
      setStatus(result.success ? 'Uninstalled.' : ('Error: ' + result.error), !result.success);
    } catch (err) {
      setStatus('Error: ' + (err?.message || String(err)), true);
    }
  });

  // Initialize UI with detected path for default sim
  document.getElementById('pathLabel').textContent = simPaths[selectedSim] || 'No folder selected';
});
