#!/usr/bin/env python3
# dupcheck.py — global-name guard (ARCH §4).
# Fails if: any window.* assignment other than window.HB / window.__hbErrs;
# an HB.X namespace is created outside the §3 set or by two different files;
# two modules register the same HB.reg key; a reserved global is shadowed at
# top level; forbidden calls (alert/localStorage/eval/document.write) appear;
# a src/*.js file is missing from the MANIFEST or a manifest file lacks HB.reg.
import os
import re

NS_ALLOWED = {'CFG', 'UTIL', 'CORE', 'COURT', 'GROUNDS', 'CLUB', 'PEOPLE', 'KIN',
              'BALL', 'RALLY', 'FLOW', 'CROWD', 'AUDIO', 'UI', 'DEBUG'}
WINDOW_ASSIGN_OK = {'HB', '__hbErrs'}
NO_REG_OK = {'cfg.js', 'util.js', 'debug.js'}
RESERVED = {
    'document', 'window', 'navigator', 'location', 'history', 'console', 'screen',
    'Math', 'JSON', 'Promise', 'Object', 'Array', 'Function', 'String', 'Number',
    'Boolean', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp',
    'Error', 'TypeError', 'RangeError', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'alert', 'localStorage', 'sessionStorage', 'eval', 'performance',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval',
    'clearTimeout', 'clearInterval', 'fetch', 'crypto', 'AudioContext',
    'WebGLRenderingContext', 'self', 'globalThis', 'top', 'parent', 'frames',
    'onerror', 'onload', 'name', 'status', 'length',
}
FORBIDDEN = re.compile(r'\b(alert|localStorage|sessionStorage|eval|document\.write)\s*\(')
RE_WASSIGN = re.compile(
    r'\bwindow\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\.\s*[A-Za-z_$][\w$]*\s*)*=(?![=>])')
RE_NS = re.compile(r'^\s*HB\.([A-Z][A-Z0-9]*)\s*=', re.M)
RE_REG = re.compile(r"HB\.reg\(\s*(['\"])([\w-]+)\1")
RE_VAR = re.compile(r'^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)', re.M)
RE_FN = re.compile(r'^\s*function\s+([A-Za-z_$][\w$]*)', re.M)


def check(srcdir, manifest):
    """Return a list of problems ([] == clean)."""
    problems, loaded = [], []
    for f in manifest:
        p = os.path.join(srcdir, f)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as fh:
                loaded.append((f, fh.read()))
        else:
            print('  dupcheck: (not built yet: %s)' % f)
    for f in sorted(os.listdir(srcdir)):
        if f.endswith('.js') and f not in manifest:
            problems.append('%s exists in src/ but is not in the build MANIFEST' % f)

    owner, regs = {}, {}
    for fname, text in loaded:
        for m in RE_WASSIGN.finditer(text):
            if m.group(1) not in WINDOW_ASSIGN_OK:
                problems.append('%s: window.%s assignment (only window.HB / __hbErrs allowed)'
                                % (fname, m.group(1)))
        for m in RE_NS.finditer(text):
            ns = m.group(1)
            if ns not in NS_ALLOWED:
                problems.append('%s: HB.%s is not an allowed namespace (ARCH §3)' % (fname, ns))
            elif ns in owner and owner[ns] != fname:
                problems.append('%s: HB.%s namespace already created by %s'
                                % (fname, ns, owner[ns]))
            owner[ns] = fname
        for m in RE_REG.finditer(text):
            key = m.group(2)
            if key in regs:
                problems.append('%s: HB.reg("%s") duplicates %s' % (fname, key, regs[key]))
            regs[key] = fname
        if fname not in NO_REG_OK and not RE_REG.search(text):
            problems.append('%s: no HB.reg(...) call — modules must register their api' % fname)
        for m in FORBIDDEN.finditer(text):
            problems.append('%s: forbidden call %s(' % (fname, m.group(1)))
        for m in RE_VAR.finditer(text):
            if m.group(1) in RESERVED:
                problems.append('%s: shadows reserved name "var %s"' % (fname, m.group(1)))
        for m in RE_FN.finditer(text):
            if m.group(1) in RESERVED:
                problems.append('%s: shadows reserved name "function %s"' % (fname, m.group(1)))
    return problems


if __name__ == '__main__':
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
    from build import MANIFEST
    probs = check(src, MANIFEST)
    for p in probs:
        print('  - ' + p)
    print('dupcheck: %s (%d problems)' % ('FAIL' if probs else 'clean', len(probs)))
    sys.exit(1 if probs else 0)
