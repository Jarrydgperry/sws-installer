import re

filepath = r'c:\Users\USER-PC\Desktop\Backups\simworks-installer-demo\src\index.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Add early-exit logging
old1 = '  if (!installPath || !baseZipLower) return null;\n'
new1 = '  if (!installPath || !baseZipLower) { console.debug("[SWS-BASE-DEBUG] Early exit: no installPath or baseZip", { installPath, baseZipLower, productId: product?.id }); return null; }\n'
if old1 in content:
    content = content.replace(old1, new1, 1)
    changes += 1
    print('1. Added early-exit logging')
else:
    print('1. SKIP: early-exit already changed or not found')

# 2. Add entry-level logging after nonPanelItems
old2 = "      const nonPanelItems = items.filter(it => !panelish(String(it.folder || it.name || '').toLowerCase()));\n      // Build a whitelist"
new2 = """      const nonPanelItems = items.filter(it => !panelish(String(it.folder || it.name || '').toLowerCase()));
      console.debug('[SWS-BASE-DEBUG] Product:', product?.id, product?.name, 'simKey:', simKey,
        '\\n  baseZipLower:', baseZipLower,
        '\\n  items:', items.map(a => ({ folder: a.folder, version: a.version, variantZip: a.variantZip, panelish: panelish(String(a.folder || '').toLowerCase()) })),
        '\\n  nonPanelItems:', nonPanelItems.map(a => ({ folder: a.folder, version: a.version }))
      );
      // Build a whitelist"""
if old2 in content:
    content = content.replace(old2, new2, 1)
    changes += 1
    print('2. Added entry-level debug logging')
else:
    print('2. SKIP: entry-level already changed or not found')

# 3. Add logging inside the useEffect that reads version - log what getPackageVersion returns
# Find the useEffect that calls getPackageVersion for installedBase2020
old3 = "const ver2020 = await window.electronAPI.getPackageVersion(installedBase2020.folder, installPath2020);"
new3 = """const ver2020 = await window.electronAPI.getPackageVersion(installedBase2020.folder, installPath2020);
          console.debug('[SWS-VERSION-DEBUG] getPackageVersion 2020 result:', { folder: installedBase2020.folder, ver2020, productId: product?.id, productName: product?.name });"""
if old3 in content:
    content = content.replace(old3, new3, 1)
    changes += 1
    print('3. Added getPackageVersion 2020 logging')
else:
    print('3. SKIP: getPackageVersion 2020 not found')

# 4. Same for 2024
old4 = "const ver2024 = await window.electronAPI.getPackageVersion(installedBase2024.folder, installPath2024);"
new4 = """const ver2024 = await window.electronAPI.getPackageVersion(installedBase2024.folder, installPath2024);
          console.debug('[SWS-VERSION-DEBUG] getPackageVersion 2024 result:', { folder: installedBase2024.folder, ver2024, productId: product?.id, productName: product?.name });"""
if old4 in content:
    content = content.replace(old4, new4, 1)
    changes += 1
    print('4. Added getPackageVersion 2024 logging')
else:
    print('4. SKIP: getPackageVersion 2024 not found')

# 5. Also add logging at matchesItemToProduct for debugging
# Find the function
old5 = "  function matchesItemToProduct(item, prod) {"
new5 = """  function matchesItemToProduct(item, prod) {
    // Uncomment next line for extremely verbose matching debug:
    // console.debug('[SWS-MATCH-DEBUG]', item?.folder, '->', prod?.id, prod?.name, 'item.id:', item?.id, 'prod.id:', prod?.id);"""
if old5 in content:
    content = content.replace(old5, new5, 1)
    changes += 1
    print('5. Added matchesItemToProduct debug stub')
else:
    print('5. SKIP: matchesItemToProduct not found')

# 6. Also add logging in the version display section for the uninstall button
# Find where installedVersionForSim is used or computed
old6 = "  // [DEBUG] Trace final version values\n  if (product?.id) {"
if old6 in content:
    print('6. SKIP: final version debug log already exists')
else:
    print('6. INFO: final version debug log marker not found')

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print(f'\nTotal changes: {changes}')
