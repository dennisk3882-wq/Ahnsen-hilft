import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(ROOT, 'app.js');
const swPath = path.join(ROOT, 'sw.js');
let app = fs.readFileSync(appPath, 'utf8');
let sw = fs.readFileSync(swPath, 'utf8');

const from = `      const jobSupportedPopulation = Math.floor(this.jobsCapacity() / .42);
      const economicRoom = employment < .55 ? Math.max(2, Math.round(this.population * .01)) : Math.max(5, jobSupportedPopulation - populationAfterLeaving);`;
const to = `      // Arbeitsplätze und lokale Nachfrage wachsen teilweise mit neuen Einwohnern.
      // Deshalb darf Zuzug nicht verlangen, dass sämtliche künftigen Jobs schon vorher existieren.
      // Schlechte Beschäftigung bremst weiterhin stark; gute Beschäftigung schafft echte Wachstumsreserve.
      const employmentGrowthRate = clamp((employment - .52) * .32, .01, .14);
      const economicRoom = employment < .55
        ? Math.max(2, Math.round(this.population * .008))
        : Math.max(5, Math.round(this.population * employmentGrowthRate));`;

const index = app.indexOf(from);
if (index < 0) throw new Error('Growth patch anchor missing');
if (app.indexOf(from, index + from.length) >= 0) throw new Error('Growth patch anchor not unique');
app = app.slice(0,index) + to + app.slice(index + from.length);

if (!sw.includes("const CACHE = 'buergermeister-1992-plus-v3';")) throw new Error('Unexpected service worker cache version');
sw = sw.replace("const CACHE = 'buergermeister-1992-plus-v3';", "const CACHE = 'buergermeister-1992-plus-v4';");

fs.writeFileSync(appPath, app);
fs.writeFileSync(swPath, sw);
console.log('Employment-driven growth fix applied.');
