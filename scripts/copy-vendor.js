// Kopiert die benötigten Laufzeitdateien für die Offline-Spracherkennung
// (transformers.js + ONNX Runtime WebAssembly) nach src/vendor.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'vendor');
fs.mkdirSync(out, { recursive: true });

function findPkg(name) {
  const candidates = [
    path.join(root, 'node_modules', name),
    path.join(root, 'node_modules', '@huggingface', 'transformers', 'node_modules', name),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const tj = findPkg('@huggingface/transformers');
const ort = findPkg('onnxruntime-web');
if (!tj || !ort) {
  console.warn('[copy-vendor] transformers.js / onnxruntime-web nicht gefunden – Spracherkennung wird nicht verfügbar sein.');
  process.exit(0);
}

fs.copyFileSync(path.join(tj, 'dist', 'transformers.min.js'), path.join(out, 'transformers.min.js'));
const ortDist = path.join(ort, 'dist');
let n = 0;
for (const f of fs.readdirSync(ortDist)) {
  if (/^ort-wasm-simd-threaded(\.asyncify)?\.(wasm|mjs)$/.test(f)) {
    fs.copyFileSync(path.join(ortDist, f), path.join(out, f));
    n++;
  }
}
console.log(`[copy-vendor] transformers.min.js + ${n} ONNX-Runtime-Dateien nach src/vendor kopiert.`);
