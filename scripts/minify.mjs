/**
 * Minifies all .js files in dist/ (output from tsc). Preserves source maps.
 */
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

async function main() {
  const files = await readdir(distDir);
  const jsFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('.map'));

  for (const name of jsFiles) {
    const path = join(distDir, name);
    const code = await readFile(path, 'utf-8');
    const mapPath = path + '.map';
    let inputMap = undefined;
    try {
      inputMap = await readFile(mapPath, 'utf-8');
    } catch {
      // no source map
    }

    const result = await minify(code, {
      compress: true,
      mangle: true,
      format: { comments: false },
      sourceMap: inputMap
        ? {
            filename: name,
            content: inputMap,
            url: name + '.map',
          }
        : false,
    });

    if (result.code) {
      await writeFile(path, result.code);
    }
    if (result.map) {
      await writeFile(mapPath, result.map);
    }
  }

  console.log('Minified', jsFiles.length, 'file(s) in dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
