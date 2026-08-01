'use strict';

const fs = require('fs');
const path = require('path');

const baseQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, 'adult-questions.json'), 'utf8'));

const CATEGORY_CONTEXT = Object.freeze({
  Allgemeinwissen: 'Diese Einordnung gehört zum zeitstabilen Grundwissen und benötigt keine tagesaktuelle Bewertung.',
  Geografie: 'Damit lässt sich der Ort geografisch eindeutig einordnen.',
  Geschichte: 'Die zeitliche Einordnung stellt den historischen Zusammenhang her.',
  'Natur & Wissenschaft': 'Der Zusammenhang folgt aus grundlegenden naturwissenschaftlichen Begriffen und Beobachtungen.',
  Musik: 'Diese Zuordnung gehört zur Musikgeschichte oder zur grundlegenden Musiklehre.',
  Sport: 'Die Angabe gehört zu den grundlegenden Regeln und Begriffen der Sportart.',
  'Film & Fernsehen': 'Die Zuordnung ist Teil der Filmgeschichte, Besetzung oder Produktion.',
  Technik: 'Der Begriff beschreibt eine grundlegende technische Funktion oder Eigenschaft.',
  'Essen & Trinken': 'Die Einordnung beruht auf der üblichen Zubereitung, Herkunft oder Lebensmittelkunde.',
});

function sentenceCount(value) {
  return String(value || '').split(/(?<=[.!?])\s+/u).filter(Boolean).length;
}

function normalizedExplanation(question) {
  const first = String(question.explanation || '').trim().replace(/\s+/g, ' ')
    || `Die richtige Antwort lautet „${question.options[question.correctIndex]}“.`;
  if (sentenceCount(first) >= 2) return first;
  return `${first} ${CATEGORY_CONTEXT[question.category] || CATEGORY_CONTEXT.Allgemeinwissen}`;
}

function normalizedText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]+/giu, ' ').trim();
}

function optionLayout(correct, distractors, index) {
  const clean = [...new Set([correct, ...distractors].map(value => String(value).trim()).filter(Boolean))];
  if (clean.length < 4) throw new Error(`Zu wenige unterschiedliche Antworten für „${correct}“.`);
  const wrong = clean.filter(value => value !== correct).slice(0, 3);
  const correctIndex = index % 4;
  const options = [...wrong];
  options.splice(correctIndex, 0, correct);
  return { options, correctIndex };
}

function makeQuestion(prefix, category, index, text, correct, distractors, explanation) {
  const layout = optionLayout(correct, distractors, index);
  return {
    id: `adult-${prefix}-${String(index + 1).padStart(3, '0')}`,
    category,
    text: /[?？]$/u.test(text) ? text : `${text}?`,
    options: layout.options,
    correctIndex: layout.correctIndex,
    explanation: `${explanation} ${CATEGORY_CONTEXT[category] || CATEGORY_CONTEXT.Allgemeinwissen}`,
  };
}

function rotatingDistractors(values, index, valueIndex = 1) {
  const offsets = [7, 17, 29, 41];
  const result = [];
  for (const offset of offsets) {
    const value = values[(index + offset) % values.length][valueIndex];
    if (!result.includes(value) && value !== values[index][valueIndex]) result.push(value);
    if (result.length === 3) break;
  }
  return result;
}

const additions = [];

const capitals = [
  ['Afghanistan','Kabul'],['Albanien','Tirana'],['Algerien','Algier'],['Argentinien','Buenos Aires'],['Armenien','Jerewan'],
  ['Australien','Canberra'],['Österreich','Wien'],['Aserbaidschan','Baku'],['Bangladesch','Dhaka'],['Belgien','Brüssel'],
  ['Brasilien','Brasília'],['Bulgarien','Sofia'],['Kanada','Ottawa'],['Chile','Santiago de Chile'],['China','Peking'],
  ['Kolumbien','Bogotá'],['Kroatien','Zagreb'],['Kuba','Havanna'],['Tschechien','Prag'],['Dänemark','Kopenhagen'],
  ['Ägypten','Kairo'],['Estland','Tallinn'],['Finnland','Helsinki'],['Frankreich','Paris'],['Georgien','Tiflis'],
  ['Griechenland','Athen'],['Ungarn','Budapest'],['Island','Reykjavík'],['Indien','Neu-Delhi'],['Irland','Dublin'],
  ['Italien','Rom'],['Japan','Tokio'],['Jordanien','Amman'],['Kenia','Nairobi'],['Lettland','Riga'],
  ['Litauen','Vilnius'],['Luxemburg','Luxemburg'],['Mexiko','Mexiko-Stadt'],['Mongolei','Ulaanbaatar'],['Marokko','Rabat'],
  ['Niederlande','Amsterdam'],['Neuseeland','Wellington'],['Norwegen','Oslo'],['Pakistan','Islamabad'],['Peru','Lima'],
  ['Polen','Warschau'],['Portugal','Lissabon'],['Rumänien','Bukarest'],['Slowakei','Bratislava'],['Slowenien','Ljubljana'],
  ['Südkorea','Seoul'],['Spanien','Madrid'],['Schweden','Stockholm'],['Schweiz','Bern'],['Thailand','Bangkok'],
  ['Türkei','Ankara'],['Ukraine','Kyjiw'],['Vereinigtes Königreich','London'],['Vereinigte Staaten','Washington, D.C.'],['Uruguay','Montevideo'],
  ['Vietnam','Hanoi'],
];
capitals.forEach((item, index) => additions.push(makeQuestion(
  'geo-plus', 'Geografie', index,
  `Wie heißt die Hauptstadt von ${item[0]}`, item[1], rotatingDistractors(capitals, index),
  `${item[1]} ist die Hauptstadt von ${item[0]}.`,
)));

const elements = [
  ['Wasserstoff','H'],['Helium','He'],['Lithium','Li'],['Kohlenstoff','C'],['Stickstoff','N'],['Sauerstoff','O'],
  ['Fluor','F'],['Neon','Ne'],['Natrium','Na'],['Magnesium','Mg'],['Aluminium','Al'],['Silicium','Si'],
  ['Phosphor','P'],['Schwefel','S'],['Chlor','Cl'],['Kalium','K'],['Calcium','Ca'],['Eisen','Fe'],
  ['Kupfer','Cu'],['Zink','Zn'],['Silber','Ag'],['Zinn','Sn'],['Gold','Au'],['Quecksilber','Hg'],
  ['Blei','Pb'],['Uran','U'],['Nickel','Ni'],['Kobalt','Co'],['Iod','I'],['Brom','Br'],
];
elements.forEach((item, index) => additions.push(makeQuestion(
  'science-element', 'Natur & Wissenschaft', index,
  `Welches chemische Symbol hat ${item[0]}`, item[1], rotatingDistractors(elements, index),
  `Das chemische Symbol für ${item[0]} lautet ${item[1]}.`,
)));

const historyFacts = [
  ['In welchem Jahr begann die Französische Revolution','1789',['1776','1815','1848'],'Die Französische Revolution begann 1789 mit tiefgreifenden politischen und gesellschaftlichen Umbrüchen.'],
  ['In welchem Jahr fiel die Berliner Mauer','1989',['1987','1990','1991'],'Die Berliner Mauer fiel am 9. November 1989.'],
  ['In welchem Jahr wurde Deutschland wiedervereinigt','1990',['1989','1991','1993'],'Die deutsche Wiedervereinigung trat am 3. Oktober 1990 in Kraft.'],
  ['In welchem Jahr begann der Erste Weltkrieg','1914',['1912','1916','1918'],'Der Erste Weltkrieg begann 1914 nach der Julikrise.'],
  ['In welchem Jahr endete der Zweite Weltkrieg in Europa','1945',['1943','1944','1946'],'Der Zweite Weltkrieg endete in Europa im Mai 1945.'],
  ['In welchem Jahr landeten erstmals Menschen auf dem Mond','1969',['1961','1965','1972'],'Apollo 11 brachte 1969 die ersten Menschen auf den Mond.'],
  ['In welchem Jahr veröffentlichte Martin Luther seine 95 Thesen','1517',['1492','1521','1555'],'Martin Luther veröffentlichte seine 95 Thesen im Jahr 1517.'],
  ['In welchem Jahr wurde die amerikanische Unabhängigkeitserklärung verabschiedet','1776',['1756','1789','1812'],'Die Unabhängigkeitserklärung der Vereinigten Staaten wurde 1776 verabschiedet.'],
  ['In welchem Jahr fand der Wiener Kongress seinen Abschluss','1815',['1804','1812','1848'],'Der Wiener Kongress ordnete 1815 Europa nach den Napoleonischen Kriegen neu.'],
  ['In welchem Jahr begann die Oktoberrevolution in Russland','1917',['1905','1914','1922'],'Die Oktoberrevolution fand 1917 nach dem damals in Russland verwendeten julianischen Kalender statt.'],
  ['In welchem Jahr fanden die ersten Olympischen Spiele der Neuzeit statt','1896',['1888','1900','1904'],'Die ersten Olympischen Spiele der Neuzeit wurden 1896 in Athen ausgetragen.'],
  ['In welchem Jahr wurde Konstantinopel von den Osmanen erobert','1453',['1415','1492','1517'],'Konstantinopel wurde 1453 von den Osmanen erobert.'],
  ['In welchem Jahr begann der Dreißigjährige Krieg','1618',['1608','1648','1683'],'Der Dreißigjährige Krieg begann 1618 mit dem Prager Fenstersturz.'],
  ['In welchem Jahr wurde das Deutsche Kaiserreich gegründet','1871',['1848','1866','1919'],'Das Deutsche Kaiserreich wurde 1871 in Versailles gegründet.'],
  ['In welchem Jahr trat die Weimarer Verfassung in Kraft','1919',['1918','1923','1933'],'Die Weimarer Verfassung trat 1919 in Kraft.'],
  ['In welchem Jahr wurde der Versailler Vertrag unterzeichnet','1919',['1918','1920','1923'],'Der Versailler Vertrag wurde 1919 unterzeichnet.'],
  ['In welchem Jahr krönte sich Napoleon zum Kaiser der Franzosen','1804',['1789','1799','1815'],'Napoleon krönte sich 1804 in Paris zum Kaiser.'],
  ['In welchem Jahr sank die Titanic','1912',['1908','1914','1918'],'Die Titanic sank im April 1912 nach der Kollision mit einem Eisberg.'],
  ['In welchem Jahr wurde der Suezkanal eröffnet','1869',['1859','1871','1889'],'Der Suezkanal wurde 1869 eröffnet und verbindet Mittelmeer und Rotes Meer.'],
  ['In welchem Jahr gelang Charles Lindbergh der Nonstopflug über den Atlantik','1927',['1919','1931','1939'],'Charles Lindbergh überquerte 1927 allein und nonstop den Atlantik.'],
  ['In welchem Jahr wurde der Vertrag von Maastricht unterzeichnet','1992',['1986','1990','1999'],'Der Vertrag von Maastricht wurde 1992 unterzeichnet und begründete die Europäische Union.'],
  ['In welchem Jahr wurde Euro-Bargeld eingeführt','2002',['1999','2000','2004'],'Euro-Banknoten und Euro-Münzen wurden 2002 eingeführt.'],
  ['In welchem Jahr ereignete sich die Reaktorkatastrophe von Tschernobyl','1986',['1979','1989','1991'],'Die Reaktorkatastrophe von Tschernobyl ereignete sich 1986.'],
  ['In welchem Jahr löste sich die Sowjetunion auf','1991',['1989','1990','1993'],'Die Sowjetunion löste sich Ende 1991 auf.'],
  ['In welchem Jahr flog Juri Gagarin als erster Mensch ins All','1961',['1957','1965','1969'],'Juri Gagarin umrundete 1961 als erster Mensch die Erde im Weltraum.'],
  ['In welchem Jahr wurde die Magna Carta besiegelt','1215',['1066','1291','1356'],'Die Magna Carta wurde 1215 in England besiegelt.'],
  ['In welchem Jahr erreichte Christoph Kolumbus die Karibik','1492',['1453','1485','1500'],'Christoph Kolumbus erreichte 1492 Inseln der Karibik.'],
  ['In welchem Jahr wurde Rom traditionell gegründet','753 v. Chr.',['509 v. Chr.','44 v. Chr.','27 v. Chr.'],'Der römischen Überlieferung zufolge wurde Rom 753 vor Christus gegründet.'],
  ['In welchem Jahr begann die Reformation in England unter Heinrich VIII. mit dem Suprematsakt','1534',['1517','1555','1588'],'Der Suprematsakt von 1534 löste die englische Kirche von der päpstlichen Oberhoheit.'],
  ['In welchem Jahr wurde die erste Eisenbahnstrecke in Deutschland eröffnet','1835',['1815','1848','1871'],'Die Strecke Nürnberg–Fürth wurde 1835 als erste deutsche Eisenbahnstrecke eröffnet.'],
];
historyFacts.forEach((item, index) => additions.push(makeQuestion('history-plus','Geschichte',index,item[0],item[1],item[2],item[3])));

const generalFacts = [
  ['Wer schrieb den Roman „Der Prozess“','Franz Kafka',['Thomas Mann','Hermann Hesse','Bertolt Brecht'],'Franz Kafka schrieb den unvollendet gebliebenen Roman „Der Prozess“.'],
  ['Wer schrieb „Don Quijote“','Miguel de Cervantes',['Federico García Lorca','Gabriel García Márquez','Jorge Luis Borges'],'Miguel de Cervantes schrieb den Roman „Don Quijote“.'],
  ['Wer schrieb „Der kleine Prinz“','Antoine de Saint-Exupéry',['Jules Verne','Victor Hugo','Albert Camus'],'Antoine de Saint-Exupéry schrieb „Der kleine Prinz“.'],
  ['Wer malte „Guernica“','Pablo Picasso',['Salvador Dalí','Joan Miró','Claude Monet'],'Pablo Picasso malte „Guernica“ als Reaktion auf die Bombardierung der baskischen Stadt.'],
  ['Wer malte „Die Sternennacht“','Vincent van Gogh',['Paul Cézanne','Edvard Munch','Paul Gauguin'],'Vincent van Gogh malte „Die Sternennacht“ im Jahr 1889.'],
  ['Wer schuf die Skulptur „Der Denker“','Auguste Rodin',['Alberto Giacometti','Henry Moore','Constantin Brâncuși'],'Auguste Rodin schuf die bekannte Skulptur „Der Denker“.'],
  ['Welcher römischen Zahl entspricht 50','L',['X','C','D'],'Die römische Zahl L steht für 50.'],
  ['Wie viel ist die Quadratwurzel aus 144','12',['10','14','16'],'Die Zahl 12 mit sich selbst multipliziert ergibt 144.'],
  ['Wie viel sind 15 Prozent von 200','30',['15','25','40'],'Fünfzehn Prozent von 200 sind 30.'],
  ['Wie groß ist die Winkelsumme in einem Dreieck','180 Grad',['90 Grad','270 Grad','360 Grad'],'Die Innenwinkel eines ebenen Dreiecks ergeben zusammen 180 Grad.'],
  ['Wie viele Seiten hat ein regelmäßiges Sechseck','6',['5','7','8'],'Ein Sechseck besitzt sechs Seiten.'],
  ['Was ist ein Palindrom','Ein Text, der vorwärts und rückwärts gleich gelesen wird',['Ein Wort mit zwei Bedeutungen','Ein ungereimtes Gedicht','Eine Abkürzung aus Anfangsbuchstaben'],'Ein Palindrom lässt sich in beiden Leserichtungen gleich lesen.'],
  ['Was bezeichnet ein Synonym','Ein Wort mit gleicher oder ähnlicher Bedeutung',['Ein Wort mit gegenteiliger Bedeutung','Ein erfundenes Wort','Ein veraltetes Satzzeichen'],'Ein Synonym hat dieselbe oder eine sehr ähnliche Bedeutung wie ein anderes Wort.'],
  ['Was bezeichnet ein Antonym','Ein Wort mit gegenteiliger Bedeutung',['Ein Wort mit gleicher Bedeutung','Ein Eigennamenkürzel','Ein Reimwort'],'Ein Antonym bezeichnet das Bedeutungsgegenstück zu einem anderen Wort.'],
  ['Welche Wortart bezeichnet Personen, Dinge oder Begriffe','Substantiv',['Adverb','Konjunktion','Präposition'],'Substantive benennen Personen, Dinge, Lebewesen oder abstrakte Begriffe.'],
  ['Wie viele Nullen hat eine Million','6',['5','7','9'],'Eine Million wird als 1.000.000 geschrieben und hat sechs Nullen.'],
  ['Welcher Bruch entspricht 0,25','Ein Viertel',['Ein Drittel','Ein Fünftel','Drei Viertel'],'Die Dezimalzahl 0,25 entspricht dem Bruch ein Viertel.'],
  ['Was ist das Ergebnis von 7 hoch 2','49',['14','42','64'],'Sieben hoch zwei bedeutet 7 mal 7 und ergibt 49.'],
  ['Wie nennt man ein Vieleck mit acht Seiten','Achteck',['Sechseck','Siebeneck','Neuneck'],'Ein Vieleck mit acht Seiten heißt Achteck oder Oktogon.'],
  ['Wie viele Grad hat ein rechter Winkel','90 Grad',['45 Grad','120 Grad','180 Grad'],'Ein rechter Winkel misst genau 90 Grad.'],
  ['Welche Sprache gehört zu den romanischen Sprachen','Italienisch',['Finnisch','Ungarisch','Arabisch'],'Italienisch entwickelte sich wie Französisch und Spanisch aus dem Lateinischen.'],
  ['Was ist ein Anagramm','Eine Umstellung der Buchstaben eines Wortes',['Ein Gedicht mit 14 Zeilen','Ein Wort ohne Vokale','Ein Satz ohne Verb'],'Bei einem Anagramm werden die Buchstaben eines Wortes oder Ausdrucks neu angeordnet.'],
  ['Welches Satzzeichen beendet normalerweise eine direkte Frage','Fragezeichen',['Semikolon','Doppelpunkt','Apostroph'],'Eine direkte Frage wird im Deutschen gewöhnlich mit einem Fragezeichen beendet.'],
  ['Wie nennt man die Lehre von der Bedeutung sprachlicher Zeichen','Semantik',['Phonetik','Syntax','Metrik'],'Die Semantik untersucht die Bedeutung sprachlicher Zeichen und Ausdrücke.'],
  ['Wie nennt man die Abfolge von Ereignissen in einer Erzählung','Handlung',['Typografie','Fußnote','Silbentrennung'],'Die Handlung beschreibt die Ereignisfolge einer Erzählung.'],
  ['Welches Instrument misst die Zeit besonders genau mithilfe von Atomübergängen','Atomuhr',['Sonnenuhr','Sanduhr','Stoppuhr'],'Eine Atomuhr nutzt sehr konstante Übergänge in Atomen als Zeitnormal.'],
  ['Welche Einheit entspricht tausend Metern','Kilometer',['Zentimeter','Dezimeter','Hektometer'],'Ein Kilometer entspricht genau tausend Metern.'],
  ['Wie viele Quadrate hat ein Schachbrett','64',['56','72','81'],'Ein Schachbrett besteht aus acht mal acht und damit 64 Feldern.'],
  ['Welcher Kontinent besitzt die größte Landfläche','Asien',['Afrika','Europa','Nordamerika'],'Asien ist flächenmäßig der größte Kontinent der Erde.'],
  ['Welche Farbe entsteht bei additiver Mischung von rotem und grünem Licht','Gelb',['Blau','Magenta','Cyan'],'Rotes und grünes Licht ergeben bei additiver Farbmischung gelbes Licht.'],
];
generalFacts.forEach((item, index) => additions.push(makeQuestion('general-plus','Allgemeinwissen',index,item[0],item[1],item[2],item[3])));

const techFacts = [
  ['Wofür steht HTTP','Hypertext Transfer Protocol',['High Transmission Text Process','Hyperlink Transfer Package','Host Terminal Transport Program'],'HTTP ist das Übertragungsprotokoll für Webinhalte.'],
  ['Welche zusätzliche Schutzschicht verwendet HTTPS','TLS-Verschlüsselung',['ZIP-Komprimierung','GPS-Ortung','Bluetooth-Kopplung'],'HTTPS schützt HTTP-Verbindungen in der Regel mit TLS.'],
  ['Welche Aufgabe hat DNS','Domainnamen in IP-Adressen auflösen',['Dateien komprimieren','Passwörter erzeugen','Bildschirme kalibrieren'],'DNS ordnet lesbaren Domainnamen technische IP-Adressen zu.'],
  ['Was ist RAM','Flüchtiger Arbeitsspeicher',['Dauerhafter Nur-Lese-Speicher','Ein Netzwerkprotokoll','Ein Bildformat'],'RAM hält Daten für laufende Programme kurzfristig bereit.'],
  ['Wofür steht CPU','Central Processing Unit',['Computer Power Utility','Central Protocol User','Core Program Upload'],'Die CPU führt Rechen- und Steuerbefehle eines Computers aus.'],
  ['Welche Aufgabe übernimmt eine GPU hauptsächlich','Grafik- und Parallelberechnungen',['E-Mails versenden','Festplatten verschlüsseln','Netzwerkkabel prüfen'],'Eine GPU ist auf stark parallele Berechnungen und Grafikdarstellung spezialisiert.'],
  ['Wodurch speichert eine SSD Daten','Flash-Speicher',['Magnetband','Lochkarten','Optische Rillen'],'SSDs speichern Daten elektronisch in Flash-Speicherzellen.'],
  ['Wie viele Bits hat IPv4','32',['16','64','128'],'Eine IPv4-Adresse besteht aus 32 Bit.'],
  ['Wie viele Bits hat IPv6','128',['32','64','256'],'Eine IPv6-Adresse besteht aus 128 Bit.'],
  ['Wie viele Bits bilden ein Byte','8',['4','10','16'],'Ein Byte besteht aus acht Bits.'],
  ['Welche Ziffern verwendet das Binärsystem','0 und 1',['0 bis 7','0 bis 9','1 bis 16'],'Das Binärsystem verwendet ausschließlich die Ziffern null und eins.'],
  ['Welche Aufgabe hat ein Router','Datenpakete zwischen Netzwerken weiterleiten',['Texte drucken','Bilder skalieren','Akkus laden'],'Ein Router entscheidet, auf welchem Weg Datenpakete andere Netzwerke erreichen.'],
  ['Welche Aufgabe hat ein Netzwerk-Switch','Geräte innerhalb eines lokalen Netzes verbinden',['Internetseiten gestalten','Antivirenprogramme aktualisieren','Audio aufnehmen'],'Ein Switch verbindet Geräte in einem lokalen Netzwerk und leitet Daten gezielt weiter.'],
  ['Was macht eine Firewall','Netzwerkverkehr nach Regeln filtern',['Dateien automatisch übersetzen','Prozessoren kühlen','Bildschirme reinigen'],'Eine Firewall erlaubt oder blockiert Netzwerkverkehr anhand festgelegter Regeln.'],
  ['Was ist ein Backup','Eine zusätzliche Sicherungskopie von Daten',['Ein schneller Prozessor','Ein Bildschirmschoner','Eine Suchmaschine'],'Ein Backup ist eine getrennte Kopie wichtiger Daten für den Wiederherstellungsfall.'],
  ['Was bezeichnet Phishing','Täuschungsversuche zum Stehlen vertraulicher Daten',['Legale Datenkomprimierung','Automatische Softwaretests','Drahtlose Energieübertragung'],'Beim Phishing werden Personen mit gefälschten Nachrichten oder Seiten zur Preisgabe von Daten verleitet.'],
  ['Was erhöht eine Zwei-Faktor-Authentifizierung','Die Anmeldesicherheit durch zwei unabhängige Nachweise',['Die Bildschirmauflösung','Die Downloadgeschwindigkeit','Die Akkukapazität'],'Zwei-Faktor-Authentifizierung verlangt zwei unterschiedliche Nachweise für eine Anmeldung.'],
  ['Was bedeutet Open Source','Der Quellcode ist einsehbar und unter einer Lizenz nutzbar',['Die Software ist immer kostenlos','Die Software benötigt kein Betriebssystem','Die Daten werden unverschlüsselt übertragen'],'Open-Source-Software stellt ihren Quellcode unter festgelegten Lizenzbedingungen bereit.'],
  ['Was bezeichnet Cloud Computing','Rechenleistung und Speicher über entfernte Systeme nutzen',['Wetterdaten manuell notieren','Computer nur offline verwenden','Dateien ausschließlich auf Papier speichern'],'Cloud Computing stellt Rechenressourcen über Netzwerke bedarfsgerecht bereit.'],
  ['Was ist ein QR-Code','Ein zweidimensionaler maschinenlesbarer Code',['Ein analoges Tonsignal','Ein Passwortmanager','Ein Dateisystem'],'Ein QR-Code speichert Informationen in einem zweidimensionalen Raster.'],
  ['Wofür wird HTML verwendet','Struktur von Webseiten beschreiben',['Datenbanken verschlüsseln','Bilder verlustfrei komprimieren','Betriebssysteme starten'],'HTML beschreibt die semantische Struktur einer Webseite.'],
  ['Wofür wird CSS verwendet','Darstellung und Layout von Webseiten gestalten',['Netzwerkpakete routen','Passwörter hashen','Dateien entpacken'],'CSS steuert Aussehen, Abstände und Layout von Webinhalten.'],
  ['Wofür wird SQL verwendet','Daten in relationalen Datenbanken abfragen und verändern',['Videos schneiden','3D-Modelle drucken','Funkfrequenzen messen'],'SQL ist eine Sprache für relationale Datenbanken.'],
  ['Was ist eine API','Eine definierte Schnittstelle zwischen Softwaresystemen',['Ein spezieller Computerlüfter','Ein analoges Bildformat','Eine Stromsparfunktion'],'Eine API legt fest, wie Programme Daten und Funktionen austauschen.'],
  ['Was bezeichnet Latenz in einem Netzwerk','Zeitverzögerung bei der Datenübertragung',['Speicherkapazität eines Servers','Anzahl der Bildschirmfarben','Größe einer Tastatur'],'Latenz beschreibt die Verzögerung zwischen Senden und Empfangen von Daten.'],
];
techFacts.forEach((item,index)=>additions.push(makeQuestion('tech-plus','Technik',index,item[0],item[1],item[2],item[3])));

const sportFacts = [
  ['Wie viele Spieler hat eine Fußballmannschaft zu Spielbeginn auf dem Feld','11',['9','10','12'],'Eine Fußballmannschaft beginnt regulär mit elf Spielern einschließlich Torwart.'],
  ['Wie viele Spieler stehen beim Volleyball pro Mannschaft gleichzeitig auf dem Feld','6',['5','7','8'],'Beim Hallenvolleyball stehen sechs Spieler je Mannschaft auf dem Feld.'],
  ['Wie viele Spieler stehen beim Basketball pro Mannschaft gleichzeitig auf dem Feld','5',['4','6','7'],'Beim Basketball spielen fünf Spieler je Team gleichzeitig.'],
  ['Wie viele Spieler stehen beim Handball pro Mannschaft gleichzeitig auf dem Feld','7',['5','6','8'],'Eine Handballmannschaft spielt mit sechs Feldspielern und einem Torwart.'],
  ['Wie viele Spieler hat eine Baseballmannschaft in der Defensive auf dem Feld','9',['7','8','10'],'Im Baseball stehen neun Defensivspieler auf dem Feld.'],
  ['Wie viele Spieler hat eine Rugby-Union-Mannschaft auf dem Feld','15',['11','13','17'],'Rugby Union wird mit 15 Spielern pro Mannschaft ausgetragen.'],
  ['Wie lang ist ein Marathon offiziell','42,195 Kilometer',['40 Kilometer','41,5 Kilometer','45 Kilometer'],'Die offizielle Marathondistanz beträgt 42,195 Kilometer.'],
  ['Aus wie vielen Disziplinen besteht ein Zehnkampf','10',['8','9','12'],'Der Zehnkampf kombiniert zehn leichtathletische Disziplinen.'],
  ['Welche zwei Sportarten verbindet Biathlon','Skilanglauf und Schießen',['Radfahren und Schwimmen','Laufen und Fechten','Rudern und Turnen'],'Biathlon verbindet Skilanglauf mit Gewehrschießen.'],
  ['Welche drei Sportarten gehören zum klassischen Triathlon','Schwimmen, Radfahren und Laufen',['Rudern, Fechten und Laufen','Skifahren, Schießen und Laufen','Turnen, Radfahren und Schwimmen'],'Ein Triathlon besteht aus Schwimmen, Radfahren und Laufen.'],
  ['Wie heißt das Spielgerät beim Badminton','Federball',['Puck','Schlagball','Quidditchball'],'Beim Badminton wird ein Federball über das Netz geschlagen.'],
  ['Bis zu wie vielen Punkten wird ein regulärer Tischtennissatz gespielt','11',['15','21','25'],'Ein Tischtennissatz endet grundsätzlich bei elf Punkten und zwei Punkten Vorsprung.'],
  ['Wie viele Ringe zeigt das olympische Symbol','5',['4','6','7'],'Das olympische Symbol besteht aus fünf ineinandergreifenden Ringen.'],
  ['Wie viele Punkte zählt ein erfolgreicher Freiwurf im Basketball','1',['2','3','4'],'Ein erfolgreicher Freiwurf zählt im Basketball einen Punkt.'],
  ['Wie weit ist der Elfmeterpunkt im Fußball von der Torlinie entfernt','11 Meter',['9 Meter','10 Meter','12 Meter'],'Der Strafstoß wird im Fußball aus elf Metern Entfernung ausgeführt.'],
  ['Wie viele Minuten dauert ein reguläres Handballspiel der Erwachsenen','60',['50','70','90'],'Ein Erwachsenen-Handballspiel dauert zweimal 30 Minuten.'],
  ['Wie viele Spieler stehen beim Eishockey pro Team üblicherweise gleichzeitig auf dem Eis','6',['5','7','8'],'Üblicherweise stehen fünf Feldspieler und ein Torhüter je Team auf dem Eis.'],
  ['Wie viele Spieler hat ein Wasserballteam gleichzeitig im Wasser','7',['6','8','9'],'Beim Wasserball spielen sechs Feldspieler und ein Torwart pro Mannschaft.'],
  ['Wie viele Spieler hat eine Feldhockeymannschaft auf dem Feld','11',['9','10','12'],'Feldhockey wird mit elf Spielern pro Team gespielt.'],
  ['Wie viele Löcher hat eine Standardrunde im Golf','18',['9','12','21'],'Eine reguläre Golfrunde umfasst 18 Löcher.'],
  ['Wie viele Felder besitzt ein Schachbrett','64',['56','72','81'],'Ein Schachbrett hat acht mal acht und damit 64 Felder.'],
  ['Wie viele Sätze muss ein Spieler in einem gewöhnlichen Best-of-Five-Tennismatch gewinnen','3',['2','4','5'],'Bei Best of Five gewinnt, wer zuerst drei Sätze für sich entscheidet.'],
  ['Welche Farbe trägt das Trikot des Führenden der Tour de France','Gelb',['Rot','Grün','Blau'],'Der Gesamtführende der Tour de France trägt das Gelbe Trikot.'],
  ['Welche Sportart verwendet einen Puck','Eishockey',['Handball','Baseball','Wasserball'],'Im Eishockey wird mit einem flachen Puck gespielt.'],
  ['Wie viele Punkte ist ein Touchdown im American Football wert','6',['3','5','7'],'Ein Touchdown bringt im American Football sechs Punkte.'],
];
sportFacts.forEach((item,index)=>additions.push(makeQuestion('sport-plus','Sport',index,item[0],item[1],item[2],item[3])));

const musicFacts = [
  ['Wer komponierte die Oper „Die Zauberflöte“','Wolfgang Amadeus Mozart',['Ludwig van Beethoven','Richard Wagner','Giuseppe Verdi'],'Wolfgang Amadeus Mozart komponierte „Die Zauberflöte“.'],
  ['Wer komponierte den Zyklus „Die vier Jahreszeiten“','Antonio Vivaldi',['Johann Sebastian Bach','Georg Friedrich Händel','Joseph Haydn'],'Antonio Vivaldi komponierte „Die vier Jahreszeiten“.'],
  ['Wer komponierte die „Brandenburgischen Konzerte“','Johann Sebastian Bach',['Franz Schubert','Gustav Mahler','Claude Debussy'],'Johann Sebastian Bach komponierte die „Brandenburgischen Konzerte“.'],
  ['Wer komponierte die Oper „Aida“','Giuseppe Verdi',['Giacomo Puccini','Georges Bizet','Gioachino Rossini'],'Giuseppe Verdi komponierte die Oper „Aida“.'],
  ['Wer komponierte die Oper „Carmen“','Georges Bizet',['Giuseppe Verdi','Richard Strauss','Jacques Offenbach'],'Georges Bizet komponierte die Oper „Carmen“.'],
  ['Welches Instrument spielte Frédéric Chopin vor allem','Klavier',['Violine','Cello','Flöte'],'Frédéric Chopin war Pianist und schrieb den größten Teil seiner Werke für Klavier.'],
  ['Welches Instrument spielt Yo-Yo Ma','Cello',['Violine','Klavier','Kontrabass'],'Yo-Yo Ma ist ein international bekannter Cellist.'],
  ['Zu welcher Instrumentenfamilie gehört die Trompete','Blechblasinstrumente',['Holzblasinstrumente','Streichinstrumente','Tasteninstrumente'],'Die Trompete gehört zu den Blechblasinstrumenten.'],
  ['Zu welcher Instrumentenfamilie gehört die Klarinette','Holzblasinstrumente',['Blechblasinstrumente','Streichinstrumente','Schlaginstrumente'],'Die Klarinette gehört trotz ihres heutigen Materials zu den Holzblasinstrumenten.'],
  ['Wie viele Saiten hat eine Violine','4',['5','6','8'],'Eine Violine besitzt vier Saiten.'],
  ['Wie viele Saiten hat eine klassische Gitarre normalerweise','6',['4','5','8'],'Eine klassische Gitarre hat normalerweise sechs Saiten.'],
  ['Wie nennt man den Abstand zwischen zwei Tonhöhen','Intervall',['Takt','Kadenz','Motiv'],'Der Abstand zwischen zwei Tonhöhen heißt Intervall.'],
  ['Was bedeutet „Allegro“ als Tempoangabe','Schnell und lebhaft',['Sehr langsam','Feierlich getragen','Völlig frei'],'Allegro bezeichnet ein schnelles und lebhaftes Tempo.'],
  ['Was bedeutet „Crescendo“','Allmählich lauter werden',['Plötzlich stoppen','Allmählich langsamer werden','Eine Oktave tiefer spielen'],'Crescendo fordert eine schrittweise Zunahme der Lautstärke.'],
  ['Was bedeutet die Dynamikangabe „forte“','Laut',['Leise','Sehr langsam','Gebunden'],'Forte bedeutet in der Musik laut oder kräftig.'],
  ['Was bedeutet die Dynamikangabe „piano“','Leise',['Laut','Schnell','Getrennt'],'Piano bedeutet in der Musik leise.'],
  ['Welche Aufgabe hat ein Dirigent','Ein Ensemble musikalisch leiten',['Instrumente reparieren','Noten drucken','Konzertsäle beleuchten'],'Ein Dirigent koordiniert Tempo, Einsätze und Ausdruck eines Ensembles.'],
  ['Welche Stimmlage liegt zwischen Tenor und Bass','Bariton',['Sopran','Alt','Mezzosopran'],'Der Bariton liegt bei Männerstimmen zwischen Tenor und Bass.'],
  ['Wer entwickelte das Saxofon','Adolphe Sax',['Antonio Stradivari','Robert Moog','Carl Orff'],'Adolphe Sax entwickelte das Saxofon im 19. Jahrhundert.'],
  ['Wie werden die Saiten eines Cembalos zum Klingen gebracht','Sie werden angerissen',['Sie werden mit Hämmern angeschlagen','Sie werden angeblasen','Sie werden gestrichen'],'Beim Cembalo werden die Saiten durch Kiele angerissen.'],
  ['Zu welcher Instrumentengruppe gehören Pauken','Schlaginstrumente',['Streichinstrumente','Holzblasinstrumente','Tasteninstrumente'],'Pauken sind gestimmte Schlaginstrumente.'],
  ['Wie viele Sinfonien vollendete Ludwig van Beethoven','9',['7','10','12'],'Ludwig van Beethoven vollendete neun Sinfonien.'],
  ['Welcher Komponist schrieb den Opernzyklus „Der Ring des Nibelungen“','Richard Wagner',['Richard Strauss','Johannes Brahms','Felix Mendelssohn Bartholdy'],'Richard Wagner schrieb den vierteiligen Opernzyklus „Der Ring des Nibelungen“.'],
  ['Wie heißt die tiefste übliche männliche Stimmlage','Bass',['Tenor','Bariton','Alt'],'Der Bass ist die tiefste übliche männliche Stimmlage.'],
  ['Welche Musikrichtung entstand in den 1970er-Jahren in der Bronx','Hip-Hop',['Reggae','Techno','Grunge'],'Hip-Hop entwickelte sich in den 1970er-Jahren in der New Yorker Bronx.'],
];
musicFacts.forEach((item,index)=>additions.push(makeQuestion('music-plus','Musik',index,item[0],item[1],item[2],item[3])));

const filmFacts = [
  ['Wer führte Regie bei „Titanic“','James Cameron',['Steven Spielberg','Ridley Scott','Ron Howard'],'James Cameron führte Regie bei „Titanic“.'],
  ['Wer führte Regie bei „Der weiße Hai“','Steven Spielberg',['George Lucas','Martin Scorsese','Francis Ford Coppola'],'Steven Spielberg führte Regie bei „Der weiße Hai“.'],
  ['Wer führte Regie bei „Der Pate“','Francis Ford Coppola',['Brian De Palma','Sergio Leone','Stanley Kubrick'],'Francis Ford Coppola führte Regie bei „Der Pate“.'],
  ['Wer führte Regie bei der Filmtrilogie „Der Herr der Ringe“','Peter Jackson',['James Cameron','Sam Raimi','Tim Burton'],'Peter Jackson führte Regie bei der Filmtrilogie „Der Herr der Ringe“.'],
  ['Wer schuf die Weltraumsaga „Star Wars“','George Lucas',['Gene Roddenberry','Steven Spielberg','Ridley Scott'],'George Lucas schuf die „Star Wars“-Filmsaga.'],
  ['Wer führte Regie bei „E.T. – Der Außerirdische“','Steven Spielberg',['Robert Zemeckis','George Miller','John Carpenter'],'Steven Spielberg führte Regie bei „E.T. – Der Außerirdische“.'],
  ['Wer führte Regie bei „Inception“','Christopher Nolan',['David Fincher','Denis Villeneuve','Peter Jackson'],'Christopher Nolan führte Regie bei „Inception“.'],
  ['Wer führte Regie bei „Chihiros Reise ins Zauberland“','Hayao Miyazaki',['Akira Kurosawa','Mamoru Hosoda','Satoshi Kon'],'Hayao Miyazaki führte Regie bei „Chihiros Reise ins Zauberland“.'],
  ['Wer führte Regie bei dem Stummfilm „Metropolis“','Fritz Lang',['F. W. Murnau','Billy Wilder','Ernst Lubitsch'],'Fritz Lang führte Regie bei „Metropolis“.'],
  ['Wer führte Regie bei „Psycho“','Alfred Hitchcock',['Orson Welles','Stanley Kubrick','David Lean'],'Alfred Hitchcock führte Regie bei „Psycho“.'],
  ['Wer führte Regie bei „Pulp Fiction“','Quentin Tarantino',['Martin Scorsese','Oliver Stone','Spike Lee'],'Quentin Tarantino führte Regie bei „Pulp Fiction“.'],
  ['Wer führte Regie bei „Casablanca“','Michael Curtiz',['John Ford','Frank Capra','Howard Hawks'],'Michael Curtiz führte Regie bei „Casablanca“.'],
  ['Wer führte Regie bei „Schindlers Liste“','Steven Spielberg',['Roman Polański','Francis Ford Coppola','Miloš Forman'],'Steven Spielberg führte Regie bei „Schindlers Liste“.'],
  ['Wer führte Regie bei „Alien“','Ridley Scott',['James Cameron','John Carpenter','David Cronenberg'],'Ridley Scott führte Regie bei „Alien“.'],
  ['Welche Figur sagt im Film „Der Terminator“ den Satz „Ich komme wieder“','Der Terminator',['RoboCop','Rocky Balboa','John Rambo'],'Der Terminator verwendet den bekannten Satz in der Filmreihe.'],
  ['Wie heißt Batmans Heimatstadt','Gotham City',['Metropolis','Central City','Star City'],'Batmans Heimatstadt heißt Gotham City.'],
  ['Welche Schauspielerin spielte Hermine Granger in den Harry-Potter-Filmen','Emma Watson',['Emma Stone','Keira Knightley','Natalie Portman'],'Emma Watson spielte Hermine Granger in den Harry-Potter-Filmen.'],
  ['Welche Filmfigur trägt einen Hut und eine Peitsche','Indiana Jones',['Rocky Balboa','Ethan Hunt','Neo'],'Indiana Jones ist für seinen Hut und seine Peitsche bekannt.'],
  ['In welcher Filmreihe kommt der Planet Tatooine vor','Star Wars',['Star Trek','Dune','Avatar'],'Tatooine ist ein Planet aus dem „Star Wars“-Universum.'],
  ['Wie heißt der grüne Oger aus der gleichnamigen Animationsfilmreihe','Shrek',['Sully','Po','Hicks'],'Shrek ist die Titelfigur der gleichnamigen Animationsfilmreihe.'],
];
filmFacts.forEach((item,index)=>additions.push(makeQuestion('film-plus','Film & Fernsehen',index,item[0],item[1],item[2],item[3])));

const foodFacts = [
  ['Woraus wird Tofu traditionell hergestellt','Sojabohnen',['Reis','Weizen','Kichererbsen'],'Tofu wird traditionell aus geronnener Sojamilch hergestellt.'],
  ['Welche Hülsenfrucht bildet häufig die Grundlage von Hummus','Kichererbsen',['Linsen','Erbsen','Sojabohnen'],'Hummus wird traditionell vor allem aus Kichererbsen und Tahin zubereitet.'],
  ['Welche Frucht ist die Hauptzutat von Guacamole','Avocado',['Mango','Limette','Tomate'],'Guacamole basiert hauptsächlich auf zerdrückter Avocado.'],
  ['Welche Getreideart wird für klassisches Risotto verwendet','Reis',['Gerste','Hafer','Hirse'],'Risotto wird mit stärkereichem Rundkornreis zubereitet.'],
  ['Welches Kraut prägt klassisches Pesto Genovese','Basilikum',['Petersilie','Koriander','Dill'],'Pesto Genovese wird traditionell mit frischem Basilikum zubereitet.'],
  ['Aus welchem Gemüse wird Sauerkraut hergestellt','Weißkohl',['Gurke','Rote Bete','Sellerie'],'Sauerkraut entsteht durch Milchsäuregärung von fein geschnittenem Weißkohl.'],
  ['Welche Mikroorganismen sind für die Herstellung von Joghurt wichtig','Milchsäurebakterien',['Hefepilze','Algen','Schimmelsporen'],'Milchsäurebakterien wandeln Milchzucker in Milchsäure um und lassen Joghurt entstehen.'],
  ['Was ist Espresso','Konzentrierter Kaffee aus hohem Druck',['Kalter Kaffee mit Eis','Kaffee ohne Koffein','Kaffee mit Kakao'],'Espresso entsteht, wenn heißes Wasser unter hohem Druck durch fein gemahlenes Kaffeepulver gepresst wird.'],
  ['Woraus besteht eine klassische Mehlschwitze','Mehl und Fett',['Milch und Zucker','Ei und Wasser','Reis und Brühe'],'Eine Mehlschwitze oder Roux besteht aus erhitztem Fett und Mehl.'],
  ['Welche Zutat emulgiert klassische Mayonnaise','Eigelb',['Mehl','Hefe','Gelatine'],'Eigelb enthält Lecithin und stabilisiert die Verbindung von Öl und Wasserbestandteilen.'],
  ['Woraus besteht Couscous traditionell','Hartweizengrieß',['Reismehl','Kartoffelstärke','Haferflocken'],'Couscous besteht traditionell aus kleinen Körnchen aus Hartweizengrieß.'],
  ['Welche Zutat ist für Sushi besonders grundlegend','Mit Essig gewürzter Reis',['Rohes Fleisch','Blätterteig','Hartkäse'],'Sushi bezeichnet vor allem mit Essig gewürzten Reis mit unterschiedlichen Beilagen.'],
  ['Woraus wird Polenta hergestellt','Maisgrieß',['Weizenkleie','Reismehl','Buchweizen'],'Polenta wird aus gekochtem Maisgrieß hergestellt.'],
  ['Woraus bestehen Falafel häufig','Kichererbsen oder Ackerbohnen',['Kartoffeln','Reis','Mais'],'Falafel werden traditionell aus eingeweichten Kichererbsen oder Ackerbohnen zubereitet.'],
  ['Was ist Tempeh','Fermentiertes Sojaprodukt',['Geräucherter Fisch','Getrockneter Käse','Süßes Reisgebäck'],'Tempeh entsteht durch Fermentation gekochter Sojabohnen.'],
  ['Was ist Miso','Fermentierte Würzpaste',['Frischer Weichkäse','Geröstetes Brot','Kalter Fruchtsaft'],'Miso ist eine japanische Würzpaste aus fermentierten Sojabohnen und häufig Getreide.'],
  ['Was ist Kimchi','Fermentiertes Gemüse',['Gebratener Reis','Süßer Pfannkuchen','Klare Nudelsuppe'],'Kimchi ist koreanisches, gewürztes und fermentiertes Gemüse.'],
  ['Woraus bestehen viele klassische Gnocchi','Kartoffeln und Mehl',['Reis und Ei','Mais und Milch','Bohnen und Öl'],'Viele klassische Gnocchi werden aus gekochten Kartoffeln und Mehl hergestellt.'],
  ['Welche Zutaten prägen Tzatziki','Joghurt und Gurke',['Tomate und Paprika','Reis und Safran','Kartoffel und Lauch'],'Tzatziki wird vor allem aus Joghurt, Gurke und Knoblauch zubereitet.'],
  ['Welche Grundzutat prägt eine Paella','Reis',['Kartoffeln','Nudeln','Brot'],'Paella ist ein spanisches Reisgericht mit regional unterschiedlichen Zutaten.'],
  ['Was bedeutet „al dente“ bei Nudeln','Bissfest',['Sehr weich','Ungekocht','Kalt serviert'],'Al dente bedeutet, dass Nudeln noch einen leichten Biss haben.'],
  ['Welche Zutat lässt Hefeteig aufgehen','Hefe',['Öl','Salz','Kakao'],'Hefe bildet bei der Gärung Kohlendioxid und lockert dadurch den Teig.'],
  ['Welche Frucht gilt botanisch als Beere','Banane',['Erdbeere','Himbeere','Kirsche'],'Botanisch ist die Banane eine Beere, während Erdbeeren Sammelnussfrüchte sind.'],
  ['Bei welcher Temperatur siedet Wasser auf Meereshöhe ungefähr','100 °C',['80 °C','90 °C','120 °C'],'Bei normalem Luftdruck siedet Wasser auf Meereshöhe ungefähr bei 100 Grad Celsius.'],
  ['Welche Zutat gibt klassischem Marzipan seinen charakteristischen Geschmack','Mandeln',['Haselnüsse','Walnüsse','Kokosnuss'],'Marzipan besteht hauptsächlich aus gemahlenen Mandeln und Zucker.'],
];
foodFacts.forEach((item,index)=>additions.push(makeQuestion('food-plus','Essen & Trinken',index,item[0],item[1],item[2],item[3])));

const merged = [];
const ids = new Set();
const texts = new Set();
for (const source of [...baseQuestions, ...additions]) {
  const question = { ...source, options: [...source.options] };
  const id = String(question.id || '').trim().toLowerCase();
  const text = normalizedText(question.text);
  if (!id || ids.has(id) || !text || texts.has(text)) continue;
  if (!Array.isArray(question.options) || question.options.length !== 4 || new Set(question.options.map(value => String(value).trim())).size !== 4) continue;
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) continue;
  question.explanation = normalizedExplanation(question);
  ids.add(id);
  texts.add(text);
  merged.push(question);
  if (merged.length === 500) break;
}

if (merged.length !== 500) {
  throw new Error(`Der Erwachsenenfragenkatalog ist unvollständig: ${merged.length} statt 500 Fragen.`);
}

Object.defineProperty(merged, 'meta', {
  enumerable: false,
  value: Object.freeze({
    baseCount: baseQuestions.length,
    totalCount: merged.length,
    categories: Object.freeze([...new Set(baseQuestions.map(question => question.category))]),
  }),
});

module.exports = merged;
