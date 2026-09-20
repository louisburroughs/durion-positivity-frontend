#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_NAMES = [
  '@durion-sdk/transport',
  '@durion-sdk/accounting',
  '@durion-sdk/bulk-loader',
  '@durion-sdk/catalog',
  '@durion-sdk/customer',
  '@durion-sdk/inventory',
  '@durion-sdk/invoice',
  '@durion-sdk/location',
  '@durion-sdk/marketing',
  '@durion-sdk/order',
  '@durion-sdk/people',
  '@durion-sdk/people-contact',
  '@durion-sdk/security',
  '@durion-sdk/supplier',
  '@durion-sdk/shop-manager',
  '@durion-sdk/tenant',
  '@durion-sdk/vehicle-inventory',
  '@durion-sdk/warranty',
  '@durion-sdk/workorder',
];

const projectRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const failIfUnavailable = !args.has('--if-available');
const packDir = path.resolve(
  projectRoot,
  process.env.DURION_SDK_TARBALL_DIR ?? '.sdk-tarballs',
);
const manifestPath = path.join(packDir, 'manifest.json');
const installStatePath = path.join(
  projectRoot,
  'node_modules',
  '.cache',
  'durion-sdk-install-state.json',
);
const sdkRootCandidates = [
  process.env.DURION_SDK_ANGULAR_PATH,
  path.join(projectRoot, '.sdk-src'),
  path.join(projectRoot, '../durion-positivity-sdk-angular'),
].filter(Boolean).map(candidate => path.resolve(projectRoot, candidate));

function log(message) {
  process.stdout.write(`[sdk-install] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[sdk-install] ${message}\n`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    cwd: options.cwd ?? projectRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const details = options.captureOutput
      ? `\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`
      : '';
    fail(`Command failed: ${command} ${commandArgs.join(' ')}${details}`);
  }

  return result.stdout ?? '';
}

function packageDirName(packageName) {
  return `sdk-${packageName.replace('@durion-sdk/', '')}`;
}

function installedPackagePath(packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'), 'package.json');
}

function allPackagesInstalled() {
  return PACKAGE_NAMES.every(packageName => existsSync(installedPackagePath(packageName)));
}

function installedVersion(packageName) {
  const manifest = installedPackagePath(packageName);
  if (!existsSync(manifest)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

// Versions the SDK source would install, read straight from the built dist
// manifests that get packed.
function versionsFromSdkRoot(sdkRoot) {
  const versions = {};

  for (const packageName of PACKAGE_NAMES) {
    const distManifest = path.join(
      sdkRoot,
      'packages',
      packageDirName(packageName),
      'dist',
      'package.json',
    );

    try {
      versions[packageName] = JSON.parse(readFileSync(distManifest, 'utf8')).version ?? null;
    } catch {
      versions[packageName] = null;
    }
  }

  return versions;
}

// npm names a tarball `<package name, scope flattened>-<version>.tgz`, so the
// version is what is left after the known prefix and the extension.
function versionFromTarballName(packageName, tarballName) {
  const prefix = `${packageName.replace('@', '').replace('/', '-')}-`;
  if (!tarballName.startsWith(prefix) || !tarballName.endsWith('.tgz')) {
    return null;
  }

  return tarballName.slice(prefix.length, -'.tgz'.length) || null;
}

function versionsFromManifest(manifest) {
  const versions = {};

  for (const packageName of PACKAGE_NAMES) {
    versions[packageName] = versionFromTarballName(packageName, manifest.packages[packageName]);
  }

  return versions;
}

// The fingerprint only describes the SDK *source*; it says nothing about what
// is sitting in node_modules. Anything can leave those out of step — a manual
// `npm install` of older tarballs, a branch switch, a partially failed install
// — so the versions have to be compared before the install is skipped.
function installedVersionsMatch(expectedVersions) {
  return PACKAGE_NAMES.every(packageName => {
    const expected = expectedVersions[packageName];
    return typeof expected === 'string' && installedVersion(packageName) === expected;
  });
}

function hashDirectoryContents(hash, dir, baseDir = dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      hash.update(`dir:${relativePath}\n`);
      hashDirectoryContents(hash, fullPath, baseDir);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = statSync(fullPath);
    hash.update(`file:${relativePath}:${stat.size}:${stat.mtimeMs}\n`);
  }
}

function detectSdkRoot() {
  return sdkRootCandidates.find(candidate =>
    existsSync(path.join(candidate, 'package.json')) &&
    existsSync(path.join(candidate, 'packages')),
  );
}

function packageJsonVersion(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

// `dist` is a build output the SDK repo keeps between checkouts, so its mere
// presence proves nothing about which source it was built from: a version bump
// pulled in with `git pull` leaves last release's `dist` sitting there looking
// complete. Every downstream version read — the fingerprint, the packed
// tarballs, the installed packages — comes off `dist`, so a stale one is
// self-consistent and silently pins the whole frontend to the old SDK. Compare
// each `dist` against the source `package.json` beside it and rebuild on drift.
function ensureSdkBuild(sdkRoot) {
  const staleReasons = [];

  for (const packageName of PACKAGE_NAMES) {
    const packageDir = path.join(sdkRoot, 'packages', packageDirName(packageName));
    const distPackageJson = path.join(packageDir, 'dist', 'package.json');

    if (!existsSync(distPackageJson)) {
      staleReasons.push(`  ${packageName}: no built dist`);
      continue;
    }

    const sourcePackageJson = path.join(packageDir, 'package.json');
    const sourceVersion = packageJsonVersion(sourcePackageJson);
    const distVersion = packageJsonVersion(distPackageJson);

    // No readable source version means the comparison cannot clear this dist,
    // so it must not be taken on trust: that is the same silent pass this
    // check exists to remove. Rebuilding either fixes it or fails loudly on
    // the package that is actually broken.
    if (!sourceVersion) {
      staleReasons.push(`  ${packageName}: no readable version in ${sourcePackageJson}`);
      continue;
    }

    if (distVersion !== sourceVersion) {
      staleReasons.push(
        `  ${packageName}: dist is ${distVersion ?? '(unreadable)'}, source is ${sourceVersion}`,
      );
    }
  }

  if (staleReasons.length === 0) {
    return;
  }

  log(`Built SDK artifacts under ${sdkRoot} are missing or stale; building SDK repo first:\n${staleReasons.join('\n')}`);

  if (!existsSync(path.join(sdkRoot, 'node_modules'))) {
    run('npm', ['ci'], { cwd: sdkRoot });
  }

  run('npm', ['run', 'build'], { cwd: sdkRoot });
}

function createSdkFingerprint(sdkRoot) {
  const hash = createHash('sha256');

  for (const packageName of PACKAGE_NAMES) {
    const distDir = path.join(
      sdkRoot,
      'packages',
      packageDirName(packageName),
      'dist',
    );

    hash.update(`${packageName}\n`);
    hashDirectoryContents(hash, distDir);
  }

  return hash.digest('hex');
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function manifestIsUsable(manifest) {
  if (!manifest || typeof manifest !== 'object' || typeof manifest.packages !== 'object') {
    return false;
  }

  return PACKAGE_NAMES.every(packageName => {
    const tarball = manifest.packages[packageName];
    return typeof tarball === 'string' && existsSync(path.join(packDir, tarball));
  });
}

function createManifestFingerprint(manifest) {
  return createHash('sha256')
    .update(JSON.stringify(manifest.packages))
    .digest('hex');
}

function readInstallState() {
  if (!existsSync(installStatePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(installStatePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeInstallState(state) {
  mkdirSync(path.dirname(installStatePath), { recursive: true });
  writeFileSync(installStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function installedPackagesMatchState(state, fingerprint, expectedVersions) {
  return allPackagesInstalled() &&
    state &&
    typeof state === 'object' &&
    state.fingerprint === fingerprint &&
    installedVersionsMatch(expectedVersions);
}

function packSdkPackages(sdkRoot) {
  ensureSdkBuild(sdkRoot);

  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });

  // The manifest is committed, so it must stay portable: never record the
  // absolute SDK checkout path of whoever packed the tarballs. Only `packages`
  // is consumed downstream (install + fingerprint).
  const manifest = {
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  for (const packageName of PACKAGE_NAMES) {
    const distDir = path.join(
      sdkRoot,
      'packages',
      packageDirName(packageName),
      'dist',
    );

    const tarballName = run(
      'npm',
      ['pack', distDir, '--pack-destination', packDir],
      { captureOutput: true },
    ).trim().split('\n').pop();

    if (!tarballName) {
      fail(`Failed to pack ${packageName} from ${distDir}`);
    }

    manifest.packages[packageName] = tarballName;
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

// These tarballs used to go in through `npm install --no-save
// --no-package-lock`. `--no-package-lock` does not mean "leave the lockfile
// alone", it means npm ignores it: the ideal tree is re-resolved from the
// semver ranges in package.json, so every unrelated dependency is quietly
// upgraded to the newest version its range allows. Since this script runs on
// `start`, `build`, `test` and `postinstall`, that dragged the whole local
// tree off `package-lock.json` — Angular included — while CI's `npm ci` stayed
// pinned, which is exactly the "green here, red there" split the lockfile
// exists to prevent.
//
// The SDK packages need no resolution of their own: their only dependency is
// tslib, which Angular already brings, and everything else they declare is a
// peer the app satisfies. ng-packagr strips the scripts section when it builds
// them and they ship no bins, so npm's install pipeline adds nothing here that
// unpacking the tarball does not. Unpack them in place and leave the rest of
// the tree exactly as the lockfile installed it.
function installFromManifest(manifest) {
  ensureTarAvailable();
  log(`Installing SDK packages from ${packDir}`);

  for (const packageName of PACKAGE_NAMES) {
    const tarball = path.join(packDir, manifest.packages[packageName]);
    const target = path.join(projectRoot, 'node_modules', ...packageName.split('/'));

    // Replace rather than overlay, so files dropped between SDK versions do
    // not survive as stale exports.
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });

    // npm tarballs wrap everything in a `package/` directory.
    run('tar', ['-xzf', tarball, '-C', target, '--strip-components=1']);
  }
}

// A build against a stale SDK fails in confusing ways much later, so confirm
// the install actually landed rather than trusting npm's exit code.
function verifyInstalledVersions(expectedVersions) {
  const mismatched = PACKAGE_NAMES
    .filter(packageName => installedVersion(packageName) !== expectedVersions[packageName])
    .map(packageName =>
      `  ${packageName}: expected ${expectedVersions[packageName] ?? '(unknown)'}, found ${installedVersion(packageName) ?? '(not installed)'}`,
    );

  if (mismatched.length > 0) {
    fail(`SDK install did not produce the expected versions:\n${mismatched.join('\n')}`);
  }

  const versions = new Set(PACKAGE_NAMES.map(packageName => expectedVersions[packageName]));
  log(`Installed SDK packages at version ${[...versions].join(', ')}.`);
}

// Unpacking the SDK tarballs needs `tar` on PATH. Say so plainly instead of
// letting the first extraction fail with a bare ENOENT.
function ensureTarAvailable() {
  const probe = spawnSync('tar', ['--version'], { stdio: 'ignore' });

  if (probe.error) {
    fail(
      'Unable to run `tar`, which is required to unpack the SDK tarballs into node_modules.\n' +
      'Install tar (or run this on a platform that ships it) and try again.',
    );
  }
}

function main() {
  const sdkRoot = detectSdkRoot();
  const installState = readInstallState();

  if (sdkRoot) {
    ensureSdkBuild(sdkRoot);

    const fingerprint = createSdkFingerprint(sdkRoot);
    const expectedVersions = versionsFromSdkRoot(sdkRoot);
    if (installedPackagesMatchState(installState, fingerprint, expectedVersions)) {
      log(`Required SDK packages already installed for current SDK source at ${sdkRoot}.`);
      return;
    }

    const manifest = packSdkPackages(sdkRoot);
    installFromManifest(manifest);
    writeInstallState({
      source: 'sdk-root',
      sdkRoot,
      fingerprint,
      generatedAt: manifest.generatedAt,
      packages: manifest.packages,
    });
    verifyInstalledVersions(versionsFromManifest(manifest));
    return;
  }

  const manifest = readManifest();
  if (manifestIsUsable(manifest)) {
    const fingerprint = createManifestFingerprint(manifest);
    const expectedVersions = versionsFromManifest(manifest);
    if (installedPackagesMatchState(installState, fingerprint, expectedVersions)) {
      log(`Required SDK packages already installed from cached tarballs in ${packDir}.`);
      return;
    }

    installFromManifest(manifest);
    writeInstallState({
      source: 'tarballs',
      fingerprint,
      generatedAt: manifest.generatedAt,
      packages: manifest.packages,
    });
    verifyInstalledVersions(expectedVersions);
    return;
  }

  if (allPackagesInstalled()) {
    log('Required SDK packages already installed.');
    return;
  }

  if (!sdkRoot) {
    const guidance = [
      'Unable to find a usable SDK source checkout or packed tarballs.',
      `Checked SDK repo candidates: ${sdkRootCandidates.join(', ') || '(none)'}`,
      `Checked tarball manifest: ${manifestPath}`,
      'Provide DURION_SDK_ANGULAR_PATH, populate .sdk-src, or run this build path with prepacked SDK tarballs.',
    ].join('\n');

    if (failIfUnavailable) {
      fail(guidance);
    }

    log(`${guidance}\nSkipping because --if-available was provided.`);
    return;
  }

  fail('Unexpected SDK installation state.');
}

main();
