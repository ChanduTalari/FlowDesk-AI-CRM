const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class EmailQueue {
  constructor(sendEmail, { concurrency = 2, retries = 3 } = {}) {
    this.sendEmail = sendEmail;
    this.concurrency = concurrency;
    this.retries = retries;
    this.pending = [];
    this.running = 0;
    this.accepting = true;
    this.closePromise = null;
    this.closeResolver = null;
  }

  enqueue(lead) {
    if (!this.accepting) {
      throw new Error("Email queue is shutting down");
    }

    this.pending.push(lead);
    this.schedule();
  }

  schedule() {
    if (this.running >= this.concurrency || this.pending.length === 0) {
      this.resolveCloseIfIdle();
      return;
    }

    setImmediate(() => {
      while (this.pending.length > 0 && this.running < this.concurrency) {
        const lead = this.pending.shift();
        this.running += 1;
        void this.runWithRetries(lead).finally(() => {
          this.running -= 1;
          this.schedule();
        });
      }

      this.resolveCloseIfIdle();
    });
  }

  async runWithRetries(lead) {
    for (let attempt = 1; attempt <= this.retries + 1; attempt += 1) {
      try {
        await this.sendEmail(lead);
        return;
      } catch (error) {
        if (attempt === this.retries + 1) {
          console.error(
            `Email job for lead ${lead.id} failed after ${this.retries + 1} attempts`,
            error,
          );
          return;
        }

        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        console.warn(
          `Email job for lead ${lead.id} failed; retry ${attempt}/${this.retries} in ${delay}ms`,
          error,
        );
        await wait(delay);
      }
    }
  }

  resolveCloseIfIdle() {
    if (this.closeResolver && this.pending.length === 0 && this.running === 0) {
      this.closeResolver();
      this.closeResolver = null;
      this.closePromise = null;
    }
  }

  close() {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.accepting = false;
    this.schedule();

    if (this.pending.length === 0 && this.running === 0) {
      return Promise.resolve();
    }

    this.closePromise = new Promise((resolve) => {
      this.closeResolver = resolve;
    });

    return this.closePromise;
  }
}
