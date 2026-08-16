import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(ROOT, 'app.js');
const swPath = path.join(ROOT, 'sw.js');
let app = fs.readFileSync(appPath, 'utf8');
let sw = fs.readFileSync(swPath, 'utf8');

function replaceOnce(label, from, to) {
  const at = app.indexOf(from);
  if (at < 0) throw new Error(`Patch anchor missing: ${label}`);
  if (app.indexOf(from, at + from.length) >= 0) throw new Error(`Patch anchor not unique: ${label}`);
  app = app.slice(0, at) + to + app.slice(at + from.length);
  console.log(`patched: ${label}`);
}

replaceOnce('good harvest has a real price effect',
"    { minPop:0, apply:g => { g.market.food = Math.max(1, Math.round(g.market.food * .78)); g.log('Gute Ernte: Nahrung ist billiger geworden.', 'good'); } },",
"    { minPop:0, apply:g => { g.market.food = Math.max(1, Math.floor(g.market.food * .72)); g.log('Gute Ernte: Nahrung ist billiger geworden.', 'good'); } },");

replaceOnce('baseline food consumption',
`    foodEfficiency() {
      return 1 - Math.min(.20, this.inventory.supermarkets * .04);
    }`,
`    foodEfficiency() {
      // Eine Nahrungseinheit steht für einen Warenkorb, nicht für eine einzelne Mahlzeit.
      // 0,68 pro Einwohner hält die Startstadt wirtschaftlich überlebensfähig,
      // Supermärkte senken Logistikverluste weiterhin um bis zu 20 %.
      return .68 * (1 - Math.min(.20, this.inventory.supermarkets * .04));
    }`);

replaceOnce('forecast includes food sustainability',
`    forecast() {
      const rev = this.revenueBreakdown();
      const building = this.buildingMaintenance();
      const services = this.serviceCost();
      const interest = this.debtInterest();
      const expenses = building + services + interest;
      return { ...rev, building, services, interest, expenses, balance: rev.total - expenses };
    }`,
`    foodProvisionCost() {
      return Math.round(this.monthlyFoodNeed() * this.market.food);
    }

    forecast() {
      const rev = this.revenueBreakdown();
      const building = this.buildingMaintenance();
      const services = this.serviceCost();
      const interest = this.debtInterest();
      const expenses = building + services + interest;
      const balance = rev.total - expenses;
      const foodProvision = this.foodProvisionCost();
      return {
        ...rev, building, services, interest, expenses, balance,
        foodProvision,
        sustainableBalance: balance - foodProvision
      };
    }`);

replaceOnce('advisor judges sustainable balance',
`      if (f.balance < 0) notes.push({type:'bad', text:\`Der laufende Haushalt liegt voraussichtlich \${money(Math.abs(f.balance))} im Minus.\`});`,
`      if (f.sustainableBalance < 0) notes.push({type:'bad', text:\`Nach Wiederbeschaffung der verbrauchten Nahrung fehlen voraussichtlich \${money(Math.abs(f.sustainableBalance))} pro Monat.\`});
      else if (f.balance < 0) notes.push({type:'bad', text:\`Der laufende Haushalt liegt voraussichtlich \${money(Math.abs(f.balance))} im Minus.\`});`);

replaceOnce('budget UI shows provision sustainability',
`            <div class="resource"><span>Gebäudeunterhalt</span><b class="bad">-\${money(f.building)}</b></div>
            <div class="resource"><span>Städtische Dienste</span><b class="bad">-\${money(f.services)}</b></div>
            \${f.interest?\`<div class="resource"><span>Schuldzinsen</span><b class="bad">-\${money(f.interest)}</b></div>\`:''}
            <div class="resource strong"><span>Voraussichtlicher Saldo</span><b class="\${f.balance<0?'bad':'good'}">\${money(f.balance)}</b></div>`,
`            <div class="resource"><span>Gebäudeunterhalt</span><b class="bad">-\${money(f.building)}</b></div>
            <div class="resource"><span>Städtische Dienste</span><b class="bad">-\${money(f.services)}</b></div>
            \${f.interest?\`<div class="resource"><span>Schuldzinsen</span><b class="bad">-\${money(f.interest)}</b></div>\`:''}
            <div class="resource"><span>Nahrung · Wiederbeschaffung*</span><b class="bad">-\${money(f.foodProvision)}</b></div>
            <div class="resource"><span>Operativer Saldo</span><b class="\${f.balance<0?'bad':'good'}">\${money(f.balance)}</b></div>
            <div class="resource strong"><span>Saldo nach Versorgung*</span><b class="\${f.sustainableBalance<0?'bad':'good'}">\${money(f.sustainableBalance)}</b></div>
            <div class="hint">*Planwert: Kosten, um die in einem normalen Monat verbrauchte Nahrung zum aktuellen Marktpreis wieder aufzufüllen.</div>`);

replaceOnce('month decision forecast uses sustainable balance',
`      <div class="decision-forecast \${f.balance<0?'negative':'positive'}">Aktuelle Haushaltsprognose: <b>\${money(f.balance)}</b></div>`,
`      <div class="decision-forecast \${f.sustainableBalance<0?'negative':'positive'}">Saldo nach laufender Versorgung: <b>\${money(f.sustainableBalance)}</b></div>`);

replaceOnce('food info explains units',
`      food: 'Jeden Monat muss ausreichend Nahrung zugeteilt werden. Supermärkte senken durch bessere Verteilung den Bedarf etwas. Unterversorgung drückt die Zustimmung, führt zu Wegzug und kann das Spiel beenden.'`,
`      food: 'Jeden Monat muss ausreichend Nahrung zugeteilt werden. Eine Einheit steht für einen standardisierten Warenkorb; der Grundbedarf liegt bei rund 0,68 Einheiten je Einwohner und Monat. Supermärkte senken Logistikverluste zusätzlich. Unterversorgung drückt die Zustimmung, führt zu Wegzug und kann das Spiel beenden.'`);

if (!sw.includes("const CACHE = 'buergermeister-1992-plus-v2';")) throw new Error('Unexpected service worker cache version');
sw = sw.replace("const CACHE = 'buergermeister-1992-plus-v2';", "const CACHE = 'buergermeister-1992-plus-v3';");

fs.writeFileSync(appPath, app);
fs.writeFileSync(swPath, sw);
console.log('Balance correction applied successfully.');
