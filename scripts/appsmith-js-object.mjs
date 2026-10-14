import vm from 'node:vm';

// Appsmith Community v2.4.2, workers/Evaluation/JSObject/index.ts:
// validJSBodyRegex is anchored at byte zero; JS-valid comments before export fail.
// https://github.com/appsmithorg/appsmith/blob/v2.4.2/app/client/src/workers/Evaluation/JSObject/index.ts
export const validJSBodyRegex = /^export default[\s]*?({[\s\S]*?})/;

export function compileAppsmithCollection(source, filename='JS object') {
  if (!validJSBodyRegex.test(source)) {
    throw new Error(filename + ': Appsmith 2.4.2 JS object must start with export default; put comments inside the object');
  }
  return new vm.Script(source.replace(/^export default/, 'globalThis.collection='), {filename});
}
