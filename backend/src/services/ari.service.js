import client from 'ari-client';
import dotenv from 'dotenv';

dotenv.config();

const ARI_URL = process.env.ARI_URL || 'http://localhost:8088';
const ARI_USER = process.env.ARI_USER || 'asterisk';
const ARI_PASSWORD = process.env.ARI_PASSWORD || 'asterisk';

let ariInstance = null;

/**
 * Initializes the ARI connection and sets up global event listeners.
 */
export const initARI = async () => {
  try {
    console.log(`[ARI] Attempting to connect to Asterisk at ${ARI_URL}...`);
    ariInstance = await client.connect(ARI_URL, ARI_USER, ARI_PASSWORD);
    
    console.log('[ARI] Successfully connected to Asterisk REST Interface.');
    
    // Setup Stasis start event
    ariInstance.on('StasisStart', (event, channel) => {
      console.log(`[ARI] StasisStart event on channel ${channel.name}`);
      // TODO: Handle incoming calls here
    });

    ariInstance.on('StasisEnd', (event, channel) => {
      console.log(`[ARI] StasisEnd event on channel ${channel.name}`);
      // TODO: Clean up resources
    });

    // Start listening to the Stasis application (name should match your dialplan config)
    const appName = 'pbx-cloud';
    ariInstance.start(appName);
    console.log(`[ARI] Stasis app '${appName}' started.`);
    
    return ariInstance;
  } catch (error) {
    console.error('[ARI] Failed to connect to Asterisk:', error.message);
    // Depending on architecture, you might want to retry connection here
    return null;
  }
};

/**
 * Returns the active ARI instance.
 */
export const getARI = () => {
  if (!ariInstance) {
    console.warn('[ARI] Warning: ARI instance not initialized yet.');
  }
  return ariInstance;
};
