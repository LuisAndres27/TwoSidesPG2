import { performance } from 'node:perf_hooks';
import { CredentialHasher } from '../src/modules/auth/credential-hasher.js';
import { generateCredential } from '../src/modules/identity/identity.js';

const hasher = new CredentialHasher();
const samples = 8;
const baseRss = process.memoryUsage.rss();
let peakRss = baseRss;
const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage.rss()); }, 2);
const cpuStart = process.cpuUsage();
const hashes = [];
const verifications = [];
const concurrent = [];
const round = value => Math.round(value * 100) / 100;
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, p50Ms: round(sorted[Math.ceil(sorted.length * 0.5) - 1]), p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]) };
};
try {
  for (let i = 0; i < samples; i++) {
    const credential = generateCredential();
    let start = performance.now();
    const verifier = await hasher.hash(credential);
    hashes.push(performance.now() - start);
    start = performance.now();
    if (!await hasher.verify(verifier, credential)) throw new Error('Synthetic verification failed');
    verifications.push(performance.now() - start);
  }
  for (let i = 0; i < 4; i++) {
    await Promise.all(Array.from({ length: 2 }, async () => {
      const start = performance.now();
      await hasher.hash(generateCredential());
      concurrent.push(performance.now() - start);
    }));
  }
  peakRss = Math.max(peakRss, process.memoryUsage.rss());
  const cpu = process.cpuUsage(cpuStart);
  console.log(JSON.stringify({
    node: process.version, platform: process.platform, arch: process.arch,
    policy: { algorithm: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1, saltBytes: 16, outputBytes: 32 },
    hash: summary(hashes), verify: summary(verifications), hashAtConcurrency2: summary(concurrent),
    processRssBaselineMiB: round(baseRss / 1048576), processRssSampledPeakMiB: round(peakRss / 1048576),
    sampledRssIncreaseMiB: round((peakRss - baseRss) / 1048576), rssSamplingIntervalMs: 2,
    cpuUserMs: round(cpu.user / 1000), cpuSystemMs: round(cpu.system / 1000), maxActive: hasher.pool.stats.peak,
  }, null, 2));
} finally { clearInterval(timer); }
