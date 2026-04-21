const path = require('path');
const os = require('os');
const fs = require('fs');

function detectCommunityPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  // MS Store (FS2020)
  const msStorePath = path.join(localAppData, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community');
  console.log('Checking MS Store path:', msStorePath);
  if (fs.existsSync(msStorePath)) return msStorePath;

  // Steam (FS2020)
  const steamPath = path.join(appData, 'Microsoft Flight Simulator', 'Packages', 'Community');
  console.log('Checking Steam path:', steamPath);
  if (fs.existsSync(steamPath)) return steamPath;

  // MSFS 2024 (example, update as needed)
  const msfs2024Path = path.join(localAppData, 'Packages', 'Microsoft.FlightSimulator2024_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community');
  console.log('Checking MSFS 2024 path:', msfs2024Path);
  if (fs.existsSync(msfs2024Path)) return msfs2024Path;

  // Add more paths as needed

  console.warn('No Community folder found in known locations.');
  return null;
}

module.exports = detectCommunityPath;