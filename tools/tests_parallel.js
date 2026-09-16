#!/usr/bin/env node
/* Alle Testsuiten nebenläufig starten statt nacheinander.
 *
 * Warum überhaupt: nacheinander dauert der volle Durchlauf rund acht Minuten,
 * und Lutz wartet in dieser Zeit, ohne zu sehen, was läuft.
 *
 * Warum NICHT alle sieben auf einmal: mehrere Suiten MESSEN Zeit - test_motion
 * die Animationsdauern (Zug 230 ms, Spulen 400 + 650 ms), test_browser und
 * test_layout den Gleichtakt von Ampel und Band (0,96 s). Läuft die Maschine
 * am Anschlag, werden diese Messungen langsamer und die Prüfungen wackeln.
 * Eine parallele Testinfrastruktur, die die Messungen verfälscht, ist
 * schlimmer als eine langsame. Deshalb GRENZE, und die zeitkritischen Suiten
 * laufen zuerst los, solange die Maschine noch frei ist.
 *
 * Die Ausgabe wird je Suite GESAMMELT und am Stück gedruckt - verschränkt
 * wäre sie unlesbar, und gerade die Diagnosen in der Ausgabe sind der Zweck.
 */
const {spawn} = require('child_process');
const path = require('path');

/* Reihenfolge = Startreihenfolge. Zuerst die langen und die zeitkritischen,
   damit sie nicht am Ende allein übrig bleiben bzw. früh dran sind. */
const SUITEN = ['browser', 'layout', 'motion', 'lessons', 'full', 'table', 'worker'];
const GRENZE = Number(process.env.TEST_PARALLEL || 3);

const wurzel = path.resolve(__dirname, '..');
const ergebnisse = [];
const start = Date.now();
let naechste = 0, laufend = 0;

function starte(name) {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join('tests', 'test_' + name + '.js')],
                  {cwd: wurzel});
  let aus = '';
  p.stdout.on('data', d => aus += d);
  p.stderr.on('data', d => aus += d);
  p.on('close', code => {
    ergebnisse.push({name, code, aus, dauer: (Date.now() - t0) / 1000});
    process.stdout.write(code ? `  ${name} ROT\n` : `  ${name} ok\n`);
    laufend--; weiter();
  });
}

function weiter() {
  while (laufend < GRENZE && naechste < SUITEN.length) {
    laufend++; starte(SUITEN[naechste++]);
  }
  if (laufend === 0 && naechste >= SUITEN.length) fertig();
}

function fertig() {
  /* Ausgabe in der gewohnten Reihenfolge, nicht in der des Zieleinlaufs. */
  ergebnisse.sort((a, b) => SUITEN.indexOf(a.name) - SUITEN.indexOf(b.name));
  for (const r of ergebnisse) {
    console.log('\n' + '='.repeat(60));
    console.log(`  test_${r.name}  (${r.dauer.toFixed(1)} s)` + (r.code ? '  ROT' : ''));
    console.log('='.repeat(60));
    process.stdout.write(r.aus);
  }
  const rot = ergebnisse.filter(r => r.code);
  const laengste = Math.max(...ergebnisse.map(r => r.dauer));
  const summe = ergebnisse.reduce((s, r) => s + r.dauer, 0);
  console.log('\n' + '='.repeat(60));
  const gesamt = (Date.now() - start) / 1000;
  console.log(`Nebenläufig bis ${GRENZE}: ${gesamt.toFixed(1)} s Wanduhr, ` +
              `${summe.toFixed(1)} s Rechenzeit, längste Suite ${laengste.toFixed(1)} s`);
  console.log(rot.length ? `${rot.length} SUITE(N) ROT: ${rot.map(r => r.name).join(', ')}`
                         : 'ALLE SUITEN OK');
  process.exitCode = rot.length ? 1 : 0;
}

console.log(`Starte ${SUITEN.length} Suiten, höchstens ${GRENZE} gleichzeitig:`);
weiter();
