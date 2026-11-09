// Gemeinsame Spracherkennungs-Logik (Whisper) für App (Web Worker) und Messskripte (Node).
// Unterstützt einen "Prompt" mit Funk-Wortschatz, damit Whisper Begriffe wie "Heros",
// Rufnamen und Betriebsworte zuverlässiger erkennt.

/** Grundwortschatz des BOS-Funks als Kontext für Whisper. */
export const BASE_PROMPT =
  'Sprechfunk. Heros Musterstadt 21/52 von Heros Musterstadt 21/10, kommen. ' +
  'Hier Heros Musterstadt 21/52, kommen. Verstanden, Ende. Wiederholen. Funkprobe. Florian. Lagemeldung.';

export function buildPrompt(extra = []) {
  const words = [...new Set(extra.filter(Boolean))].join(', ');
  return words ? `${BASE_PROMPT} ${words}.` : BASE_PROMPT;
}

/**
 * Lädt Whisper.
 * @param {object} T          transformers.js-Modul (Web- oder Node-Build)
 * @param {string} model      z. B. "Xenova/whisper-small"
 * @param {object} opts       { dtype, device, progress_callback }
 */
export async function createAsr(T, model, { dtype = 'q8', device, progress_callback } = {}) {
  const common = { progress_callback };
  const [processor, tokenizer, m] = await Promise.all([
    T.AutoProcessor.from_pretrained(model, common),
    T.AutoTokenizer.from_pretrained(model, common),
    T.WhisperForConditionalGeneration.from_pretrained(model, { ...common, dtype, ...(device ? { device } : {}) }),
  ]);
  const gc = m.generation_config;
  const init = [
    gc.decoder_start_token_id,
    gc.lang_to_id['<|de|>'],
    gc.task_to_id.transcribe,
    gc.no_timestamps_token_id,
  ].filter((x) => x != null);
  const prevSot = gc.prev_sot_token_id ?? (gc.decoder_start_token_id != null ? gc.decoder_start_token_id - 1 : null);

  async function transcribe(audio, { prompt = null } = {}) {
    const inputs = await processor(audio);
    let prefix = init;
    if (prompt && prevSot != null) {
      let ids = tokenizer.encode(' ' + prompt, { add_special_tokens: false });
      if (ids.length > 200) ids = ids.slice(-200);
      prefix = [prevSot, ...ids, ...init];
    }
    const out = await m.generate({
      inputs: inputs.input_features,
      decoder_input_ids: prefix,
      max_new_tokens: 160,
    });
    const seq = Array.from(out.tolist ? out.tolist()[0] : out[0]).map(Number);
    const startsWithPrefix = prefix.every((id, i) => seq[i] === id);
    const gen = startsWithPrefix ? seq.slice(prefix.length) : seq;
    return tokenizer.decode(gen, { skip_special_tokens: true }).trim();
  }

  return { transcribe, model };
}
