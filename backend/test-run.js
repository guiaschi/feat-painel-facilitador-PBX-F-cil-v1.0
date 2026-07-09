import { createCampaign, startCampaign } from './dialer-service.js';
import path from 'path';

const ARI_HOST = process.env.ARI_HOST || 'SEU_HOST_ARI';

async function test() {
  console.log('[TEST] Initializing local test campaign...');
  const csvPath = path.resolve('../test_phones.csv');

  const config = {
    queueId: '9000',
    targetDestination: '100',
    outboundRoute: 'from-internal',
    callsPerAgent: '1',
    instanceIP: ARI_HOST
  };

  try {
    const campaign = await createCampaign(csvPath, config);
    console.log('[TEST] Campaign created successfully:', campaign.id);

    console.log('[TEST] Starting campaign...');
    startCampaign(campaign.id);

    setTimeout(() => {
      console.log('[TEST] Test finished. Exiting...');
      process.exit(0);
    }, 20000);
  } catch (err) {
    console.error('[TEST] Error during test:', err);
    process.exit(1);
  }
}

test();
