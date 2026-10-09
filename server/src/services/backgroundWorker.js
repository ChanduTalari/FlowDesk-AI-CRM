import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import {
  backfillLeadScores,
  claimJobs,
  finishJob,
  processJob,
} from "./aiJobService.js";

export class BackgroundWorker {
  constructor() {
    this.id = `${process.pid}:${randomUUID()}`;
    this.timer = null;
    this.running = false;
    this.stopping = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    try {
      await backfillLeadScores();
    } catch (error) {
      console.error("Unable to backfill lead scores:", error);
    }
    this.schedule(0);
  }

  schedule(delay = env.worker.pollIntervalMs) {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref?.();
  }

  async tick() {
    if (this.stopping || !this.running) return;
    try {
      const jobs = await claimJobs(
        this.id,
        env.worker.concurrency,
        env.worker.leaseSeconds,
      );
      for (const job of jobs) {
        try {
          await processJob(job);
          await finishJob(job);
        } catch (error) {
          console.error(`Background job ${job.id} failed:`, error);
          await finishJob(job, error);
        }
      }
    } catch (error) {
      console.error("Background worker poll failed:", error);
    } finally {
      if (this.running && !this.stopping) this.schedule();
    }
  }

  async close() {
    this.stopping = true;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }
}
