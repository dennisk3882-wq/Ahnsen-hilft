'use strict';

const { buildCatalog } = require('./question-expansion-generator');

const PLURALS = [["Buch","Bücher"],["Haus","Häuser"],["Baum","Bäume"],["Hand","Hände"],["Fuß","Füße"],["Maus","Mäuse"],["Gans","Gänse"],["Zahn","Zähne"],["Apfel","Äpfel"],["Vogel","Vögel"],["Stuhl","Stühle"],["Schuh","Schuhe"],["Kind","Kinder"],["Mann","Männer"],["Frau","Frauen"],["Ei","Eier"],["Bild","Bilder"],["Kleid","Kleider"],["Rad","Räder"],["Glas","Gläser"],["Blatt","Blätter"],["Stadt","Städte"],["Land","Länder"],["Dorf","Dörfer"],["Dach","Dächer"],["Schloss","Schlösser"],["Zug","Züge"],["Bus","Busse"],["Kaktus","Kakteen"],["Museum","Museen"],["Atlas","Atlanten"],["Lexikon","Lexika"],["Datum","Daten"],["Thema","Themen"],["Firma","Firmen"],["Heft","Hefte"],["Tisch","Tische"],["Lampe","Lampen"],["Woche","Wochen"],["Fluss","Flüsse"]];
const NATURE = [["Seeotter","knackt Muscheln häufig mit Steinen"],["Axolotl","kann verlorene Gliedmaßen nachbilden"],["Erdmännchen","stellt Wächter auf, während die Gruppe sucht"],["Schnabeltier","legt Eier und säugt trotzdem seine Jungen"],["Faultier","bewegt sich meist sehr langsam durch Baumkronen"],["Kolibri","kann auf der Stelle in der Luft stehen"],["Rabe","kann komplexe Probleme lösen"],["Kranich","zieht saisonal über große Entfernungen"],["Lemur","lebt ursprünglich auf Madagaskar"],["Nacktmull","lebt in unterirdischen Kolonien"],["Wombat","produziert würfelförmigen Kot"],["Albatros","kann mit sehr langen Flügeln weit über das Meer gleiten"],["Pfeilgiftfrosch","trägt bei manchen Arten seine Kaulquappen auf dem Rücken"],["Mantarochen","filtert kleine Nahrung aus dem Wasser"],["Okapi","ist mit der Giraffe verwandt"],["Narwal","trägt meist einen langen spiraligen Stoßzahn"],["Kaiserpinguin","brütet sein Ei auf den Füßen unter einer Hautfalte"],["Orang-Utan","baut sich zum Schlafen Nester in Bäumen"],["Panda","frisst überwiegend Bambus"],["Waschbär","hat sehr empfindliche Vorderpfoten"],["Eisvogel","stößt zum Fangen kleiner Fische ins Wasser"],["Stachelschwein","verteidigt sich mit langen Stacheln"],["Ameisenlöwe","fängt Beute als Larve oft in Sandtrichtern"],["Tukan","besitzt einen besonders großen, leichten Schnabel"],["Nashorn","besteht sein Horn hauptsächlich aus Keratin"],["Gepard","ist das schnellste Landtier auf kurzen Strecken"],["Seestern","kann bei vielen Arten verlorene Arme nachbilden"],["Krake","kann Farbe und Hautstruktur verändern"],["Termite","baut bei manchen Arten hohe, belüftete Hügel"],["Bienenfresser","fängt fliegende Insekten häufig im Flug"]];
const SCIENCE = [["Waage","misst die Masse eines Gegenstands"],["Messbecher","zeigt das Volumen einer Flüssigkeit"],["Stoppuhr","misst kurze Zeitspannen"],["Lineal","misst kurze Längen und hilft beim geraden Zeichnen"],["Thermoskanne","verringert den Wärmeaustausch mit der Umgebung"],["Dynamo","wandelt Bewegung in elektrische Energie um"],["Windrad","nutzt bewegte Luft zur Energiegewinnung"],["Turbine","wird von strömender Flüssigkeit oder Gas gedreht"],["Sicherung","unterbricht einen Stromkreis bei zu hoher Stromstärke"],["LED","erzeugt Licht mit geringem Energieverbrauch"],["Lautsprecher","wandelt elektrische Signale in Schall um"],["Mikrofon","wandelt Schall in elektrische Signale um"],["Kameraobjektiv","bündelt Licht auf dem Bildsensor"],["Prisma","kann weißes Licht in Spektralfarben zerlegen"],["Pendel","schwingt unter dem Einfluss der Schwerkraft hin und her"],["Flaschenzug","erleichtert das Heben schwerer Lasten"],["Rampe","verringert die nötige Kraft beim Anheben über eine längere Strecke"],["Feder","speichert bei Verformung elastische Energie"],["Pumpe","bewegt Flüssigkeiten oder Gase"],["Ventil","steuert den Durchfluss in einer Leitung"],["Filter","hält bestimmte Teilchen aus einem Stoffstrom zurück"],["Satellit","umkreist einen größeren Himmelskörper"],["Wetterstation","erfasst mehrere Messwerte des Wetters"],["Regenmesser","misst die gefallene Niederschlagsmenge"],["Anemometer","misst die Windgeschwindigkeit"],["Hygrometer","misst die Luftfeuchtigkeit"],["Seismograf","zeichnet Erschütterungen des Bodens auf"],["Geigerzähler","weist ionisierende Strahlung nach"],["Sonnenuhr","zeigt die Zeit mithilfe des Sonnenstands"],["Periskop","ermöglicht den Blick über oder um ein Hindernis"]];
const GEO = [["Eiffelturm","Frankreich"],["Kolosseum","Italien"],["Akropolis","Griechenland"],["Brandenburger Tor","Deutschland"],["Big Ben","Vereinigtes Königreich"],["Sagrada Família","Spanien"],["Atomium","Belgien"],["Windmühlen von Kinderdijk","Niederlande"],["Schloss Schönbrunn","Österreich"],["Kleine Meerjungfrau","Dänemark"],["Freiheitsstatue","USA"],["Christusstatue von Rio","Brasilien"],["Opernhaus von Sydney","Australien"],["Berg Fuji","Japan"],["Taj Mahal","Indien"],["Pyramiden von Gizeh","Ägypten"],["Chinesische Mauer","China"],["Machu Picchu","Peru"],["CN Tower","Kanada"],["Moai-Statuen der Osterinsel","Chile"]];
const EVERYDAY = [["ein Topf beginnt stark zu rauchen","die Herdplatte ausschalten und einen Erwachsenen rufen"],["eine Person ist bewusstlos und atmet normal","den Notruf veranlassen und die stabile Seitenlage anwenden"],["ein Fahrradreifen ist deutlich zu weich","vor der Fahrt Luft nachfüllen und den Reifen prüfen"],["ein Glas zerbricht auf dem Boden","Abstand halten und die Scherben mit Hilfsmitteln aufnehmen lassen"],["ein unbekannter Hund kommt ohne Leine näher","ruhig stehen bleiben und nicht wegrennen"],["ein Gewitter zieht auf","ein Gebäude oder geschlossenes Fahrzeug aufsuchen"],["die Sonne scheint sehr stark","Schatten, Kleidung und Sonnencreme nutzen"],["ein Rauchmelder piept dauerhaft laut","das Gebäude verlassen und Hilfe holen"],["eine Steckdose ist beschädigt","sie nicht berühren und einen Erwachsenen informieren"],["ein Ball rollt auf die Fahrbahn","stehen bleiben und nicht hinterherlaufen"],["der Schulweg führt über eine Ampel","bei Grün gehen und trotzdem nach links und rechts schauen"],["ein Helm hat nach einem Sturz einen Riss","ihn ersetzen und nicht weiterverwenden"],["eine Wunde blutet leicht","sie reinigen, abdecken und bei Bedarf Hilfe holen"],["ein Getränk riecht ungewöhnlich","es nicht trinken und nachfragen"],["eine Tür ist im Brandfall heiß","sie geschlossen lassen und einen anderen Fluchtweg suchen"],["ein Freund verschluckt sich und kann noch husten","ihn weiter husten lassen und aufmerksam beobachten"],["ein Gerät fällt ins Wasser","nicht hineingreifen und zuerst die Stromquelle sicher trennen lassen"],["ein fremder Link verspricht einen Gewinn","nicht anklicken und eine vertraute Person fragen"],["ein Passwort soll weitergegeben werden","es geheim halten und niemandem schicken"],["ein Fahrradweg endet an einer Kreuzung","Tempo verringern und besonders aufmerksam auf den Verkehr achten"]];
const FOOD = [["Paprika","liefert besonders viel Vitamin C"],["Naturjoghurt","liefert Calcium und Eiweiß"],["Haferflocken","enthalten viele Ballaststoffe"],["Linse","liefert pflanzliches Eiweiß"],["Karotte","enthält Beta-Carotin"],["Walnuss","liefert ungesättigte Fettsäuren"],["Kartoffel","liefert Stärke und Kalium"],["Brokkoli","liefert Vitamin K und Folat"],["Banane","liefert unter anderem Kalium"],["Vollkornbrot","liefert komplexe Kohlenhydrate und Ballaststoffe"]];
const GENERAL = [["Oktagon","hat acht Seiten"],["Pentagon","hat fünf Seiten"],["Kilometer","entspricht 1.000 Metern"],["Liter","entspricht 1.000 Millilitern"],["Halbjahr","umfasst sechs Monate"],["Quartal","umfasst drei Monate"],["Doppelstunde","dauert in der Schule häufig 90 Minuten"],["Schaltsekunde","kann die Weltzeit gelegentlich um eine Sekunde ergänzen"],["Alphabet","ordnet die Buchstaben einer Sprache"],["Landkarte","stellt ein Gebiet verkleinert dar"]];
const HISTORY = [["Marie Curie","forschte zur Radioaktivität"],["Alexander Graham Bell","arbeitete an der Entwicklung des Telefons"],["James Watt","verbesserte die Dampfmaschine entscheidend"],["Ada Lovelace","beschrieb einen frühen Algorithmus für eine Rechenmaschine"],["Neil Armstrong","betrat 1969 als erster Mensch den Mond"]];

module.exports = buildCatalog({
  prefix: 'child-b2-',
  build({ add, pairs }) {
    for (let i = 0; i < 40; i += 1) {
      const a = 121 + i * 7;
      const b = 34 + (i * 11) % 83;
      const result = a + b;
      add('Mathematik', `Welche Zahl vervollständigt die Rechnung ${a} + ${b} = ?`, result,
        [result + 1, result - 1, result + 10, result - 10],
        `${a} plus ${b} ergibt ${result}. Beim Addieren werden beide Mengen zusammengeführt.`);
    }
    for (let i = 0; i < 40; i += 1) {
      const a = 420 + i * 9;
      const b = 37 + (i * 13) % 121;
      const result = a - b;
      add('Mathematik', `Welche Zahl vervollständigt die Rechnung ${a} − ${b} = ?`, result,
        [result + 1, result - 1, result + 10, result - 10],
        `${a} minus ${b} ergibt ${result}. Bei der Subtraktion wird die zweite Zahl von der ersten abgezogen.`);
    }
    for (let i = 0; i < 40; i += 1) {
      const a = 13 + (i % 10);
      const b = 6 + Math.floor(i / 10) * 5 + (i % 4);
      const result = a * b;
      add('Mathematik', `Welches Ergebnis gehört in das Feld: ${a} · ${b} = ?`, result,
        [result + a, result - a, result + b, result - b, result + 1],
        `${a} mal ${b} ergibt ${result}. Die Multiplikation kann als wiederholte Addition gleich großer Gruppen verstanden werden.`);
    }
    for (let i = 0; i < 40; i += 1) {
      const divisor = 3 + (i % 8);
      const quotient = 16 + Math.floor(i / 8) * 7 + (i % 5);
      const dividend = divisor * quotient;
      add('Mathematik', `Welcher Quotient gehört in das Feld: ${dividend} : ${divisor} = ?`, quotient,
        [quotient + 1, quotient - 1, quotient + divisor, quotient - divisor, quotient + 2],
        `${dividend} geteilt durch ${divisor} ergibt ${quotient}. Die Division verteilt den Dividend in gleich große Gruppen.`);
    }

    pairs('Sprache', PLURALS, {
      forward: singular => `Welche Mehrzahl gehört zum Nomen „${singular}“?`,
      reverse: (singular, plural) => `Welche Einzahl gehört zur Mehrzahl „${plural}“?`,
      explain: (singular, plural) => `Die Mehrzahl von „${singular}“ lautet „${plural}“. Einzahl und Mehrzahl bezeichnen ein beziehungsweise mehrere Exemplare.`,
    });
    pairs('Natur & Tiere', NATURE, {
      forward: animal => `Welche Besonderheit gehört zum Tier „${animal}“?`,
      reverse: (animal, feature) => `Welches Tier passt zu der Besonderheit „${feature}“?`,
      explain: (animal, feature) => `Beim ${animal} gilt: Es ${feature}. Diese Eigenschaft ermöglicht die eindeutige Zuordnung.`,
    });
    pairs('Technik & Wissenschaft', SCIENCE, {
      forward: device => `Wozu dient ein Gerät oder Bauteil namens „${device}“?`,
      reverse: (device, purpose) => `Welches Gerät oder Bauteil passt zur Aufgabe „${purpose}“?`,
      explain: (device, purpose) => `Ein ${device} ${purpose}. Damit ist seine technische oder wissenschaftliche Aufgabe beschrieben.`,
    });
    pairs('Geografie', GEO, {
      forward: landmark => `In welchem Land befindet sich die Sehenswürdigkeit „${landmark}“?`,
      reverse: (landmark, country) => `Welche Sehenswürdigkeit aus dieser Auswahl gehört zu ${country}?`,
      explain: (landmark, country) => `${landmark} befindet sich in ${country}. Die Sehenswürdigkeit ist geografisch diesem Land zugeordnet.`,
    });
    pairs('Alltag & Verkehr', EVERYDAY, {
      forward: situation => `Was ist in dieser Situation sinnvoll: ${situation}?`,
      reverse: (situation, action) => `Zu welcher Situation passt die Maßnahme „${action}“?`,
      explain: (situation, action) => `Wenn ${situation}, ist es sinnvoll, ${action}. Die Maßnahme verringert ein vermeidbares Risiko.`,
    });
    pairs('Essen & Gesundheit', FOOD, {
      forward: food => `Welche Nährstoffaussage passt besonders gut zu „${food}“?`,
      reverse: (food, fact) => `Welches Lebensmittel passt zur Aussage „${fact}“?`,
      explain: (food, fact) => `${food} ${fact}. Eine abwechslungsreiche Ernährung nutzt unterschiedliche Lebensmittel als Nährstoffquellen.`,
    });
    pairs('Allgemeinwissen', GENERAL, {
      forward: term => `Welche Aussage gehört zum Begriff „${term}“?`,
      reverse: (term, fact) => `Welcher Begriff passt zur Aussage „${fact}“?`,
      explain: (term, fact) => `${term} ${fact}. Diese Grunddefinition macht die Zuordnung eindeutig.`,
    });
    pairs('Geschichte', HISTORY, {
      forward: person => `Wofür ist die historische Person „${person}“ bekannt?`,
      reverse: (person, achievement) => `Welche historische Person passt zur Leistung „${achievement}“?`,
      explain: (person, achievement) => `${person} ${achievement}. Diese Leistung gehört zu ihrer historischen Bedeutung.`,
    });

    add('Musik', 'Welches Instrument besitzt in der Regel schwarze und weiße Tasten?', 'Klavier',
      ['Violine', 'Trompete', 'Triangel'], 'Ein Klavier wird über schwarze und weiße Tasten gespielt. Die Tasten lösen über die Mechanik Töne auf Saiten aus.');
    add('Musik', 'Welche Instrumentengruppe erzeugt Töne durch schwingende Saiten?', 'Saiteninstrumente',
      ['Blechblasinstrumente', 'Schlaginstrumente', 'Holzblasinstrumente'], 'Bei Saiteninstrumenten schwingen gespannte Saiten. Zu dieser Gruppe gehören etwa Gitarre, Harfe und Violine.');
    add('Musik', 'Wie nennt man eine Folge einzelner Töne, die als zusammenhängende Linie wahrgenommen wird?', 'Melodie',
      ['Taktstrich', 'Pause', 'Lautstärke'], 'Eine Melodie ist eine geordnete Folge von Tönen. Sie bildet häufig den wiedererkennbaren musikalischen Verlauf.');
    add('Musik', 'Welches Zeichen erhöht einen notierten Ton normalerweise um einen Halbton?', 'Kreuzzeichen',
      ['Pausenzeichen', 'Wiederholungszeichen', 'Taktstrich'], 'Ein Kreuzzeichen erhöht einen notierten Ton normalerweise um einen Halbton. Es steht als Vorzeichen vor der betreffenden Note oder am Anfang der Notenzeile.');

    add('Sport', 'Wie viele Spieler stehen beim Hallenvolleyball pro Mannschaft gleichzeitig auf dem Feld?', '6',
      ['5', '7', '8'], 'Beim Hallenvolleyball stehen sechs Spieler pro Mannschaft gleichzeitig auf dem Feld. Auswechslungen ändern diese Zahl während eines laufenden Spielzugs nicht.');
    add('Sport', 'Wie lang ist ein Marathon offiziell ungefähr?', '42,195 Kilometer',
      ['40 Kilometer', '45 Kilometer', '50 Kilometer'], 'Die offizielle Marathondistanz beträgt 42,195 Kilometer. Diese Länge ist international für Straßenmarathons festgelegt.');
    add('Sport', 'Welches Gerät wird beim Badminton über ein Netz geschlagen?', 'Federball',
      ['Handball', 'Puck', 'Wasserball'], 'Beim Badminton wird ein Federball mit Schlägern über das Netz gespielt. Seine Federn oder der Kunststoffkorb sorgen für besondere Flugeigenschaften.');
    add('Sport', 'Wie nennt man beim Schwimmen das Wenden an der Beckenwand?', 'Wende',
      ['Anstoß', 'Abwurf', 'Aufschlag'], 'Das Richtungswechseln an der Beckenwand heißt Wende. Eine gute Wende spart im Wettkampf Zeit und erhält die Geschwindigkeit.');

    add('Film & Fernsehen', 'Welche Aufgabe hat eine Filmklappe bei Dreharbeiten hauptsächlich?', 'Bild und Ton einer Aufnahme zuordnen',
      ['die Kamera scharf stellen', 'das Licht dimmen', 'den Film schneiden'], 'Die Filmklappe liefert ein sichtbares und hörbares Synchronisationssignal. Dadurch lassen sich Bild und Ton einer Aufnahme später korrekt zuordnen.');
    add('Film & Fernsehen', 'Wie nennt man die Person, die bei einem Film die Kameraarbeit künstlerisch leitet?', 'Kameramann oder Kamerafrau',
      ['Maskenbildner oder Maskenbildnerin', 'Komponist oder Komponistin', 'Stuntkoordinator oder Stuntkoordinatorin'], 'Die bildgestalterische Leitung der Kamera übernimmt die Kamerafrau oder der Kameramann. Diese Person plant unter anderem Perspektive, Lichtwirkung und Kamerabewegung.');
  },
});
