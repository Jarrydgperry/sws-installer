const path = require('path');
const os = require('os');
const fs = require('fs');

function detectCommunityPath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const msStorePath = path.join(localAppData, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community');
  const steamPath = path.join(appData, 'Microsoft Flight Simulator', 'Packages', 'Community');

  if (fs.existsSync(msStorePath)) return msStorePath;
  if (fs.existsSync(steamPath)) return steamPath;

  return null;
}

module.exports = detectCommunityPath;
