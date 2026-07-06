import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import client from 'ari-client';
import crypto from 'crypto';
import swagger from 'swagger-client';
import { getRealtimeStatus } from './puppeteer-service.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Dynamic basePath rewrite patch for Asterisk ARI Swagger client
const patchSpec = function(self, response) {
  if (response && response.basePath && self.url) {
    try {
      const parsedUrl = new URL(self.url);
      const pathSuffix = new URL(response.basePath).pathname;
      const targetBasePath = `${parsedUrl.protocol}//${parsedUrl.host}${pathSuffix}`;
      console.log(`[Swagger-Patch] Rewriting basePath from "${response.basePath}" to "${targetBasePath}"`);
      response.basePath = targetBasePath;
    } catch (e) {
      console.error('[Swagger-Patch] Failed to patch basePath:', e.message);
    }
  }
};

const originalBuildFrom1_1Spec = swagger.SwaggerApi.prototype.buildFrom1_1Spec;
swagger.SwaggerApi.prototype.buildFrom1_1Spec = function(response) {
  patchSpec(this, response);
  return originalBuildFrom1_1Spec.call(this, response);
};

const originalBuildFromSpec = swagger.SwaggerApi.prototype.buildFromSpec;
swagger.SwaggerApi.prototype.buildFromSpec = function(response) {
  patchSpec(this, response);
  return originalBuildFromSpec.call(this, response);
};

const originalAddApiDeclaration = swagger.SwaggerResource.prototype.addApiDeclaration;
swagger.SwaggerResource.prototype.addApiDeclaration = function(response) {
  if (response && response.basePath && this.api && this.api.basePath) {
    try {
      const parsedApiBasePath = new URL(this.api.basePath);
      const pathSuffix = new URL(response.basePath).pathname;
      const targetBasePath = `${parsedApiBasePath.protocol}//${parsedApiBasePath.host}${pathSuffix}`;
      console.log(`[Swagger-Resource-Patch] Rewriting resource basePath from "${response.basePath}" to "${targetBasePath}"`);
      response.basePath = targetBasePath;
    } catch (e) {
      console.error('[Swagger-Resource-Patch] Failed to patch resource basePath:', e.message);
    }
  }
  return originalAddApiDeclaration.call(this, response);
};

import https from 'https';
import http from 'http';

// SwaggerHttp execute method patch to bypass Shred and use native https/http
swagger.SwaggerHttp.prototype.execute = function(obj) {
  const cb = obj.on;
  const requestUrl = obj.url;
  
  console.log(`[Swagger-Http-Patch] Intercepting request to ${obj.method.toUpperCase()} ${requestUrl}`);
  
  try {
    const parsedUrl = new URL(requestUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const headers = {};
    if (obj.headers) {
      for (const [k, v] of Object.entries(obj.headers)) {
        headers[k.toLowerCase()] = v;
      }
    }
    
    let bodyData = null;
    if (obj.body) {
      bodyData = typeof obj.body === 'string' ? obj.body : JSON.stringify(obj.body);
      headers['content-length'] = Buffer.byteLength(bodyData).toString();
    }
    
    const options = {
      method: obj.method.toUpperCase(),
      headers: headers,
      rejectUnauthorized: false
    };
    
    const req = httpModule.request(requestUrl, options, (res) => {
      let rawData = '';
      
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      
      res.on('end', () => {
        let parsedObj = {};
        try {
          if (rawData) {
            parsedObj = JSON.parse(rawData);
          }
        } catch (e) {}
        
        const responseOut = {
          headers: res.headers,
          url: requestUrl,
          method: obj.method,
          status: res.statusCode,
          data: rawData,
          obj: parsedObj
        };
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (cb.response) cb.response(responseOut);
        } else {
          if (cb.error) cb.error(responseOut);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('[Swagger-Http-Patch] Connection error:', err.message);
      if (cb.error) {
        cb.error({
          status: 0,
          statusText: err.message,
          url: requestUrl,
          method: obj.method
        });
      }
    });
    
    if (bodyData) {
      req.write(bodyData);
    }
    
    req.end();
  } catch (e) {
    console.error('[Swagger-Http-Patch] Setup error:', e.message);
    if (cb.error) cb.error({ status: 0, statusText: e.message, url: requestUrl, method: obj.method });
  }
};

const campaigns = new Map();
const ariConnections = new Map();
const activeChannels = new Map();

const logFile = path.join(process.cwd(), 'dialer.log');
function logDebug(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (e) {}
  console.log(msg);
}

// Default fallback configuration using HTTPS and IP resolving pattern
const ARI_URL = process.env.ARI_URL || 'https://smart.pbxfacil.com.br:2087';
const ARI_USER = process.env.ARI_USER || 'disparoupchat';
const ARI_PASS = process.env.ARI_PASS || 'disparou123';
const APP_NAME = 'dialer_app';

/**
 * Connect to Asterisk ARI
 */
export async function connectARI(ipOrUrl) {
  const targetUrl = ipOrUrl 
    ? (ipOrUrl.startsWith('http') ? ipOrUrl : `https://${ipOrUrl}:2087`)
    : ARI_URL;

  if (ariConnections.has(targetUrl)) {
    return ariConnections.get(targetUrl);
  }

  try {
    console.log(`[Dialer] Connecting to ARI at ${targetUrl} with user ${ARI_USER}...`);
    const conn = await client.connect(targetUrl, ARI_USER, ARI_PASS);
    
    conn.on('StasisStart', async (event, channel) => {
      logDebug(`[StasisStart] Channel ${channel.id} (${channel.name}) entered StasisApp. It was answered!`);
      
      const info = activeChannels.get(channel.id);
      logDebug(`[StasisStart] activeChannels lookup for ${channel.id}: ${JSON.stringify(info)}`);
      
      let linkedCampaignId = info ? info.campaignId : null;
      let linkedPhone = info ? info.phone : null;
      
      if (!info) {
        try {
          logDebug(`[StasisStart] Querying channel variables for ${channel.id}...`);
          const vars = await conn.channels.getChannelVar({ channelId: channel.id, variable: 'CAMPAIGN_ID' });
          linkedCampaignId = vars.value;
          logDebug(`[StasisStart] CAMPAIGN_ID variable retrieved: ${linkedCampaignId}`);
          
          const phoneVar = await conn.channels.getChannelVar({ channelId: channel.id, variable: 'CAMPAIGN_PHONE' });
          linkedPhone = phoneVar.value;
          logDebug(`[StasisStart] CAMPAIGN_PHONE variable retrieved: ${linkedPhone}`);
        } catch (err) {
          logDebug(`[StasisStart] Error getting channel variables: ${err.message}`);
        }
      }

      // Intercept AMD return to Stasis (if channel was classified as machine/voicemail)
      let amdResult = null;
      try {
        const amdVar = await conn.channels.getChannelVar({ channelId: channel.id, variable: 'AMD_STATUS_RESULT' });
        amdResult = amdVar.value;
        logDebug(`[StasisStart] AMD_STATUS_RESULT variable retrieved: ${amdResult}`);
      } catch (err) {}

      if (amdResult && amdResult !== 'HUMAN') {
        logDebug(`[StasisStart] Channel ${channel.id} returned to Stasis after AMD check with status=${amdResult}. Marking as voicemail and hanging up...`);
        if (linkedCampaignId && linkedPhone) {
          updateContactStatus(linkedCampaignId, linkedPhone, 'voicemail');
        }
        try {
          await conn.channels.hangup({ channelId: channel.id });
        } catch (hangupErr) {
          logDebug(`[StasisStart] Error hanging up AMD machine channel ${channel.id}: ${hangupErr.message}`);
        }
        return;
      }
      
      logDebug(`[StasisStart] linkedCampaignId=${linkedCampaignId}, linkedPhone=${linkedPhone}`);
      
      const campaign = campaigns.get(linkedCampaignId);
      if (!campaign) {
        logDebug(`[StasisStart] Campaign ${linkedCampaignId} not found in campaigns Map! Map size: ${campaigns.size}. Keys: ${Array.from(campaigns.keys()).join(', ')}`);
        try {
          logDebug(`[StasisStart] Hanging up channel ${channel.id}...`);
          await conn.channels.hangup({ channelId: channel.id });
        } catch (hangupErr) {
          logDebug(`[StasisStart] Error hanging up channel ${channel.id}: ${hangupErr.message}`);
        }
        return;
      }
      
      const targetDest = campaign.config.targetDestination || '100';
      const targetType = campaign.config.targetType || 'Extensions';
      const enableAmd = campaign.config.enableAmd === true || campaign.config.enableAmd === 'true';
      
      if (linkedCampaignId && linkedPhone) {
        if (enableAmd) {
          logDebug(`[StasisStart] AMD is enabled. Keeping contact status as 'calling' during detection.`);
        } else {
          logDebug(`[StasisStart] AMD is disabled. Updating contact status to answered...`);
          updateContactStatus(linkedCampaignId, linkedPhone, 'answered');
        }
      }

      logDebug(`[StasisStart] Routing channel ${channel.id} to targetType=${targetType}, targetDest=${targetDest}, enableAmd=${enableAmd}`);
      
      let destContext = 'from-internal';
      let destExten = targetDest;
      let destPriority = 1;

      if (targetType === 'Custom_Destinations' && targetDest.includes(',')) {
        const [customContext, customExten, customPriorityStr] = targetDest.split(',');
        destContext = customContext;
        destExten = customExten;
        destPriority = parseInt(customPriorityStr) || 1;
      }

      try {
        if (enableAmd) {
          logDebug(`[StasisStart] AMD is enabled. Setting TARGET_CONTEXT=${destContext}, TARGET_EXTEN=${destExten}, TARGET_PRIORITY=${destPriority} on channel ${channel.id}...`);
          await conn.channels.setChannelVar({ channelId: channel.id, variable: 'TARGET_CONTEXT', value: destContext });
          await conn.channels.setChannelVar({ channelId: channel.id, variable: 'TARGET_EXTEN', value: destExten });
          await conn.channels.setChannelVar({ channelId: channel.id, variable: 'TARGET_PRIORITY', value: destPriority.toString() });
          
          logDebug(`[StasisStart] Routing channel ${channel.id} to AMD detection context: detect-amd,s,1`);
          await conn.channels.continueInDialplan({
            channelId: channel.id,
            context: 'detect-amd',
            extension: 's',
            priority: 1
          });
        } else {
          logDebug(`[StasisStart] continueInDialplan Context=${destContext}, Exten=${destExten}, Priority=${destPriority}`);
          await conn.channels.continueInDialplan({
            channelId: channel.id,
            context: destContext,
            extension: destExten,
            priority: destPriority
          });
          logDebug(`[StasisStart] continueInDialplan call completed successfully for channel ${channel.id}`);
        }
      } catch (e) {
        logDebug(`[StasisStart] continueInDialplan failed: ${e.message}`);
      }
    });

    conn.on('ChannelDestroyed', async (event, channel) => {
      console.log(`[Dialer] Channel ${channel.id} destroyed.`);
      const info = activeChannels.get(channel.id);
      
      let linkedCampaignId = info ? info.campaignId : null;
      let linkedPhone = info ? info.phone : null;
      
      if (info) {
        activeChannels.delete(channel.id);
      } else {
        // Fallback safety net (often fails on destroyed channels but good as fallback)
        try {
          const vars = await conn.channels.getChannelVar({ channelId: channel.id, variable: 'CAMPAIGN_ID' });
          linkedCampaignId = vars.value;
          const phoneVar = await conn.channels.getChannelVar({ channelId: channel.id, variable: 'CAMPAIGN_PHONE' });
          linkedPhone = phoneVar.value;
        } catch (err) {}
      }

      if (linkedCampaignId && linkedPhone) {
        const campaign = campaigns.get(linkedCampaignId);
        if (campaign) {
          const contact = campaign.contacts.find(c => c.phone === linkedPhone);
          if (contact && contact.status === 'calling') {
            updateContactStatus(linkedCampaignId, linkedPhone, 'failed');
          }
        }
      }
    });

    conn.on('UserEvent', (event) => {
      logDebug(`[UserEvent] Received UserEvent: ${JSON.stringify(event)}`);
      if (event.eventname === 'AMDResult') {
        const userEventData = event.userevent || {};
        const campaignId = userEventData.CAMPAIGN_ID;
        const phone = userEventData.CAMPAIGN_PHONE;
        const amdStatus = userEventData.AMDSTATUS;
        logDebug(`[UserEvent] AMDResult details: campaignId=${campaignId}, phone=${phone}, amdStatus=${amdStatus}`);
        
        if (campaignId && phone) {
          if (amdStatus === 'HUMAN') {
            logDebug(`[UserEvent] AMD classified call as HUMAN. Updating status to answered.`);
            updateContactStatus(campaignId, phone, 'answered');
          } else {
            logDebug(`[UserEvent] AMD classified call as machine/voicemail (${amdStatus}). Correcting status to voicemail...`);
            updateContactStatus(campaignId, phone, 'voicemail');
          }
        }
      }
    });

    await conn.start(APP_NAME);
    console.log(`[Dialer] ARI Connected and listening to Stasis app: ${APP_NAME} on ${targetUrl}`);
    ariConnections.set(targetUrl, conn);
    return conn;
  } catch (err) {
    console.error(`[Dialer] Failed to connect to ARI on ${targetUrl}:`, err.message);
    return null;
  }
}

const instanceLoaded = new Set();

export function ensureInstanceCampaignsLoaded(instance) {
  if (!instance) return;
  if (instanceLoaded.has(instance)) return;
  instanceLoaded.add(instance);
  
  const filePath = path.join(process.cwd(), 'data', `campaigns_${instance}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const list = JSON.parse(content);
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      for (const c of list) {
        // Skip campaigns older than 7 days
        const createdAt = c.createdAt ? new Date(c.createdAt).getTime() : now;
        if (now - createdAt > SEVEN_DAYS_MS) {
          continue; 
        }
        
        // Restore campaign in Map
        if (c.status === 'running') {
          c.status = 'paused';
        }
        campaigns.set(c.id, c);
      }
    }
  } catch (err) {
    console.error(`[Dialer] Failed to load campaigns for ${instance}:`, err.message);
  }
}

export function saveInstanceCampaigns(instance) {
  if (!instance) return;
  const dirPath = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const filePath = path.join(dirPath, `campaigns_${instance}.json`);
  
  const list = Array.from(campaigns.values())
    .filter(c => c.config && c.config.instance === instance)
    .map(c => {
      const copy = { ...c };
      delete copy.intervalId;
      return copy;
    });
    
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Dialer] Failed to save campaigns for ${instance}:`, err.message);
  }
}

const saveDebounceTimers = new Map();
export function saveInstanceCampaignsDebounced(instance) {
  if (!instance) return;
  if (saveDebounceTimers.has(instance)) return;
  
  const timer = setTimeout(() => {
    saveDebounceTimers.delete(instance);
    saveInstanceCampaigns(instance);
  }, 5000);
  
  saveDebounceTimers.set(instance, timer);
}

/**
 * Handle CSV upload and create campaign
 */
export async function createCampaign(filePath, config) {
  const contacts = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => {
        let phone = '';
        let name = '';
        
        // Dynamic column lookup supporting portuguese/english headers
        const phoneKey = Object.keys(data).find(k => /phone|tel|celular|numero/i.test(k));
        if (phoneKey) phone = data[phoneKey];
        else phone = data[Object.keys(data)[0]]; // fallback to first column
        
        const nameKey = Object.keys(data).find(k => /name|nome|cliente/i.test(k));
        if (nameKey) name = data[nameKey];

        if (phone) {
          phone = String(phone).replace(/\D/g, ''); // clean formatting
          if (phone) {
            contacts.push({ 
              phone, 
              name: name ? String(name).trim() : '', 
              status: 'pending' 
            });
          }
        }
      })
      .on('end', () => {
        const campaignId = crypto.randomUUID();
        const campaign = {
          id: campaignId,
          status: 'stopped',
          createdAt: new Date().toISOString(),
          config: {
            queueId: config.queueId,
            targetDestination: config.targetDestination,
            targetType: config.targetType || 'Extensions',
            outboundRoute: config.outboundRoute || 'from-internal',
            callsPerAgent: parseInt(config.callsPerAgent) || 1,
            instanceIP: config.instanceIP,
            instance: config.instance,
            cookies: config.cookies,
            enableAmd: config.enableAmd === true || config.enableAmd === 'true'
          },
          contacts,
          stats: {
            total: contacts.length,
            pending: contacts.length,
            calling: 0,
            answered: 0,
            failed: 0,
            voicemail: 0
          },
          intervalId: null
        };
        campaigns.set(campaignId, campaign);
        saveInstanceCampaigns(config.instance);
        resolve(campaign);
      })
      .on('error', reject);
  });
}

/**
 * Calculate active agents for a queue
 */
/**
 * Calculate active agents for a queue
 */
async function getAvailableAgents(campaign, ari) {
  const { queueId, instance, cookies } = campaign.config;
  
  if (!instance || instance.toLowerCase() === 'mock') {
    return 1; // Fallback for mock/testing
  }
  
  try {
    const status = await getRealtimeStatus(instance, cookies);
    if (!status || !status.queues) {
      console.log(`[Dialer] Realtime status empty for instance ${instance}. Returning 0 agents.`);
      return 0;
    }
    
    const queue = status.queues.find(q => q.id.toString() === queueId.toString());
    if (!queue) {
      console.log(`[Dialer] Queue ${queueId} not found in scraped status for ${instance}. Returning 0 agents.`);
      return 0;
    }
    
    // Count free agents who are currently 'Livre' (available to receive calls)
    const freeMembers = queue.members.filter(m => m.status === 'Livre');
    console.log(`[Dialer] Queue ${queueId} has ${queue.members.length} members. Logged-in agents: ${queue.members.filter(m => m.status !== 'Indisponível').map(m => `${m.extension} (${m.status})`).join(', ')}. Free agents: ${freeMembers.map(m => m.extension).join(', ')}`);
    
    return freeMembers.length;
  } catch (err) {
    console.error(`[Dialer] Error checking queue agents for queue ${queueId}:`, err.message);
    
    // Fallback to checking active endpoints online via ARI as safety net
    try {
      console.log('[Dialer] Fallback to ARI endpoint status listing...');
      const endpoints = await ari.endpoints.list();
      let availableCount = 0;
      for (const ep of endpoints) {
        if (ep.technology === 'PJSIP' && ep.state === 'online') {
          try {
            const deviceState = await ari.deviceStates.get({ deviceName: `PJSIP/${ep.resource}` });
            if (deviceState.state === 'NOT_INUSE') {
              availableCount++;
            }
          } catch (e) {
            availableCount++;
          }
        }
      }
      return availableCount;
    } catch (ariErr) {
      console.error('[Dialer] Fallback ARI status check failed:', ariErr.message);
      return 0;
    }
  }
}

/**
 * Update contact status and recalculate stats
 */
function updateContactStatus(campaignId, phone, newStatus) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) return;
  
  const contact = campaign.contacts.find(c => c.phone === phone);
  if (!contact) return;
  
  const oldStatus = contact.status;
  contact.status = newStatus;
  
  campaign.stats[oldStatus] = Math.max(0, campaign.stats[oldStatus] - 1);
  campaign.stats[newStatus]++;
  
  if (campaign.stats.pending === 0 && campaign.stats.calling === 0) {
    campaign.status = 'completed';
    if (campaign.intervalId) {
      clearInterval(campaign.intervalId);
      campaign.intervalId = null;
    }
  }
  saveInstanceCampaignsDebounced(campaign.config.instance);
}

/**
 * Dialer loop
 */
async function dialerLoop(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign || campaign.status !== 'running') return;
  
  const ari = await connectARI(campaign.config.instanceIP);
  if (!ari) {
    console.log('[Dialer] ARI not connected. Cannot dial.');
    return;
  }

  const availableAgents = await getAvailableAgents(campaign, ari);
  if (availableAgents === 0) {
    console.log(`[Dialer] Campaign ${campaignId}: No agents logged in. Skipping dial cycle.`);
    return;
  }

  const maxConcurrent = availableAgents * campaign.config.callsPerAgent;
  const activeCount = campaign.contacts.filter(c => c.status === 'calling').length;
  const availableSlots = maxConcurrent - activeCount;
  
  if (availableSlots > 0 && campaign.stats.pending > 0) {
    const toCall = campaign.contacts.filter(c => c.status === 'pending').slice(0, availableSlots);
    
    for (const contact of toCall) {
      updateContactStatus(campaignId, contact.phone, 'calling');
      
      // Execute dialing attempt asynchronously so we don't block the dialer loop
      (async (contact) => {
        try {
          const callerName = contact.name ? `Disp ${contact.name}`.substring(0, 40) : 'Disparador';
          console.log(`[Dialer] Originating call to ${contact.phone} (Name: ${contact.name || 'none'}) via ${campaign.config.outboundRoute}`);
          
          const channel = await ari.channels.originate({
            endpoint: `Local/${contact.phone}@${campaign.config.outboundRoute}`,
            app: APP_NAME,
            callerId: `${callerName} <${contact.phone}>`,
            variables: {
              __CAMPAIGN_ID: campaignId,
              __CAMPAIGN_PHONE: contact.phone
            },
            async: true // originate asynchronously to get channel ID immediately
          });
          
          activeChannels.set(channel.id, { campaignId, phone: contact.phone });
          console.log(`[Dialer] Call to ${contact.phone} originated asynchronously (Channel ID: ${channel.id}).`);
        } catch (err) {
          console.error(`[Dialer] Originate failed or rejected for ${contact.phone}:`, err.message);
          updateContactStatus(campaignId, contact.phone, 'failed');
        }
      })(contact);
    }
  }
}

export function startCampaign(campaignId, cookies) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'running') return;
  
  // Prevent running multiple campaigns simultaneously for the same instance
  const activeCampaign = Array.from(campaigns.values()).find(
    c => c.config && c.config.instance === campaign.config.instance && c.status === 'running'
  );
  if (activeCampaign) {
    throw new Error('Já existe outra campanha em execução. Pause-a antes de iniciar esta.');
  }
  
  if (cookies) {
    campaign.config.cookies = cookies;
  }
  
  campaign.status = 'running';
  console.log(`[Dialer] Starting campaign ${campaignId}`);
  
  saveInstanceCampaignsDebounced(campaign.config.instance);
  campaign.intervalId = setInterval(() => dialerLoop(campaignId), 5000);
  dialerLoop(campaignId); // initial run
  
  return campaign;
}

/**
 * Pause Campaign
 */
export function pauseCampaign(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  
  campaign.status = 'paused';
  if (campaign.intervalId) {
    clearInterval(campaign.intervalId);
    campaign.intervalId = null;
  }
  console.log(`[Dialer] Paused campaign ${campaignId}`);
  saveInstanceCampaignsDebounced(campaign.config.instance);
  return campaign;
}

/**
 * Get Campaign Status
 */
export function getCampaignStatus(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  return {
    id: campaign.id,
    status: campaign.status,
    config: campaign.config,
    stats: campaign.stats,
    contacts: campaign.contacts
  };
}

/**
 * Get All Campaigns
 */
export function getAllCampaigns(instance) {
  return Array.from(campaigns.values())
    .filter(c => c.config && c.config.instance === instance)
    .map(c => ({
      id: c.id,
      status: c.status,
      stats: c.stats,
      config: c.config,
      createdAt: c.createdAt
    }));
}

export function deleteCampaign(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  
  if (campaign.intervalId) {
    clearInterval(campaign.intervalId);
    campaign.intervalId = null;
  }
  
  // Hang up all active calls of this campaign in Asterisk
  for (const [channelId, info] of activeChannels.entries()) {
    if (info.campaignId === campaignId) {
      console.log(`[Dialer] Hanging up active channel ${channelId} for deleted campaign ${campaignId}`);
      const targetUrl = campaign.config.instanceIP 
        ? (campaign.config.instanceIP.startsWith('http') ? campaign.config.instanceIP : `https://${campaign.config.instanceIP}:2087`)
        : ARI_URL;
      const conn = ariConnections.get(targetUrl);
      if (conn) {
        conn.channels.hangup({ channelId }).catch(err => {
          console.error(`[Dialer] Failed to hangup channel ${channelId}:`, err.message);
        });
      }
    }
  }
  
  const instance = campaign.config.instance;
  campaigns.delete(campaignId);
  saveInstanceCampaigns(instance);
  return { success: true };
}

/**
 * Dynamic ERP CRM Integration - Add contacts to campaign
 */
export function addContactsToCampaign(campaignId, contactsInput) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  
  for (const c of contactsInput) {
    let phone = c.phone || c.telefone;
    let name = c.name || c.nome || '';
    
    if (phone) {
      phone = String(phone).replace(/\D/g, '');
      if (phone) {
        const exists = campaign.contacts.some(item => item.phone === phone && item.status === 'pending');
        if (!exists) {
          campaign.contacts.push({
            phone,
            name: String(name).trim(),
            status: 'pending'
          });
          campaign.stats.total++;
          campaign.stats.pending++;
        }
      }
    }
  }
  
  saveInstanceCampaignsDebounced(campaign.config.instance);
  return campaign;
}

/**
 * Startup Campaign Loader - Restores all campaigns from last 7 days
 */
export function loadAllCampaignsFromDisk() {
  const dirPath = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dirPath)) return;
  
  try {
    const files = fs.readdirSync(dirPath);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      if (file.startsWith('campaigns_') && file.endsWith('.json')) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const list = JSON.parse(content);
        
        let fileChanged = false;
        const validCampaigns = [];
        
        for (const c of list) {
          const createdAt = c.createdAt ? new Date(c.createdAt).getTime() : now;
          if (now - createdAt > SEVEN_DAYS_MS) {
            fileChanged = true;
            continue; // prunes old campaigns
          }
          
          if (c.status === 'running') {
            c.status = 'paused';
          }
          campaigns.set(c.id, c);
          validCampaigns.push(c);
        }
        
        if (fileChanged) {
          fs.writeFileSync(filePath, JSON.stringify(validCampaigns, null, 2), 'utf8');
        }
      }
    }
    console.log(`[Dialer] Loaded ${campaigns.size} campaigns from disk on startup.`);
  } catch (err) {
    console.error('[Dialer] Failed to load campaigns from disk on startup:', err.message);
  }
}

// Execute startup loader
loadAllCampaignsFromDisk();
