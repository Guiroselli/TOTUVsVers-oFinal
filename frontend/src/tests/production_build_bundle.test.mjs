import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const distDir = path.join(frontendRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');

describe('Production Build Bundle Verification — Proton Flow (PARTE 2)', () => {

  test('1. Production build bundle exists or can be built via vite build', () => {
    if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
      execSync('npm run build', { cwd: frontendRoot, stdio: 'inherit' });
    }
    assert.ok(fs.existsSync(distDir), 'frontend/dist directory must exist after build');
    assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'frontend/dist/index.html must exist');
  });

  test('2. Compiled JavaScript chunks include the "Importar" button and action handler', () => {
    assert.ok(fs.existsSync(assetsDir), 'frontend/dist/assets must exist');
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'Must produce at least one compiled JS chunk');

    let allJsContent = '';
    for (const f of jsFiles) {
      allJsContent += fs.readFileSync(path.join(assetsDir, f), 'utf-8') + '\n';
    }

    assert.ok(
      allJsContent.includes('Importar'),
      'Compiled bundle must contain the "Importar" button label'
    );
  });

  test('3. Compiled bundle includes ImportTranscriptModal and supported formats (.txt, .md, .srt, .vtt, .docx)', () => {
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    let allJsContent = '';
    for (const f of jsFiles) {
      allJsContent += fs.readFileSync(path.join(assetsDir, f), 'utf-8') + '\n';
    }

    assert.ok(
      allJsContent.includes('Importar Transcri') || allJsContent.includes('Importar Transcrições'),
      'Bundle must contain ImportTranscriptModal title/content'
    );

    const formats = ['.txt', '.md', '.srt', '.vtt', '.docx'];
    for (const fmt of formats) {
      assert.ok(
        allJsContent.includes(fmt),
        `Bundle must support format extension ${fmt}`
      );
    }
  });

  test('4. Backend API client routes for transcript import exist in the compiled bundle', () => {
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    let allJsContent = '';
    for (const f of jsFiles) {
      allJsContent += fs.readFileSync(path.join(assetsDir, f), 'utf-8') + '\n';
    }

    assert.ok(
      allJsContent.includes('/import/preview') || allJsContent.includes('previewImportedTranscripts'),
      'Bundle must contain preview endpoint mapping'
    );
    assert.ok(
      allJsContent.includes('/import/confirm') || allJsContent.includes('confirmImportedTranscripts'),
      'Bundle must contain confirmation endpoint mapping'
    );
  });

});
