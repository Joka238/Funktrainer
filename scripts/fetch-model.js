// Lädt das Whisper-Sprachmodell herunter und legt es in src/models ab,
// damit es in die App eingebaut wird (Spracherkennung sofort offline nutzbar).
// Aufruf: node scripts/fetch-model.js [Modell-ID]   (Standard: Xenova/whisper-base)
const fs = require('fs');
const path = require('path');

const model = process.argv[2] || 'Xenova/whisper-small';
const base = `https://huggingface.co/${model}/resolve/main/`;
const out = path.join(__dirname, '..', 'src', 'models', ...model.split('/'));

// Dateien für die Spracherkennung: Encoder unkomprimiert (Genauigkeit), Decoder komprimiert (q8)
const REQUIRED = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const OPTIONAL = ['special_tokens_map.json', 'added_tokens.json', 'normalizer.json', 'vocab.json', 'merges.txt', 'processor_config.json'];

async function get(file, required) {
  const dest = path.join(out, file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  ✓ ${file} (vorhanden)`);
    return;
  }
  const res = await fetch(base + file);
  if (!res.ok) {
    if (required) throw new Error(`${file}: HTTP ${res.status}`);
    console.log(`  – ${file} (nicht vorhanden, optional)`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

(async () => {
  console.log(`Lade ${model} nach ${out}`);
  for (const f of REQUIRED) await get(f, true);
  for (const f of OPTIONAL) await get(f, false);
  console.log('Fertig.');
})().catch((e) => {
  console.error('Download fehlgeschlagen:', e.message);
  process.exit(1);
});
