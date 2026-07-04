function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function readBalancedJsonValue(text: string, start: number) {
  const openToClose = new Map([
    ["{", "}"],
    ["[", "]"]
  ]);
  const closeChars = new Set(["}", "]"]);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    const expectedClose = openToClose.get(char);
    if (expectedClose) {
      stack.push(expectedClose);
      continue;
    }

    if (closeChars.has(char)) {
      if (stack.length === 0 || stack[stack.length - 1] !== char) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseFirstBalancedJsonValue(text: string) {
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char !== "{" && char !== "[") continue;

    const candidate = readBalancedJsonValue(text, i);
    if (!candidate) continue;

    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

export function parseAiJson(text: string): unknown {
  const cleaned = stripJsonFence(text);

  try {
    return JSON.parse(cleaned) as unknown;
  } catch (error) {
    const parsed = parseFirstBalancedJsonValue(cleaned);
    if (parsed !== null) return parsed;
    throw error;
  }
}
