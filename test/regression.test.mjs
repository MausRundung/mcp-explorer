// Regression tests for the 5 fixes to explore_project / search_files.
// Run AFTER a build: `npm test` (see package.json -> "npm run build && node --test test/").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { handleExploreProject } from '../build/explore-project.js';
import { handleSearch } from '../build/search.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (p) => path.join(here, 'fixtures', p);
const textOf = (res) => res?.content?.[0]?.text ?? '';

// --- Fix #1: dependency graph resolves ./helper.js -> helper.ts (NodeNext/ESM) -------
test('explore_project resolves ".js" specifiers to ".ts" files (graph is not empty)', async () => {
  const dir = fixture('esm-ts');
  const text = textOf(await handleExploreProject({ directory: dir }, [dir]));
  assert.match(text, /## Dependency Graph \(local imports\)/);
  assert.match(text, /Edges: 1/);
  assert.match(text, /helper\.ts.*imported 1x/s);
  assert.match(text, /index\.ts.*imports 1 local files/s);
});

// --- Fix #5: search output is truthful (never mutates content / line numbers) ---------
test('search returns the ORIGINAL snippet (URL not stripped) with excludeComments', async () => {
  const dir = fixture('snips');
  const text = textOf(await handleSearch(
    { pattern: 'api', extensions: ['.ts'], excludeComments: true, searchPath: dir }, [dir]));
  assert.match(text, /https:\/\/example\.com\/v1/); // old code truncated this to `https:`
});

test('search keeps correct original line numbers with excludeComments', async () => {
  const dir = fixture('snips');
  const text = textOf(await handleSearch(
    { pattern: 'marker', extensions: ['.ts'], excludeComments: true, searchPath: dir }, [dir]));
  assert.match(text, /Line 2: export const marker = api;/);
});

test('excludeStrings drops in-string matches (intended) without falsifying other text', async () => {
  const dir = fixture('snips');
  const kept = textOf(await handleSearch(
    { pattern: 'example', extensions: ['.ts'], searchPath: dir }, [dir]));
  assert.match(kept, /example\.com/);
  const dropped = textOf(await handleSearch(
    { pattern: 'example', excludeStrings: true, extensions: ['.ts'], searchPath: dir }, [dir]));
  assert.match(dropped, /No matches found/);
});

// --- Fix #3: maxResults is a GLOBAL match budget (was ~10x overspent when grouped) ----
test('maxResults caps total matches in grouped mode', async () => {
  const dir = fixture('budget');
  const text = textOf(await handleSearch(
    { pattern: 'const', extensions: ['.ts'], maxResults: 5, groupByFile: true, searchPath: dir }, [dir]));
  const shown = text.split('\n').filter((l) => /^Line \d+: /.test(l)).length;
  assert.equal(shown, 5, 'should emit exactly maxResults match lines');
  assert.match(text, /and 25 more matches/);
  assert.match(text, /truncated at 5 results/);
});

// --- Fix #4: pattern is required (no silent ".*" default) ------------------------------
test('search_files requires a pattern', async () => {
  const dir = fixture('snips');
  await assert.rejects(() => handleSearch({ searchPath: dir }, [dir]), /pattern/);
});

// --- Fix #2: "structured" outputFormat no longer advertised ----------------------------
test('outputFormat enum no longer offers the unimplemented "structured"', async () => {
  const { searchTool } = await import('../build/search.js');
  assert.deepEqual(searchTool.inputSchema.properties.outputFormat.enum, ['text', 'json']);
  assert.ok(searchTool.inputSchema.required.includes('pattern'));
});

// --- Flutter / Dart support ------------------------------------------------------------
test('explore_project parses Dart and resolves package:/part edges via pubspec', async () => {
  const dir = fixture('flutter-app');
  const text = textOf(await handleExploreProject({ directory: dir }, [dir]));
  // pubspec summary
  assert.match(text, /## Dart \/ Flutter Packages/);
  assert.match(text, /package: demo_app, version: 1\.0\.0\+1, dart: \^3\.5\.0, flutter: >=3\.24\.0, deps: 3 \(dev 2\), path deps: shared_pkg -> packages\/shared_pkg, assets: 1/);
  // graph: package:self, package:path-dep, implicit-relative, ../relative, part, part-of
  assert.match(text, /Edges: 7/);
  assert.match(text, /user\.dart`? \(imported 3x\)/);
  assert.match(text, /from "user\.g\.dart", kind=part/);
  assert.match(text, /from "user\.dart", kind=part-of/);
  // declarations
  assert.match(text, /kind=class, name=HomePage/);
  assert.match(text, /kind=function, name=main/);
  assert.match(text, /kind=function, name=build/); // multi-line signature
});

test('search_files excludeGenerated skips build_runner codegen (*.g.dart)', async () => {
  const dir = fixture('flutter-app');
  const all = textOf(await handleSearch(
    { pattern: 'UserFromJson', extensions: ['.dart'], searchPath: dir }, [dir]));
  assert.match(all, /user\.g\.dart/);
  const gen = textOf(await handleSearch(
    { pattern: 'UserFromJson', extensions: ['.dart'], excludeGenerated: true, searchPath: dir }, [dir]));
  assert.doesNotMatch(gen, /user\.g\.dart/);
  assert.match(gen, /models[\\/]user\.dart/); // hand-written library still matches
});

test('excludeComments suppresses matches inside Dart comments', async () => {
  const dir = fixture('flutter-app');
  const withComments = textOf(await handleSearch(
    { pattern: 'needle_marker', extensions: ['.dart'], searchPath: dir }, [dir]));
  assert.match(withComments, /needle_marker/);
  const without = textOf(await handleSearch(
    { pattern: 'needle_marker', excludeComments: true, extensions: ['.dart'], searchPath: dir }, [dir]));
  assert.match(without, /No matches found/);
});
