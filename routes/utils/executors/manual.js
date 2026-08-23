const CHECKLIST = [
  'Open the source account on the assigned emulator instance',
  'Confirm the card is still in that account and not already promised',
  'Send or accept the buyer friend request',
  'Start the in-game trade and send the listed card',
  'Confirm the trade completed, then mark the job complete in this app',
];

class ManualExecutor {
  constructor() {
    this.name = 'manual';
    this.capabilities = {
      isAutomated: false,
      requiresLocalAgent: true,
      supportsScreenshots: false,
    };
  }

  async validate(job) {
    const reasons = [];
    if (!job || !job.account_key) reasons.push('missing_account_key');
    if (!job || !job.card_id) reasons.push('missing_card_id');
    return { ok: reasons.length === 0, reasons };
  }

  async execute(job, onProgress) {
    for (let i = 0; i < CHECKLIST.length; i += 1) {
      if (onProgress) {
        await onProgress({
          step: i + 1,
          total: CHECKLIST.length,
          message: CHECKLIST[i],
        });
      }
    }
    return {
      status: 'awaiting_confirmation',
      evidence: [],
      checklist: CHECKLIST,
    };
  }

  async cancel() {
    return { ok: true };
  }
}

ManualExecutor.CHECKLIST = CHECKLIST;
module.exports = ManualExecutor;
