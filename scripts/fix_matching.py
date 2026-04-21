filepath = r'c:\Users\USER-PC\Desktop\Backups\simworks-installer-demo\src\index.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Fix findInstalledBaseFor to also match by canonical folder name
old = "      // Use token match instead of strict product.id to ensure we find the base even if scanner didn't tag the id\n      const items = (aircraftList || []).filter(a => a && normalizePath(a.communityPath) === pathNorm && matchesItemToProduct(a, product));"
new = """      // Include items matched by product ID OR by canonical folder name (base folder may lack ID when only panel-mod was mapped)
      const _canonicalFolderBase = String(product?.bunny?.folder || '').toLowerCase();
      const items = (aircraftList || []).filter(a => {
        if (!a || normalizePath(a.communityPath) !== pathNorm) return false;
        if (matchesItemToProduct(a, product)) return true;
        if (_canonicalFolderBase && String(a.folder || '').toLowerCase() === _canonicalFolderBase) return true;
        return false;
      });"""

if old in content:
    content = content.replace(old, new, 1)
    changes += 1
    print('1. Fixed findInstalledBaseFor items filter')
else:
    # Try finding with different apostrophe
    import re
    pattern = r"// Use token match.*?tag the id\n\s+const items = \(aircraftList \|\| \[\]\)\.filter\(a => a && normalizePath\(a\.communityPath\) === pathNorm && matchesItemToProduct\(a, product\)\);"
    m = re.search(pattern, content, re.DOTALL)
    if m:
        content = content[:m.start()] + new + content[m.end():]
        changes += 1
        print('1. Fixed findInstalledBaseFor items filter (regex match)')
    else:
        print('1. ERROR: Could not find findInstalledBaseFor items filter')
        # Show context
        idx = content.find('normalizePath(a.communityPath) === pathNorm && matchesItemToProduct(a, product)')
        if idx >= 0:
            print(f'   Found partial at offset {idx}')
            print(f'   Context: {repr(content[idx-200:idx+200])}')
        else:
            print('   Could not find even partial match')

# Also fix the fallback version-reading sections that have the same matchesItemToProduct filter
# These are in the useEffect, for the FS2020 and FS2024 heuristic fallback paths
old2 = "    const items20 = (aircraftList || []).filter(a => a && normalizePath(a.communityPath) === pathNorm20 && matchesItemToProduct(a, product));"
new2 = """    const items20 = (aircraftList || []).filter(a => {
      if (!a || normalizePath(a.communityPath) !== pathNorm20) return false;
      if (matchesItemToProduct(a, product)) return true;
      const _cf = String(product?.bunny?.folder || '').toLowerCase();
      if (_cf && String(a.folder || '').toLowerCase() === _cf) return true;
      return false;
    });"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    changes += 1
    print('2. Fixed FS2020 fallback items filter')
else:
    print('2. SKIP: FS2020 fallback not found (may not need fix)')

old3 = "    const items24 = (aircraftList || []).filter(a => a && normalizePath(a.communityPath) === pathNorm24 && matchesItemToProduct(a, product));"
new3 = """    const items24 = (aircraftList || []).filter(a => {
      if (!a || normalizePath(a.communityPath) !== pathNorm24) return false;
      if (matchesItemToProduct(a, product)) return true;
      const _cf = String(product?.bunny?.folder || '').toLowerCase();
      if (_cf && String(a.folder || '').toLowerCase() === _cf) return true;
      return false;
    });"""

if old3 in content:
    content = content.replace(old3, new3, 1)
    changes += 1
    print('3. Fixed FS2024 fallback items filter')
else:
    print('3. SKIP: FS2024 fallback not found (may not need fix)')

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print(f'\nTotal changes: {changes}')
