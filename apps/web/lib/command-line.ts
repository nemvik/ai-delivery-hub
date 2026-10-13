// Splits a typed command line into argv for display and storage. Nothing is
// ever passed to a shell: the hub runs `executable` with `args` directly.
export function parseCommandLine(line: string): {
  executable: string;
  args: string[];
} {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (
        c === "\\" &&
        quote === '"' &&
        (line[i + 1] === '"' || line[i + 1] === "\\")
      )
        current += line[++i];
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) parts.push(current);
      current = "";
      started = false;
    } else {
      current += c;
      started = true;
    }
  }
  if (quote) throw new Error("Unclosed quote");
  if (started) parts.push(current);
  if (!parts.length || !parts[0]) throw new Error("Enter a command");
  return { executable: parts[0], args: parts.slice(1) };
}

function quoteArg(arg: string) {
  if (arg && !/[\s"'\\]/.test(arg)) return arg;
  if (!arg.includes("'")) return `'${arg}'`;
  return `"${arg.replace(/["\\]/g, (c) => "\\" + c)}"`;
}

export function formatCommandLine(executable: string, args: string[]) {
  return [executable, ...args].map(quoteArg).join(" ");
}
