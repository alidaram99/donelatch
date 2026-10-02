import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const absWorkingDir=fileURLToPath(new URL('..',import.meta.url));
for (const [entry, outfile] of [['src/index.mjs','bundle/core.mjs'],['src/verify-entry.mjs','bundle/verify.mjs']]) {
  await build({absWorkingDir,entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',target:'node24',legalComments:'eof',banner:{js:'import { createRequire as __donelatchCreateRequire } from "node:module";\nconst require = __donelatchCreateRequire(import.meta.url);'}});
}
console.log('Built self-contained CLI and verifier bundles.');
