filepath = r'c:\Users\USER-PC\Desktop\Backups\simworks-installer-demo\src\index.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Add logging in findInstalledFor return
old1 = "    return inThisPath[0];\n  }\n\n  const installed2020 = findInstalledFor"
new1 = """    console.debug('[SWS-FIND-DEBUG] findInstalledFor result for product:', product?.id, product?.name, 'exp:', exp,
      '\\n  inThisPath:', inThisPath.map(a => ({ folder: a.folder, version: a.version, variantZip: a.variantZip })),
      '\\n  returning:', { folder: inThisPath[0]?.folder, version: inThisPath[0]?.version }
    );
    return inThisPath[0];
  }

  const installed2020 = findInstalledFor"""

if old1 in content:
    content = content.replace(old1, new1, 1)
    changes += 1
    print('1. Added findInstalledFor return logging')
else:
    print('1. SKIP: findInstalledFor return not found')

# 2. After installed2020 and installed2024 are set, add log 
old2 = "  let installed2024 = findInstalledFor(installPath2024, zipBase(expectedZip2024 || ''));\n\n  // --- Unified 2020+ shared-path reconciliation ---"
new2 = """  let installed2024 = findInstalledFor(installPath2024, zipBase(expectedZip2024 || ''));
  console.debug('[SWS-FIND-DEBUG] installed2020:', installed2020 ? { folder: installed2020.folder, version: installed2020.version } : null,
    'installed2024:', installed2024 ? { folder: installed2024.folder, version: installed2024.version } : null,
    'for product:', product?.id, product?.name);

  // --- Unified 2020+ shared-path reconciliation ---"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    changes += 1
    print('2. Added installed2020/2024 logging')
else:
    print('2. SKIP: installed2020/2024 section not found')

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print(f'\nTotal changes: {changes}')
