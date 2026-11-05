/* Android app bridge (7Z1FT).
   In the native app, Java exposes window.AndroidBT (Bluetooth) and window.AndroidApp (files, notifications, screen).
   This file makes them look like the browser APIs the page already uses, so index.html runs unchanged:
   navigator.bluetooth (BLE: memory read/write), navigator.serial (classic Bluetooth SPP: CI-V tracking, APRS KISS),
   downloads, Notification, wakeLock. In a normal browser it does nothing. */
(function () {
  if (!window.AndroidBT) return;
  const BT = window.AndroidBT, APP = window.AndroidApp;
  const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
  const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const waiters = {}; let seq = 0;
  const wait = key => new Promise((res, rej) => { (waiters[key] = waiters[key] || []).push({ res, rej }); });
  const settle = (key, ok, val) => { const w = (waiters[key] || []).shift(); if (w) ok ? w.res(val) : w.rej(new DOMException(val || 'Bluetooth error', 'NetworkError')); };

  /* ---------- picker (shared by BLE and SPP) ---------- */
  function picker(title, load) {
    return new Promise((resolve, reject) => {
      const bg = document.createElement('div');
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:grid;place-items:center;padding:16px;direction:rtl;font-family:inherit';
      bg.innerHTML = `<div style="background:var(--panel,#fff);color:var(--fg,#111);border-radius:16px;padding:16px;width:min(420px,100%);max-height:80vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.4)">
        <h3 style="margin:0 0 6px">${title}</h3><p data-s style="margin:0 0 10px;opacity:.75">أدوّر…</p><div data-l style="display:grid;gap:8px"></div>
        <button data-c style="margin-top:12px;width:100%;padding:12px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit">إلغاء</button></div>`;
      document.body.appendChild(bg);
      const list = bg.querySelector('[data-l]'), st = bg.querySelector('[data-s]'), seen = new Set();
      const done = (v, e) => { bg.remove(); stop && stop(); e ? reject(e) : resolve(v); };
      bg.querySelector('[data-c]').onclick = () => done(null, new DOMException('User cancelled the chooser.', 'NotFoundError'));
      const add = d => { if (seen.has(d.address)) return; seen.add(d.address); st.textContent = 'اختر جهازك:';
        const b = document.createElement('button');
        b.style.cssText = 'text-align:right;padding:12px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit';
        b.innerHTML = `<b>${(d.name || 'بدون اسم').replace(/</g, '&lt;')}</b><br><small style="opacity:.7;direction:ltr;unicode-bidi:isolate">${d.address}</small>`;
        b.onclick = () => done(d); list.appendChild(b); };
      const stop = load(add, msg => { st.textContent = msg; });
    });
  }

  /* ---------- BLE as navigator.bluetooth ---------- */
  let bleDev = null, notifyCb = [];
  class Char {
    constructor(uuid) { this.uuid = uuid; this._l = []; }
    async writeValueWithResponse(v) { const u = v instanceof Uint8Array ? v : new Uint8Array(v.buffer || v); const p = wait('bleWrote'); if (!BT.bleWrite(this.uuid, b64e(u))) { settle('bleWrote', false, 'write failed'); } return p; }
    writeValue(v) { return this.writeValueWithResponse(v); }
    writeValueWithoutResponse(v) { return this.writeValueWithResponse(v); }
    async startNotifications() { const p = wait('bleNotify'); BT.bleNotify(this.uuid); await p; return this; }
    addEventListener(t, f) { if (t === 'characteristicvaluechanged') notifyCb.push(f); }
    removeEventListener(t, f) { notifyCb = notifyCb.filter(x => x !== f); }
  }
  class Service { constructor(uuid) { this.uuid = uuid; } async getCharacteristic(u) { if (!BT.bleHasChar(this.uuid, u)) throw new DOMException('No characteristic ' + u, 'NotFoundError'); return new Char(u); } }
  class Device {
    constructor(d) { this.name = d.name; this.id = d.address; this._l = []; const self = this;
      this.gatt = { connected: false, device: this,
        async connect() { const p = wait('bleConn'); BT.bleConnect(self.id); await p; self.gatt.connected = true;
          return { device: self, async getPrimaryService(u) { if (!BT.bleHasService(u)) throw new DOMException('No service ' + u, 'NotFoundError'); return new Service(u); } }; },
        disconnect() { BT.bleDisconnect(); } }; }
    addEventListener(t, f) { if (t === 'gattserverdisconnected') this._l.push(f); }
    removeEventListener(t, f) { this._l = this._l.filter(x => x !== f); }
  }
  const bluetooth = {
    async getAvailability() { return BT.available(); },
    async requestDevice(opts) {
      const pre = ((opts && opts.filters) || []).map(f => f.namePrefix).filter(Boolean);
      const d = await picker('اختر الجهاز (البلوتوث العادي)', (add, msg) => {
        if (!BT.ensurePermissions()) msg('اسمح للتطبيق باستخدام البلوتوث، وبعدها جرّب مرة ثانية.');
        scanAdd = d => { if (!pre.length || pre.some(p => (d.name || '').startsWith(p))) add(d); };
        BT.bleScan(8000); setTimeout(() => msg(listEmpty() ? 'ما لقيت الجهاز. تأكد إن بلوتوث الجهاز شغّال.' : 'اختر جهازك:'), 8200);
        return () => { scanAdd = null; BT.bleStopScan(); };
      });
      bleDev = new Device(d); return bleDev;
    }
  };
  let scanAdd = null; const listEmpty = () => !document.querySelector('[data-l] button');

  /* ---------- classic Bluetooth SPP as navigator.serial ---------- */
  const ports = new Map(); // address -> port, so the same object comes back every time
  const known = () => { try { return JSON.parse(localStorage.getItem('uvl15w_spp_ports') || '[]'); } catch (e) { return []; } };
  const remember = a => { try { const k = known(); if (!k.includes(a)) { k.push(a); localStorage.setItem('uvl15w_spp_ports', JSON.stringify(k)); } } catch (e) {} };
  function portFor(d) {
    if (ports.has(d.address)) return ports.get(d.address);
    const id = 'p' + (++seq);
    const port = { _id: id, _addr: d.address, _name: d.name, readable: null, writable: null, _ctl: null,
      getInfo() { return { bluetoothServiceClassId: SPP_UUID, name: this._name, address: this._addr }; },
      async open() {
        if (this.readable) throw new DOMException('The port is already open.', 'InvalidStateError');
        const p = wait('sppOpen:' + id); BT.sppOpen(id, this._addr); await p;
        this.readable = new ReadableStream({ start: c => { this._ctl = c; }, cancel: () => {} });
        this.writable = new WritableStream({ write: ch => { if (!BT.sppWrite(id, b64e(ch instanceof Uint8Array ? ch : new Uint8Array(ch)))) throw new DOMException('write failed', 'NetworkError'); } });
      },
      async close() { BT.sppClose(id); this._end(); },
      _end() { try { this._ctl && this._ctl.close(); } catch (e) {} this._ctl = null; this.readable = null; this.writable = null; }
    };
    ports.set(d.address, port); return port;
  }
  const serial = {
    async requestPort() {
      const d = await picker('اختر الجهاز (بلوتوث الكلاسيك SPP)', (add, msg) => {
        if (!BT.ensurePermissions()) { msg('اسمح للتطبيق باستخدام البلوتوث، وبعدها جرّب مرة ثانية.'); return null; }
        const l = JSON.parse(BT.sppBonded() || '[]'); l.forEach(add);
        msg(l.length ? 'الأجهزة المقترنة. اختر جهازك:' : 'ما فيه أجهزة مقترنة. اقرن الجهاز من إعدادات بلوتوث الجوال أول.');
        return null;
      });
      remember(d.address); return portFor(d);
    },
    async getPorts() {
      const bonded = JSON.parse(BT.sppBonded() || '[]');
      return known().map(a => bonded.find(b => b.address === a)).filter(Boolean).map(portFor);
    }
  };
  const portById = id => [...ports.values()].find(p => p._id === id);

  /* ---------- events from Java ---------- */
  window.__bt = json => {
    const e = JSON.parse(json);
    switch (e.t) {
      case 'bleDev': if (scanAdd) scanAdd(e); break;
      case 'bleConn': settle('bleConn', e.ok, e.err); break;
      case 'bleNotify': settle('bleNotify', e.ok, e.err); break;
      case 'bleWrote': settle('bleWrote', e.ok, e.err); break;
      case 'bleData': { const u = b64d(e.data), ev = { target: { value: new DataView(u.buffer) } }; notifyCb.forEach(f => { try { f(ev); } catch (x) {} }); break; }
      case 'bleDisc':
        if (bleDev) { bleDev.gatt.connected = false; bleDev._l.forEach(f => { try { f({ target: bleDev }); } catch (x) {} }); }
        ['bleConn', 'bleNotify', 'bleWrote'].forEach(k => { while ((waiters[k] || []).length) settle(k, false, 'disconnected'); });
        notifyCb = []; break;
      case 'sppOpen': settle('sppOpen:' + e.id, e.ok, e.err || 'Failed to open serial port.'); break;
      case 'sppData': { const p = portById(e.id); if (p && p._ctl) try { p._ctl.enqueue(b64d(e.data)); } catch (x) {} break; }
      case 'sppClosed': { const p = portById(e.id); if (p && p._ctl) { try { p._ctl.error(new DOMException(e.err || 'The device has been lost.', 'NetworkError')); } catch (x) {} p._ctl = null; p.readable = null; p.writable = null; } break; }
    }
  };

  Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true });
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });

  /* ---------- files, notifications, screen ---------- */
  if (APP) {
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && /^(blob|data):/.test(this.href)) {
        const name = this.download;
        fetch(this.href).then(r => r.arrayBuffer()).then(b => APP.saveFile(name, b64e(new Uint8Array(b))));
        return;
      }
      return origClick.call(this);
    };
    class N { constructor(t, o) { APP.notify(String(t), String((o && o.body) || '')); } static get permission() { return 'granted'; } static async requestPermission() { return APP.notifyPermission() ? 'granted' : 'denied'; } }
    window.Notification = N;
    if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = async function (t, o) { APP.notify(String(t), String((o && o.body) || '')); };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { async request() { APP.keepScreenOn(true); return { released: false, async release() { this.released = true; APP.keepScreenOn(false); }, addEventListener() {} }; } } });
  }
  window.__inNativeApp = true;
})();
