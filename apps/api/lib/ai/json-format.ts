/**
 * Normalize formatting only. Never add missing keys/brackets/quotes, guess
 * quantities, remove prose, or choose between multiple JSON documents.
 * The caller must still parse JSON and validate its schema afterwards.
 */
export function normalizeJsonFormatting(content: string): string {
  let input = content.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(input);
  if (fenced) input = fenced[1]!.trim();
  let output = "";
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (escaped) { output += ch; escaped = false; }
      else if (ch === "\\") { output += ch; escaped = true; }
      else if (ch === '"') { output += ch; quoted = false; }
      // Preserve actual newlines/tabs as characters in the parsed string.
      else if (ch.charCodeAt(0) < 0x20) output += JSON.stringify(ch).slice(1, -1);
      else output += ch;
    } else {
      if (ch === '"') quoted = true;
      if (ch === ",") {
        let next = i + 1;
        while (/\s/.test(input[next] ?? "") && next < input.length) next++;
        const prior = output.trimEnd().at(-1);
        if ((input[next] === "}" || input[next] === "]") && prior && !"[{,:".includes(prior)) continue;
      }
      output += ch;
    }
  }
  return output;
}
