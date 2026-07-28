const ansiControlSequence = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string) {
  return text.replace(ansiControlSequence, '');
}
