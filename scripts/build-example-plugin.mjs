import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packager from './package-plugin.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'examples', 'plugins', 'dice');
const output = path.join(root, '.cache', 'example-plugin', 'dice');
await build({ configFile: false, root: source, base: './', publicDir: false, cacheDir: path.join(root, '.cache', 'plugin-vite'), esbuild: { jsx: 'automatic' }, build: { outDir: output, emptyOutDir: true, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); } } } });
await fs.copyFile(path.join(source, 'manifest.json'), path.join(output, 'manifest.json'));
await fs.copyFile(path.join(root, 'public', 'THIRD_PARTY_NOTICES.txt'), path.join(output, 'THIRD_PARTY_NOTICES.txt'));
console.log(await packager.packagePlugin(output, path.join(root, '.cache', 'example-plugin', 'dockit.dice-0.1.0.zip')));
