import { createCampaign, startCampaign } from './dialer-service.js';
import path from 'path';

async function test() {
  console.log('[TEST] Initializing local test campaign...');
  const csvPath = path.resolve('../test_phones.csv');
  
  // Create a campaign with the correct IP override (upgrade instance IP)
  const config = {
    queueId: '9000', // or whatever queue is on the system, for tests it will fallback to 1 agent
    targetDestination: '100',
    outboundRoute: 'from-internal',
    callsPerAgent: '1',
    instanceIP: '137.131.139.175' // Correct public IP of upgrade server
  };

  try {
    const campaign = await createCampaign(csvPath, config);
    console.log('[TEST] Campaign created successfully:', campaign.id);
    
    console.log('[TEST] Starting campaign...');
    startCampaign(campaign.id);
    
    // Let the loop run for 20 seconds to see the ARI logs
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
