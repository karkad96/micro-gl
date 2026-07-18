import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_PATH = resolve(ROOT, 'package.json');
const LOCK_PATH = resolve(ROOT, 'package-lock.json');
const EXPECTED_REPOSITORY =
  'git+https://github.com/karkad96/micro-gl.git';
const REQUIRED_FILES = [
  'LICENSE',
  'README.md',
  'package.json',
  'src/index.js',
];
const ALLOWED_ROOT_FILES = new Set(['LICENSE', 'README.md', 'package.json']);

const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
const packageLock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
const problems = [];

requireValue(packageJson.name === 'micro-gl', 'package name must be micro-gl');
requireValue(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    packageJson.version,
  ),
  'package version must be valid semver',
);
requireValue(packageJson.license === 'MIT', 'package license must be MIT');
requireValue(
  packageLock.version === packageJson.version &&
    packageLock.packages?.['']?.version === packageJson.version,
  'package-lock version must match package.json',
);
requireValue(
  packageLock.packages?.['']?.license === packageJson.license,
  'package-lock license must match package.json',
);
requireValue(
  packageJson.repository?.url === EXPECTED_REPOSITORY,
  'repository URL must match the GitHub repository used by npm trusted publishing',
);
requireValue(
  packageJson.publishConfig?.registry === 'https://registry.npmjs.org/',
  'publishConfig.registry must target npmjs',
);
requireValue(
  packageJson.publishConfig?.access === 'public',
  'publishConfig.access must be public',
);
requireValue(
  Object.keys(packageJson.dependencies ?? {}).length === 0,
  'runtime dependencies are not allowed',
);
requireValue(
  Object.keys(packageJson.optionalDependencies ?? {}).length === 0,
  'optional runtime dependencies are not allowed',
);

for (const path of REQUIRED_FILES) {
  requireValue(existsSync(resolve(ROOT, path)), path + ' must exist');
}

const releaseTag = process.env.RELEASE_TAG;
if (releaseTag) {
  const tagMatchesVersion = releaseTag === 'v' + packageJson.version;
  requireValue(
    tagMatchesVersion,
    'release tag ' +
      releaseTag +
      ' must equal v' +
      packageJson.version,
  );
  requireValue(
    !packageJson.version.includes('-'),
    'stable GitHub Releases cannot publish a prerelease version',
  );
  if (tagMatchesVersion && !packageJson.version.includes('-')) {
    requireUnpublishedVersion();
  }
}

let packed;
try {
  const output = runNpm([
    'pack',
    '--dry-run',
    '--json',
    '--ignore-scripts',
  ]);
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error('npm pack returned an unexpected result');
  }
  packed = result[0];
} catch (error) {
  problems.push('npm pack --dry-run failed: ' + error.message);
}

if (packed) {
  const packedFiles = new Set(
    packed.files.map(({ path }) => path.replaceAll('\\', '/')),
  );

  for (const path of REQUIRED_FILES) {
    requireValue(packedFiles.has(path), path + ' must be included in npm pack');
  }

  for (const path of packageTargets(packageJson)) {
    const normalized = path.replace(/^\.\//, '');
    requireValue(
      packedFiles.has(normalized),
      path + ' is a package entry point but is missing from npm pack',
    );
  }

  for (const path of packedFiles) {
    requireValue(
      ALLOWED_ROOT_FILES.has(path) || path.startsWith('src/'),
      path + ' must not be included in npm pack',
    );
  }
}

if (problems.length > 0) {
  console.error(
    'Release validation failed:\n' +
      problems.map((problem) => '- ' + problem).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    'Validated ' +
      packageJson.name +
      '@' +
      packageJson.version +
      ': ' +
      packed.files.length +
      ' files, ' +
      packed.size +
      ' bytes',
  );
}

function requireValue(condition, message) {
  if (!condition) problems.push(message);
}

function requireUnpublishedVersion() {
  const spec = packageJson.name + '@' + packageJson.version;
  try {
    const publishedVersion = runNpm([
      'view',
      spec,
      'version',
      '--json',
    ]).trim();
    if (publishedVersion) {
      problems.push(spec + ' is already published on npm');
    }
  } catch (error) {
    const details = String(error.stdout ?? '') + String(error.stderr ?? '');
    if (!details.includes('E404')) {
      problems.push('could not verify npm version availability: ' + error.message);
    }
  }
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error('run this validator through npm run validate:package');
  }
  return execFileSync(process.execPath, [npmExecPath, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function packageTargets(value) {
  const targets = new Set([value.main, value.module]);
  collectTargets(value.exports, targets);
  targets.delete(undefined);
  return targets;
}

function collectTargets(value, targets) {
  if (typeof value === 'string') {
    targets.add(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) collectTargets(nested, targets);
}
