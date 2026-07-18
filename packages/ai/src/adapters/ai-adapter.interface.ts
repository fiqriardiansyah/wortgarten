import type { AiJob, AiRawResult } from '@wortgarten/shared';

/** One shape in, one shape out — neither adapter validates its own output (that's the checker's
 * job, in packages/shared) nor chooses vocabulary or interprets the job beyond prompting. */
export interface AiAdapter {
  generate(job: AiJob): Promise<AiRawResult>;
}
