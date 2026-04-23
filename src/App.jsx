import React, { useState } from "react";

export default function App() {
  const [aircraft, setAircraft] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  const handleBrowse = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) setInstallPath(path);
  };

  const handleInstall = async () => {
    setStatus("Installing...");
    setProgress(0);

    const zip = `zips/${aircraft}`;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          doInstall(zip);
        }
        return p + 10;
      });
    }, 200);
  };

  const doInstall = async (zip) => {
    const result = await window.electronAPI.installAircraft({
      aircraftZipPath: zip,
      installPath,
    });
    setStatus(
      result.success ? "Installation complete!" : `Error: ${result.error}`,
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>SimWorks Installer</h1>
      <select value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
        <option value="">Select Aircraft</option>
        <option value="pc12.zip">PC-12</option>
        <option value="airvan.zip">Airvan</option>
      </select>
      <br />
      <button onClick={handleBrowse}>Select Install Path</button>
      <div>{installPath}</div>
      <br />
      <button onClick={handleInstall} disabled={!aircraft || !installPath}>
        Install
      </button>
      <div
        style={{ height: 20, width: "100%", background: "#444", marginTop: 10 }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "#4caf50",
          }}
        ></div>
      </div>
      <p>{status}</p>
    </div>
  );
}
