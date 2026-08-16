from pathlib import Path
import json
import struct
import zlib

root = Path('BuergermeisterPWA')
app_path = root / 'app.js'
css_path = root / 'styles.css'
manifest_path = root / 'manifest.webmanifest'
sw_path = root / 'sw.js'

app = app_path.read_text(encoding='utf-8')
anchor = "  const choice = arr => arr[Math.floor(Math.random() * arr.length)];\n"
install_code = r'''

  let deferredInstallPrompt = null;

  function isPwaStandalone() {
    return typeof window !== 'undefined' && (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator && window.navigator.standalone === true)
    );
  }

  function syncInstallButton() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('installBtn');
    const note = document.getElementById('installNote');
    if (!btn) return;

    if (isPwaStandalone()) {
      btn.hidden = true;
      if (note) {
        note.textContent = 'Die Bürgermeister-App ist bereits auf diesem Gerät installiert.';
        note.classList.add('installed');
      }
      return;
    }

    btn.hidden = false;
    btn.disabled = false;
    btn.classList.toggle('ready', !!deferredInstallPrompt);
    const label = btn.querySelector('.install-label');
    if (label) label.textContent = deferredInstallPrompt ? 'APP INSTALLIEREN' : 'AUF HANDY INSTALLIEREN';
    if (note) {
      note.classList.remove('installed');
      note.textContent = deferredInstallPrompt
        ? 'Bereit zur Installation – ein Tipp öffnet den Systemdialog.'
        : 'Wie eine normale App starten – direkt vom Startbildschirm.';
    }
  }

  async function installPwa() {
    if (isPwaStandalone()) return;
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (_) {}
      syncInstallButton();
      return;
    }
    openInstallHelp();
  }

  function openInstallHelp() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isiOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const steps = isiOS
      ? ['Öffne diese Seite in Safari.', 'Tippe auf Teilen.', 'Wähle „Zum Home-Bildschirm“ und bestätige „Hinzufügen“.']
      : isAndroid
        ? ['Öffne das Browser-Menü oben rechts (⋮).', 'Tippe auf „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige anschließend die Installation.']
        : ['Öffne das Menü deines Browsers.', 'Suche nach „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige die Installation.'];

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `<div class="modal install-help-modal">
      <div class="info-title-row"><div><div class="hint">PWA INSTALLIEREN</div><h2>Bürgermeister aufs Gerät</h2></div><button class="icon-close" aria-label="Schließen">×</button></div>
      <div class="install-help-icon">⇩</div>
      <p>Nach der Installation erscheint Bürgermeister wie eine App auf deinem Startbildschirm und öffnet ohne normale Browser-Leiste.</p>
      <ol class="install-steps">${steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <button class="btn primary center" id="installHelpClose" style="width:100%">VERSTANDEN</button>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#installHelpClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }
'''

if 'function isPwaStandalone()' not in app:
    if anchor not in app:
        raise SystemExit('Could not locate app helper anchor')
    app = app.replace(anchor, anchor + install_code, 1)

old_home = '''          <button class="btn center" id="rulesBtn">4 &nbsp; SPIELREGELN</button>
        </div>
        <p class="footer-note">Eigenständige Neuinterpretation – keine Original-ROMs oder Originalgrafiken.</p>'''
new_home = '''          <button class="btn center" id="rulesBtn">4 &nbsp; SPIELREGELN</button>
        </div>
        <div class="install-card" id="installCard">
          <div class="install-card-copy">
            <b>Als App auf dem Handy</b>
            <span id="installNote">Wie eine normale App starten – direkt vom Startbildschirm.</span>
          </div>
          <button class="btn install-btn center" id="installBtn"><span class="install-symbol">⇩</span><span class="install-label">AUF HANDY INSTALLIEREN</span></button>
        </div>
        <p class="footer-note">Eigenständige Neuinterpretation – keine Original-ROMs oder Originalgrafiken.</p>'''
if 'id="installBtn"' not in app:
    if old_home not in app:
        raise SystemExit('Could not locate start menu markup')
    app = app.replace(old_home, new_home, 1)

old_binding = "    document.getElementById('rulesBtn').onclick = renderRules;\n"
new_binding = old_binding + "    document.getElementById('installBtn').onclick = installPwa;\n    syncInstallButton();\n"
if "installBtn').onclick = installPwa" not in app:
    if old_binding not in app:
        raise SystemExit('Could not locate start menu bindings')
    app = app.replace(old_binding, new_binding, 1)

footer_anchor = "  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));\n"
install_events = r'''  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      syncInstallButton();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      syncInstallButton();
    });
  }

'''
if "window.addEventListener('beforeinstallprompt'" not in app:
    if footer_anchor not in app:
        raise SystemExit('Could not locate browser bootstrap')
    app = app.replace(footer_anchor, install_events + footer_anchor, 1)

app_path.write_text(app, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
css_block = r'''

/* PWA install experience */
[hidden] { display:none !important; }
.install-card {
  width:min(100%,420px); margin:15px auto 0; padding:10px;
  display:grid; gap:9px; border:2px solid #5277b9; background:linear-gradient(180deg,#102651,#0c1b3e);
  box-shadow:inset 0 0 0 2px rgba(5,10,28,.35);
}
.install-card-copy { display:grid; gap:3px; text-align:left; }
.install-card-copy b { color:#fff0b0; font-size:.88rem; }
.install-card-copy span { color:#a9bde9; font-size:.70rem; line-height:1.35; }
.install-card-copy span.installed { color:var(--good); }
.install-btn {
  width:100%; min-height:52px; display:flex; justify-content:center; align-items:center; gap:10px;
  background:#1b5368; border-color:#78c8d2; color:#f7f0c5;
}
.install-btn.ready { background:#35633c; border-color:#a7d78f; }
.install-symbol { font-size:1.45rem; line-height:1; color:#9fe5ed; }
.install-btn.ready .install-symbol { color:#c9f0b7; }
.install-help-modal { width:min(100%,560px); }
.install-help-icon {
  width:68px; height:68px; margin:12px auto; display:grid; place-items:center;
  border:3px solid #79a2e5; background:#0d1c43; color:#f2d76f; font-size:2.2rem;
  box-shadow:4px 4px 0 #050a1d;
}
.install-help-modal > p { line-height:1.5; color:#d6e1ff; }
.install-steps { margin:14px 0 18px; padding-left:1.5rem; display:grid; gap:9px; }
.install-steps li { padding-left:4px; line-height:1.4; color:#fff1c3; }
@media(max-width:520px){.install-card{padding:8px}.install-btn{min-height:48px}.install-card-copy span{font-size:.66rem}}
'''
if '/* PWA install experience */' not in css:
    css += css_block
css_path.write_text(css, encoding='utf-8')


def write_icon(path, size):
    bg = (10, 22, 53, 255)
    line = (111, 145, 211, 255)
    gold = (239, 207, 98, 255)
    cream = (255, 243, 199, 255)
    roof = (160, 77, 60, 255)
    road = (66, 73, 87, 255)
    pixels = [list(bg) for _ in range(size * size)]

    def rect(x0, y0, x1, y1, color):
        x0=max(0,int(x0)); y0=max(0,int(y0)); x1=min(size,int(x1)); y1=min(size,int(y1))
        for y in range(y0, y1):
            base=y*size
            for x in range(x0, x1):
                pixels[base+x]=list(color)

    m=size*.09
    rect(m,m,size-m,size-m,line)
    rect(m+size*.018,m+size*.018,size-m-size*.018,size-m-size*.018,bg)
    rect(size*.17,size*.69,size*.83,size*.78,road)
    rect(size*.46,size*.50,size*.54,size*.86,road)
    rect(size*.25,size*.39,size*.75,size*.68,gold)
    rect(size*.31,size*.30,size*.69,size*.39,roof)
    rect(size*.37,size*.24,size*.63,size*.30,roof)
    rect(size*.44,size*.18,size*.56,size*.24,roof)
    rect(size*.46,size*.42,size*.54,size*.68,bg)
    for x in (.31,.58):
        rect(size*x,size*.47,size*(x+.08),size*.57,cream)
    rect(size*.20,size*.78,size*.80,size*.80,gold)

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixels[y*size+x])

    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(bytes(raw),9)) + chunk(b'IEND',b'')
    path.write_bytes(png)

icons = root / 'icons'
icons.mkdir(exist_ok=True)
write_icon(icons / 'icon-192.png', 192)
write_icon(icons / 'icon-512.png', 512)

manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['icons'] = [
    {'src':'icons/icon-192.png','sizes':'192x192','type':'image/png','purpose':'any maskable'},
    {'src':'icons/icon-512.png','sizes':'512x512','type':'image/png','purpose':'any maskable'},
    {'src':'icons/icon.svg','sizes':'any','type':'image/svg+xml','purpose':'any'}
]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace('buergermeister-1992-plus-v5', 'buergermeister-1992-plus-v6')
old_assets = "'icons/icon.svg','assets/stage-kuhdorf.webp'"
new_assets = "'icons/icon.svg','icons/icon-192.png','icons/icon-512.png','assets/stage-kuhdorf.webp'"
if old_assets not in sw and 'icons/icon-192.png' not in sw:
    raise SystemExit('Could not locate service worker asset list')
if 'icons/icon-192.png' not in sw:
    sw = sw.replace(old_assets, new_assets, 1)
sw_path.write_text(sw, encoding='utf-8')
