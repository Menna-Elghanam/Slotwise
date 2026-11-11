import { Queue } from "bullmq";
import { EMAIL_QUEUE, type EmailJob } from "../jobs/emails.js";
import type { EmailMessage } from "../lib/mailer.js";
import { createRedisConnection } from "../lib/redis.js";

/**
 * Reads the emails the API queued. No worker runs in tests, so every queued email stays
 * in the queue where a test can look at it.
 */
export function emailInbox() {
  const connection = createRedisConnection();
  const queue = new Queue<EmailJob>(EMAIL_QUEUE, { connection });

  return {
    queue,
    async clear() {
      await queue.obliterate({ force: true });
    },
    async messagesTo(to: string): Promise<EmailMessage[]> {
      const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
      // getJobs has no fixed order; auto-generated ids increase, so sort oldest first.
      return jobs
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((job) => job.data)
        .filter((data) => data.kind === "send" && data.message.to === to)
        .map((data) => (data.kind === "send" ? data.message : null))
        .filter((message): message is EmailMessage => message !== null);
    },
    /** The token from the link in the newest email to `to`. */
    async tokenSentTo(to: string): Promise<string> {
      const messages = await this.messagesTo(to);
      const token = /token=([\w-]+)/.exec(messages.at(-1)?.text ?? "")?.[1];
      if (!token) {
        throw new Error(`No email with a token was sent to ${to}`);
      }
      return token;
    },
    async close() {
      await queue.close();
      connection.disconnect();
    },
  };
}
