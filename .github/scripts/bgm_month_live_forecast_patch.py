from pathlib import Path

root = Path('BuergermeisterPWA')
app_path = root / 'app.js'
css_path = root / 'styles.css'
sw_path = root / 'sw.js'

app = app_path.read_text(encoding='utf-8')

old = r'''  function openMonthModal(g) {
    const maxFood = g.inventory.food;
    const defaultFood = Math.min(maxFood, g.monthlyFoodNeed());
    const defaultAdmit = Math.max(0, Math.min(1000, g.housingCapacity()-g.population));
    const f = g.forecast();
    const overlay = document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML = `<div class="modal"><div class="hint">MONATSENDE ${String(g.month).padStart(2,'0')}/${g.year}</div><h2>Entscheidungen des Bürgermeisters</h2>
      <div class="decision-forecast ${f.sustainableBalance<0?'negative':'positive'}">Saldo nach laufender Versorgung: <b>${money(f.sustainableBalance)}</b></div>
      <div class="field"><label>Wohnsteuer: <b id="taxOut">${g.taxRate}%</b></label><input id="tax" type="range" min="0" max="30" value="${g.taxRate}"><div class="hint">Niedrige Steuern fördern Zuzug; hohe Steuern erhöhen Einnahmen, kosten aber Zustimmung.</div></div>
      <div class="field"><label>Nahrung für Einwohner: <b id="foodOut">${fmt.format(defaultFood)}</b></label><input id="food" type="range" min="0" max="${maxFood}" value="${defaultFood}"><div class="hint">Bedarf aktuell ungefähr ${fmt.format(g.monthlyFoodNeed())} Einheiten. Supermärkte sind bereits berücksichtigt.</div></div>
      <div class="field"><label>Maximal aufzunehmende Zuzügler</label><input id="admit" type="number" min="0" max="5000" value="${defaultAdmit}"><div class="hint">Ein Limit schützt dich davor, schneller zu wachsen als Versorgung und Arbeitsmarkt verkraften.</div></div>
      <div class="two-col"><button class="btn" id="cancelMonth">ABBRECHEN</button><button class="btn primary" id="confirmMonth">MONAT BERECHNEN</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const tax=overlay.querySelector('#tax'), food=overlay.querySelector('#food');
    tax.oninput=()=>overlay.querySelector('#taxOut').textContent=`${tax.value}%`;
    food.oninput=()=>overlay.querySelector('#foodOut').textContent=fmt.format(Number(food.value));
    overlay.querySelector('#cancelMonth').onclick=()=>overlay.remove();
    overlay.querySelector('#confirmMonth').onclick=()=>{
      const settings={taxRate:tax.value,foodAllocation:food.value,admitLimit:overlay.querySelector('#admit').value}; overlay.remove(); g.advanceMonth(settings);
    };
  }
'''

new = r'''  function openMonthModal(g) {
    const maxFood = g.inventory.food;
    const foodNeed = g.monthlyFoodNeed();
    const defaultFood = Math.min(maxFood, foodNeed);
    const defaultAdmit = Math.max(0, Math.min(1000, g.housingCapacity()-g.population));
    const baseForecast = g.forecast();
    const overlay = document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML = `<div class="modal month-decision-modal"><div class="hint">MONATSENDE ${String(g.month).padStart(2,'0')}/${g.year}</div><h2>Entscheidungen des Bürgermeisters</h2>
      <div class="decision-forecast ${baseForecast.sustainableBalance<0?'negative':'positive'}" id="liveForecastBox">
        <div class="decision-forecast-label">Voraussichtlicher Saldo nach Versorgung</div>
        <b class="decision-forecast-value" id="liveSaldo">${money(baseForecast.sustainableBalance)}</b>
        <div class="live-forecast-grid">
          <div><span>Einwohnersteuer</span><b id="liveResidentTax">+${money(baseForecast.residents)}</b></div>
          <div><span>Steuereffekt</span><b id="liveTaxDelta">±0 $</b></div>
          <div><span>Operativer Saldo</span><b id="liveOperating">${money(baseForecast.balance)}</b></div>
          <div><span>Versorgung</span><b id="liveFoodCoverage">${foodNeed ? Math.round(defaultFood/foodNeed*100) : 100}%</b></div>
        </div>
      </div>
      <div class="field"><label>Wohnsteuer: <b id="taxOut">${g.taxRate}%</b></label><input id="tax" type="range" min="0" max="30" value="${g.taxRate}"><div class="hint">Der Saldo oben wird live neu berechnet. Höhere Steuern bringen sofort mehr Einnahmen, senken aber Attraktivität und Zustimmung.</div></div>
      <div class="field"><label>Nahrung für Einwohner: <b id="foodOut">${fmt.format(defaultFood)}</b></label><input id="food" type="range" min="0" max="${maxFood}" value="${defaultFood}"><div class="hint">Bedarf aktuell ungefähr ${fmt.format(foodNeed)} Einheiten. Die Versorgungsquote oben reagiert ebenfalls live.</div></div>
      <div class="field"><label>Maximal aufzunehmende Zuzügler</label><input id="admit" type="number" min="0" max="5000" value="${defaultAdmit}"><div class="hint">Neue Einwohner wirken erst ab dem Folgemonat auf die Steuereinnahmen. Das Limit beeinflusst deshalb den aktuellen Saldo nicht künstlich.</div></div>
      <div class="two-col"><button class="btn" id="cancelMonth">ABBRECHEN</button><button class="btn primary" id="confirmMonth">MONAT BERECHNEN</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const tax=overlay.querySelector('#tax');
    const food=overlay.querySelector('#food');
    const taxOut=overlay.querySelector('#taxOut');
    const foodOut=overlay.querySelector('#foodOut');
    const forecastBox=overlay.querySelector('#liveForecastBox');
    const saldoOut=overlay.querySelector('#liveSaldo');
    const residentTaxOut=overlay.querySelector('#liveResidentTax');
    const taxDeltaOut=overlay.querySelector('#liveTaxDelta');
    const operatingOut=overlay.querySelector('#liveOperating');
    const foodCoverageOut=overlay.querySelector('#liveFoodCoverage');

    const liveProjection = () => {
      const selectedTax = clamp(Number(tax.value) || 0, 0, 30);
      const selectedFood = clamp(Number(food.value) || 0, 0, maxFood);
      const employment = clamp(g.employmentCoverage(), 0, 1);
      const taxableFactor = .58 + employment * .42;
      const residentTax = Math.round(g.population * taxableFactor * (selectedTax / 100) * 13.5 * g.productivityFactor());
      const totalRevenue = residentTax + baseForecast.commerce;
      const operatingBalance = totalRevenue - baseForecast.expenses;
      const sustainableBalance = operatingBalance - baseForecast.foodProvision;
      const taxDelta = residentTax - baseForecast.residents;
      const coverage = foodNeed ? Math.round(selectedFood / foodNeed * 100) : 100;

      taxOut.textContent = `${selectedTax}%`;
      foodOut.textContent = fmt.format(Math.round(selectedFood));
      residentTaxOut.textContent = `+${money(residentTax)}`;
      taxDeltaOut.textContent = taxDelta === 0 ? '±0 $' : `${taxDelta > 0 ? '+' : ''}${money(taxDelta)}`;
      taxDeltaOut.className = taxDelta > 0 ? 'good' : taxDelta < 0 ? 'bad' : '';
      operatingOut.textContent = money(operatingBalance);
      operatingOut.className = operatingBalance >= 0 ? 'good' : 'bad';
      saldoOut.textContent = money(sustainableBalance);
      forecastBox.classList.toggle('positive', sustainableBalance >= 0);
      forecastBox.classList.toggle('negative', sustainableBalance < 0);
      foodCoverageOut.textContent = `${coverage}%`;
      foodCoverageOut.className = coverage >= 100 ? 'good' : coverage >= 90 ? 'warn' : 'bad';
    };

    tax.addEventListener('input', liveProjection);
    food.addEventListener('input', liveProjection);
    liveProjection();
    overlay.querySelector('#cancelMonth').onclick=()=>overlay.remove();
    overlay.querySelector('#confirmMonth').onclick=()=>{
      const settings={taxRate:tax.value,foodAllocation:food.value,admitLimit:overlay.querySelector('#admit').value}; overlay.remove(); g.advanceMonth(settings);
    };
  }
'''

if old not in app:
    raise SystemExit('openMonthModal block not found; refusing unsafe patch')
app = app.replace(old, new, 1)
app_path.write_text(app, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* Bürgermeister live month forecast v1 */'
if marker not in css:
    css += r'''

/* Bürgermeister live month forecast v1 */
.month-decision-modal { width:min(100%,680px); }
.decision-forecast { padding:10px 12px !important; }
.decision-forecast-label { color:#9eb5df; font-size:.64rem; text-transform:uppercase; letter-spacing:.04em; }
.decision-forecast-value { display:block; margin:3px 0 9px; font-size:1.28rem; color:#fff0bc; }
.decision-forecast.positive .decision-forecast-value { color:var(--good); }
.decision-forecast.negative .decision-forecast-value { color:var(--bad); }
.live-forecast-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; }
.live-forecast-grid > div { min-width:0; padding:6px 7px; border:1px solid #4969a7; background:rgba(7,16,40,.34); }
.live-forecast-grid span { display:block; color:#819aca; font-size:.54rem; }
.live-forecast-grid b { display:block; margin-top:2px; color:#fff1c1; font-size:.72rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
@media(max-width:520px){
  .month-decision-modal { max-height:calc(100dvh - 24px); overflow:auto; }
  .live-forecast-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .decision-forecast-value { font-size:1.12rem; }
}
'''
css_path.write_text(css, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
if "buergermeister-1992-plus-v8" not in sw:
    raise SystemExit('Expected service worker cache v8 not found')
sw = sw.replace('buergermeister-1992-plus-v8', 'buergermeister-1992-plus-v9', 1)
sw_path.write_text(sw, encoding='utf-8')
