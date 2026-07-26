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
  '@durion-sdk/order',
  '@durion-sdk/people',
  '@durion-sdk/people-contact',
  '@durion-sdk/security',
  '@durion-sdk/shop-manager',
  '@durion-sdk/vehicle-inventory',
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

function ensureSdkBuild(sdkRoot) {
  const missingDist = PACKAGE_NAMES.some(packageName => {
    const distPackageJson = path.join(
      sdkRoot,
      'packages',
      packageDirName(packageName),
      'dist',
      'package.json',
    );
    return !existsSync(distPackageJson);
  });

  if (!missingDist) {
    return;
  }

  log(`Built SDK artifacts not found under ${sdkRoot}; building SDK repo first.`);

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

function installedPackagesMatchState(state, fingerprint) {
  return allPackagesInstalled() &&
    state &&
    typeof state === 'object' &&
    state.fingerprint === fingerprint;
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

function installFromManifest(manifest) {
  const tarballs = PACKAGE_NAMES.map(packageName => path.join(packDir, manifest.packages[packageName]));

  log(`Installing SDK packages from ${packDir}`);
  run('npm', ['install', '--no-save', '--no-package-lock', ...tarballs]);
}

function main() {
  const sdkRoot = detectSdkRoot();
  const installState = readInstallState();

  if (sdkRoot) {
    ensureSdkBuild(sdkRoot);

    const fingerprint = createSdkFingerprint(sdkRoot);
    if (installedPackagesMatchState(installState, fingerprint)) {
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
    return;
  }

  const manifest = readManifest();
  if (manifestIsUsable(manifest)) {
    const fingerprint = createManifestFingerprint(manifest);
    if (installedPackagesMatchState(installState, fingerprint)) {
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
