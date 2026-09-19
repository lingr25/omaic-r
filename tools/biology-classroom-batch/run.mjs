#!/usr/bin/env node
/**
 * Resumable one-at-a-time classroom generator for 陈阅增《普通生物学》subsections.
 *
 * Usage:
 *   node tools/biology-classroom-batch/run.mjs
 *   node tools/biology-classroom-batch/run.mjs --status
 *   node tools/biology-classroom-batch/run.mjs --start 1.1
 *   node tools/biology-classroom-batch/run.mjs --only 1.1
 *   node tools/biology-classroom-batch/run.mjs --limit 20
 *   node tools/biology-classroom-batch/run.mjs --dry-run
 *
 * State: data/biology-classroom-batch/manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TOC_PATH = path.join(__dirname, 'toc.json');
const STATE_DIR = path.join(ROOT, 'data', 'biology-classroom-batch');
const MANIFEST_PATH = path.join(STATE_DIR, 'manifest.json');
const LOG_PATH = path.join(STATE_DIR, 'run.log');
const MAX_PDF_CONTENT_CHARS = 50_000;
const POLL_MS = 60_000;
const SUBMIT_RETRY_MS = 30_000;
const BETWEEN_JOBS_MS = 15_000;
const AFTER_FAIL_MS = 45_000;
const EPERM_RETRY_MS = 10_000;
const NETWORK_CIRCUIT_AFTER = 3;
const NETWORK_CIRCUIT_SLEEP_MS = 10 * 60 * 1000;
const MAX_NETWORK_CIRCUIT_TRIPS = 2;
const MAX_ATTEMPTS = 3;
const NETWORK_ERROR_RE =
  /Cannot connect to API|TLS|socket disconnected|ENOTFOUND|Connect Timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|aitreez|fetch failed|network socket/i;
const EPERM_ERROR_RE = /EPERM/;

function parseArgs(argv) {
  const flags = {
    baseUrl: 'http://localhost:3000',
    start: null,
    only: null,
    dryRun: false,
    status: false,
    skipFailed: false,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--status') flags.status = true;
    else if (arg === '--skip-failed') flags.skipFailed = true;
    else if (arg === '--base-url') flags.baseUrl = String(argv[++i] || '').replace(/\/+$/, '');
    else if (arg === '--start') flags.start = String(argv[++i] || '');
    else if (arg === '--only') flags.only = String(argv[++i] || '');
    else if (arg === '--limit') {
      const raw = String(argv[++i] || '');
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid --limit: ${raw}`);
      flags.limit = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return flags;
}

function classifyError(message) {
  if (NETWORK_ERROR_RE.test(message)) return 'network';
  if (EPERM_ERROR_RE.test(message)) return 'eperm';
  return 'other';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function logLine(message) {
  const line = `[${nowIso()}] ${message}`;
  console.log(line);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      fs.copyFileSync(tmp, filePath);
    } catch (copyError) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
      throw copyError ?? error;
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore leftover temp on Windows if the destination is already replaced
    }
  }
}

function loadToc() {
  const toc = JSON.parse(fs.readFileSync(TOC_PATH, 'utf8'));
  if (!Array.isArray(toc.sections) || toc.sections.length === 0) {
    throw new Error('toc.json has no sections');
  }
  return toc;
}

function emptyManifest(baseUrl, book) {
  return {
    book,
    baseUrl,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    jobs: {},
  };
}

function loadManifest(baseUrl, book) {
  if (!fs.existsSync(MANIFEST_PATH)) return emptyManifest(baseUrl, book);
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  raw.jobs ||= {};
  raw.baseUrl = baseUrl;
  raw.book = raw.book || book;
  return raw;
}

function saveManifest(manifest) {
  manifest.updatedAt = nowIso();
  writeJsonAtomic(MANIFEST_PATH, manifest);
}

function chapterPrefix(chapter) {
  return `ch${String(chapter).padStart(2, '0')}_`;
}

function findDigestPath(sourceDir, chapter) {
  const dir = path.join(ROOT, sourceDir);
  const prefix = chapterPrefix(chapter);
  const matches = fs.readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith('.md'));
  if (matches.length !== 1) {
    throw new Error(`Expected 1 digest for ${prefix}, found ${matches.length}: ${matches.join(', ')}`);
  }
  return path.join(dir, matches[0]);
}

function readPdfText(sourceDir, chapter) {
  const digestPath = findDigestPath(sourceDir, chapter);
  const text = fs.readFileSync(digestPath, 'utf8').trim();
  if (!text) throw new Error(`Empty digest: ${digestPath}`);
  return text.length > MAX_PDF_CONTENT_CHARS ? text.slice(0, MAX_PDF_CONTENT_CHARS) : text;
}

function buildRequirement(section) {
  return [
    `请基于陈阅增《普通生物学》（第5版）第${section.chapter}章「${section.chapterTitle}」的第${section.id}节「${section.title}」生成一门中文大学本科课堂。`,
    '',
    '硬性范围：',
    `- 只讲授本节 ${section.id} ${section.title}，不要扩写成整章，不要覆盖其他小节。`,
    '- 以提供的章节摘要为主要知识来源；摘要中与本节无关的内容仅作必要铺垫，不要展开。',
    '- 面向普通生物学本科课程，概念准确，层次清晰，适合课堂讲解。',
    '- 不要生成配图或图片生成请求；讲解以文字、板书、公式、列表、对比表为主。',
    '- 需要课堂语音讲解（TTS）。',
    `- 课堂标题应明确包含「${section.id} ${section.title}」。`,
  ].join('\n');
}

function summarize(manifest, sections) {
  const counts = { pending: 0, queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const section of sections) {
    const job = manifest.jobs[section.id];
    const status = job?.status || 'pending';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function printStatus(manifest, sections) {
  const counts = summarize(manifest, sections);
  logLine(
    `status total=${sections.length} pending=${counts.pending || 0} queued=${counts.queued || 0} running=${counts.running || 0} succeeded=${counts.succeeded || 0} failed=${counts.failed || 0}`,
  );
  for (const section of sections) {
    const job = manifest.jobs[section.id];
    if (!job) continue;
    if (job.status === 'succeeded') {
      logLine(`  ${section.id} succeeded classroom=${job.classroomId || '-'} scenes=${job.scenesCount ?? '-'} ${job.url || ''}`);
    } else if (job.status === 'failed') {
      logLine(`  ${section.id} failed attempts=${job.attempts || 0} ${job.error || ''}`);
    } else if (job.status === 'running' || job.status === 'queued') {
      logLine(`  ${section.id} ${job.status} jobId=${job.jobId || '-'} step=${job.step || '-'}`);
    }
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}

async function checkHealth(baseUrl) {
  const { ok, status, body } = await fetchJson(`${baseUrl}/api/health`);
  if (!ok || body.status !== 'ok') {
    throw new Error(`Health check failed (${status}): ${JSON.stringify(body)}`);
  }
  if (!body.capabilities?.tts) {
    throw new Error('Health check: TTS capability is false');
  }
  logLine(`health ok version=${body.version} tts=${body.capabilities.tts} image=${body.capabilities.imageGeneration}`);
}

function shouldProcess(section, job, flags, reachedStart) {
  if (flags.only) return section.id === flags.only;
  if (flags.start && !reachedStart) return false;
  if (!job) return true;
  if (job.status === 'succeeded') return false;
  if (job.status === 'failed' && (flags.skipFailed || (job.attempts || 0) >= MAX_ATTEMPTS)) return false;
  return true;
}

async function submitJob(baseUrl, section, pdfText) {
  const payload = {
    requirement: buildRequirement(section),
    pdfContent: { text: pdfText, images: [] },
    enableTTS: true,
    enableImageGeneration: false,
    enableVideoGeneration: false,
    enableWebSearch: false,
  };
  const { ok, status, body } = await fetchJson(`${baseUrl}/api/generate-classroom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!ok || !body.jobId) {
    throw new Error(`Submit failed (${status}): ${JSON.stringify(body).slice(0, 800)}`);
  }
  return body;
}

async function pollUntilDone(baseUrl, jobRecord) {
  const pollUrl = jobRecord.pollUrl || `${baseUrl}/api/generate-classroom/${jobRecord.jobId}`;
  let lastKey = '';
  for (;;) {
    let result;
    try {
      result = await fetchJson(pollUrl);
    } catch (error) {
      logLine(`poll network error jobId=${jobRecord.jobId}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(POLL_MS);
      continue;
    }

    if (!result.ok) {
      if (result.status === 404) {
        throw new Error(`Job not found: ${jobRecord.jobId}`);
      }
      if (result.status >= 500) {
        logLine(`poll ${result.status} jobId=${jobRecord.jobId}; retrying`);
        await sleep(POLL_MS);
        continue;
      }
      throw new Error(`Poll failed (${result.status}): ${JSON.stringify(result.body).slice(0, 800)}`);
    }

    const body = result.body;
    const key = `${body.status}|${body.step}|${body.progress}|${body.scenesGenerated}|${body.totalScenes}`;
    if (key !== lastKey) {
      logLine(
        `poll ${jobRecord.id} jobId=${body.jobId} status=${body.status} step=${body.step} progress=${body.progress} scenes=${body.scenesGenerated ?? 0}/${body.totalScenes ?? '?'} ${body.message || ''}`,
      );
      lastKey = key;
    }

    jobRecord.status = body.status === 'queued' ? 'queued' : body.status === 'running' ? 'running' : jobRecord.status;
    jobRecord.step = body.step;
    jobRecord.progress = body.progress;
    jobRecord.message = body.message;

    if (body.status === 'succeeded' || (body.done === true && body.status !== 'failed')) {
      return body;
    }
    if (body.status === 'failed') {
      throw new Error(body.error || body.message || 'Classroom generation failed');
    }
    await sleep(POLL_MS);
  }
}

async function reconcileInFlight(flags, toc, manifest, sections) {
  for (const section of sections) {
    const job = manifest.jobs[section.id];
    if (!job?.jobId) continue;
    if (job.status !== 'queued' && job.status !== 'running') continue;

    const pollUrl = job.pollUrl || `${flags.baseUrl}/api/generate-classroom/${job.jobId}`;
    let result;
    try {
      result = await fetchJson(pollUrl);
    } catch (error) {
      logLine(
        `reconcile ${section.id} poll error: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (!result.ok) {
      logLine(`reconcile ${section.id} poll ${result.status}; leaving as ${job.status}`);
      continue;
    }

    const body = result.body;
    if (body.status === 'succeeded' || (body.done === true && body.status !== 'failed')) {
      job.status = 'succeeded';
      job.step = body.step || 'completed';
      job.progress = body.progress ?? 100;
      job.classroomId = body.result?.classroomId || body.classroomId;
      job.url = body.result?.url || body.url;
      job.scenesCount = body.result?.scenesCount ?? body.scenesCount;
      job.error = null;
      job.finishedAt = job.finishedAt || nowIso();
      saveManifest(manifest);
      logLine(
        `reconcile ${section.id} already succeeded classroom=${job.classroomId} scenes=${job.scenesCount} ${job.url || ''}`,
      );
      continue;
    }

    if (body.status === 'failed' || body.done === true) {
      job.status = 'failed';
      job.step = body.step || 'failed';
      job.error = body.error || body.message || 'Classroom generation failed';
      job.finishedAt = job.finishedAt || nowIso();
      saveManifest(manifest);
      logLine(`reconcile ${section.id} already failed ${job.error}`);
      continue;
    }

    logLine(`reconcile ${section.id} still ${body.status} step=${body.step}; waiting for it to finish`);
    job.status = body.status === 'queued' ? 'queued' : 'running';
    job.step = body.step;
    job.progress = body.progress;
    saveManifest(manifest);
    try {
      await processSection(flags, toc, manifest, section);
    } catch (error) {
      logLine(
        `reconcile ${section.id} wait failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function processSection(flags, toc, manifest, section) {
  const existing = manifest.jobs[section.id] || {};
  const jobRecord = {
    id: section.id,
    chapter: section.chapter,
    title: section.title,
    status: existing.status || 'pending',
    jobId: existing.jobId,
    pollUrl: existing.pollUrl,
    classroomId: existing.classroomId,
    url: existing.url,
    scenesCount: existing.scenesCount,
    error: existing.error,
    attempts: existing.attempts || 0,
    step: existing.step,
    progress: existing.progress,
    message: existing.message,
    startedAt: existing.startedAt,
    finishedAt: existing.finishedAt,
  };
  manifest.jobs[section.id] = jobRecord;

  if (flags.dryRun) {
    logLine(`dry-run ${section.id} ${section.title}`);
    return;
  }

  const pdfText = readPdfText(toc.sourceDir, section.chapter);

  const resumable = jobRecord.jobId && (jobRecord.status === 'queued' || jobRecord.status === 'running');
  if (!resumable) {
    jobRecord.attempts = (jobRecord.attempts || 0) + 1;
    jobRecord.error = null;
    jobRecord.startedAt = nowIso();
    jobRecord.finishedAt = null;
    jobRecord.classroomId = null;
    jobRecord.url = null;
    jobRecord.scenesCount = null;

    for (;;) {
      try {
        logLine(`submit ${section.id} ${section.title} attempt=${jobRecord.attempts} pdfChars=${pdfText.length}`);
        const submitted = await submitJob(flags.baseUrl, section, pdfText);
        jobRecord.jobId = submitted.jobId;
        jobRecord.pollUrl = submitted.pollUrl;
        jobRecord.status = submitted.status || 'queued';
        jobRecord.step = submitted.step;
        jobRecord.message = submitted.message;
        saveManifest(manifest);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logLine(`submit error ${section.id}: ${message}`);
        await sleep(SUBMIT_RETRY_MS);
      }
    }
  } else {
    logLine(`resume ${section.id} jobId=${jobRecord.jobId}`);
  }

  try {
    const done = await pollUntilDone(flags.baseUrl, jobRecord);
    jobRecord.status = 'succeeded';
    jobRecord.classroomId = done.result?.classroomId || done.classroomId;
    jobRecord.url = done.result?.url || done.url;
    jobRecord.scenesCount = done.result?.scenesCount ?? done.scenesCount;
    jobRecord.error = null;
    jobRecord.finishedAt = nowIso();
    saveManifest(manifest);
    logLine(`succeeded ${section.id} classroom=${jobRecord.classroomId} scenes=${jobRecord.scenesCount} ${jobRecord.url}`);
  } catch (error) {
    jobRecord.status = 'failed';
    jobRecord.error = error instanceof Error ? error.message : String(error);
    jobRecord.finishedAt = nowIso();
    saveManifest(manifest);
    logLine(`failed ${section.id} jobId=${jobRecord.jobId || '-'} ${jobRecord.error}`);
    throw error;
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const toc = loadToc();
  const manifest = loadManifest(flags.baseUrl, toc.book);
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (flags.only && !toc.sections.some((section) => section.id === flags.only)) {
    throw new Error(`Unknown section: ${flags.only}`);
  }
  if (flags.start && !toc.sections.some((section) => section.id === flags.start)) {
    throw new Error(`Unknown start section: ${flags.start}`);
  }

  printStatus(manifest, toc.sections);
  if (flags.status) return;

  if (!flags.dryRun) {
    await checkHealth(flags.baseUrl);
    await reconcileInFlight(flags, toc, manifest, toc.sections);
  }

  let reachedStart = !flags.start;
  let processed = 0;
  let consecutiveNetworkFails = 0;
  let circuitTrips = 0;
  let index = 0;
  let stoppedEarly = false;

  while (index < toc.sections.length) {
    const section = toc.sections[index];
    if (flags.start && section.id === flags.start) reachedStart = true;
    const job = manifest.jobs[section.id];
    if (!shouldProcess(section, job, flags, reachedStart)) {
      index += 1;
      continue;
    }
    if (flags.limit && processed >= flags.limit) {
      logLine(`limit reached (${flags.limit}); stopping this pass`);
      break;
    }

    try {
      await processSection(flags, toc, manifest, section);
      consecutiveNetworkFails = 0;
      processed += 1;
      index += 1;
      logLine(`pass progress ${processed}${flags.limit ? `/${flags.limit}` : ''} last=${section.id} ok`);
      if (!flags.dryRun) await sleep(BETWEEN_JOBS_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const kind = classifyError(message);
      const attempts = manifest.jobs[section.id]?.attempts || 0;

      if (kind === 'network') {
        consecutiveNetworkFails += 1;
        logLine(`network fail streak=${consecutiveNetworkFails} section=${section.id} attempts=${attempts}`);
        if (consecutiveNetworkFails >= NETWORK_CIRCUIT_AFTER) {
          circuitTrips += 1;
          if (circuitTrips > MAX_NETWORK_CIRCUIT_TRIPS) {
            logLine('circuit: too many network trips; stopping this pass');
            stoppedEarly = true;
            break;
          }
          logLine(
            `circuit open trip=${circuitTrips}/${MAX_NETWORK_CIRCUIT_TRIPS}; sleeping ${NETWORK_CIRCUIT_SLEEP_MS / 60000} min`,
          );
          await sleep(NETWORK_CIRCUIT_SLEEP_MS);
          consecutiveNetworkFails = 0;
        } else if (!flags.dryRun) {
          await sleep(AFTER_FAIL_MS);
        }
        if (attempts < MAX_ATTEMPTS) {
          logLine(`retry same section ${section.id} after network error`);
          continue;
        }
        processed += 1;
        index += 1;
        continue;
      }

      if (kind === 'eperm') {
        logLine(`eperm on ${section.id} attempts=${attempts}; retry after ${EPERM_RETRY_MS}ms`);
        if (!flags.dryRun) await sleep(EPERM_RETRY_MS);
        if (attempts < MAX_ATTEMPTS) continue;
        processed += 1;
        index += 1;
        continue;
      }

      consecutiveNetworkFails = 0;
      processed += 1;
      index += 1;
      logLine(`pass progress ${processed}${flags.limit ? `/${flags.limit}` : ''} last=${section.id} failed`);
      if (!flags.dryRun) await sleep(AFTER_FAIL_MS);
    }
  }

  printStatus(manifest, toc.sections);
  logLine(stoppedEarly ? 'batch pass stopped early' : 'batch pass finished');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
