import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const debugLogPath = path.join(process.cwd(), 'debug.log');
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  try {
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] [LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`, 'utf8');
  } catch (e) {}
  originalLog.apply(console, args);
};

console.error = function(...args) {
  try {
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`, 'utf8');
  } catch (e) {}
  originalError.apply(console, args);
};

// Global error handlers to prevent unhandled ARI/swagger client exceptions from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

import { loginToPBX, getExtensions, createExtension, editExtension, deleteExtension, inspectExtension, getQueues, updateExtensionQueues, inspectExtensionQueues, syncAllExtensionsMetadata, createQueue, editQueue, deleteQueue, inspectQueueDetail, getRealtimeStatus, getPBXExternalIP, getInboundRoutes, createInboundRoute, editInboundRoute, deleteInboundRoute, setupARIUser, setupAMDDialplan, getCustomDestinations, createCustomDestination, editCustomDestination, deleteCustomDestination, inspectCustomDestination, dumpCustomDestsHTML, restoreOriginalDialplan, getTrunks, deleteTrunk, inspectTrunk, createTrunk, editTrunk } from './puppeteer-service.js';
import { getExtensionMetadata, updateExtensionMetadata } from './metadata-service.js';
import multer from 'multer';
import { createCampaign, startCampaign, pauseCampaign, getCampaignStatus, getAllCampaigns, addContactsToCampaign, deleteCampaign } from './dialer-service.js';

const upload = multer({ dest: 'uploads/' });

// Force nodemon restart to reload updated environment variables from .env
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'upchat_pbx_secret_key_12345';

// Mock DB in-memory for testing when instance === 'mock'
let mockExtensions = [
  { extension: '1000', id: '1000', name: 'Suporte Técnico', tech: 'PJSIP (Softphone)' },
  { extension: '1001', id: '1001', name: 'Atendimento Comercial', tech: 'PJSIP (Webphone)' },
  { extension: '1002', id: '1002', name: 'Diretoria', tech: 'PJSIP (Softphone)' }
];

let mockQueues = [
  { id: '100', name: 'Suporte N1 (Mock)', agents: ['1000', '1001'] },
  { id: '101', name: 'Comercial (Mock)', agents: ['1001'] },
  { id: '102', name: 'Financeiro (Mock)', agents: [] }
];

let mockDids = [
  { id: '1130030033', did: '1130030033', description: 'Entrada Principal', destination: 'Extensions: 1000' },
  { id: '1130030034', did: '1130030034', description: 'Suporte N1', destination: 'Queues: 100' }
];

let mockTrunks = [
  { id: 'OUT_1', name: 'Trunk_Vivo_SIP', tech: 'pjsip', callerid: '558539246886', disabled: false },
  { id: 'OUT_2', name: 'Trunk_Claro_PJSIP', tech: 'pjsip', callerid: '', disabled: false },
  { id: 'OUT_3', name: 'Trunk_Failover_Mock', tech: 'sip', callerid: '558539246882', disabled: true }
];

app.use(cors({
  origin: '*', // In production, narrow this to the frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Auth middleware to restore state from JWT token
const requireAuth = (req, res, next) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.instance = decoded.instance;
    req.user = decoded.user;
    req.cookies = decoded.cookies;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Por favor, faça login novamente.' });
  }
};

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { instance, username, password } = req.body;

  if (!instance || !username || !password) {
    return res.status(400).json({ error: 'Instância, Usuário e Senha são obrigatórios.' });
  }

  try {
    console.log(`[API] Login request for instance: ${instance}, user: ${username}`);
    const loginResult = await loginToPBX(instance, username, password);

    // Create stateless JWT session carrying the session cookies
    const token = jwt.sign({
      instance,
      user: username,
      cookies: loginResult.cookies
    }, JWT_SECRET, { expiresIn: '8h' });

    // Trigger background extensions sync
    if (instance.toLowerCase() !== 'mock') {
      syncAllExtensionsMetadata(instance, loginResult.cookies).catch(e => {
        console.error('[Background Sync] Failed during login trigger:', e.message);
      });
    }

    return res.json({
      success: true,
      token,
      user: username,
      instance
    });
  } catch (error) {
    console.error('[API] Login error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// GET /api/extensions
app.get('/api/extensions', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Listing extensions for instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const extensionsWithMeta = mockExtensions.map(ext => {
        const meta = getExtensionMetadata(ext.extension);
        return {
          ...ext,
          type: meta.type,
          queues: meta.queues
        };
      });
      return res.json({ success: true, extensions: extensionsWithMeta });
    }

    const extensions = await getExtensions(req.instance, req.cookies);
    
    // Enrich extension list with metadata (type & queues)
    const enriched = extensions.map(ext => {
      const meta = getExtensionMetadata(ext.extension);
      return {
        ...ext,
        type: meta.type,
        queues: meta.queues
      };
    });

    return res.json({ success: true, extensions: enriched });
  } catch (error) {
    console.error('[API] Get extensions error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /api/extensions/create
app.post('/api/extensions/create', requireAuth, async (req, res) => {
  const { extension, name, secret, type, queues } = req.body;
  const targetQueues = queues || [];

  if (!extension || !name || !secret || !type) {
    return res.status(400).json({ error: 'Número do ramal, nome, senha e tipo são obrigatórios.' });
  }

  try {
    console.log(`[API] Creating extension ${extension} on instance: ${req.instance} (${type})`);
    
    if (req.instance.toLowerCase() === 'mock') {
      // Check if already exists
      if (mockExtensions.some(e => e.extension === extension.toString())) {
        return res.status(400).json({ error: `O ramal ${extension} já existe.` });
      }

      const newExt = {
        extension: extension.toString(),
        id: extension.toString(),
        name,
        tech: `PJSIP`
      };
      mockExtensions.push(newExt);
      updateExtensionMetadata(extension.toString(), type, targetQueues);
      return res.json({ success: true, message: 'Ramal criado com sucesso (Mock).' });
    }

    const result = await createExtension(req.instance, req.cookies, { extension, name, secret, type });
    
    // Update queue agent memberships in FreePBX
    console.log(`[API] Updating queue memberships for extension ${extension}...`);
    await updateExtensionQueues(req.instance, req.cookies, extension.toString(), targetQueues);
    
    // Save metadata locally
    updateExtensionMetadata(extension.toString(), type, targetQueues);

    return res.json({ success: true, message: 'Ramal criado com sucesso.', result });
  } catch (error) {
    console.error('[API] Create extension error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /api/extensions/delete
app.post('/api/extensions/delete', requireAuth, async (req, res) => {
  const { extensionId } = req.body;

  if (!extensionId) {
    return res.status(400).json({ error: 'ID do ramal é obrigatório para exclusão.' });
  }

  try {
    console.log(`[API] Deleting extension ${extensionId} on instance: ${req.instance}`);

    if (req.instance.toLowerCase() === 'mock') {
      const initialLength = mockExtensions.length;
      mockExtensions = mockExtensions.filter(e => e.id !== extensionId.toString());
      if (mockExtensions.length === initialLength) {
        return res.status(404).json({ error: 'Ramal não encontrado.' });
      }
      return res.json({ success: true, message: 'Ramal excluído com sucesso (Mock).' });
    }

    const result = await deleteExtension(req.instance, req.cookies, extensionId);
    return res.json({ success: true, message: 'Ramal excluído com sucesso.', result });
  } catch (error) {
    console.error('[API] Delete extension error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'PBX Fácil API is running.' });
});

// GET /api/queues
app.get('/api/queues', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Fetching queues list for instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      return res.json({
        success: true,
        queues: mockQueues.map(q => ({ id: q.id, name: q.name }))
      });
    }

    const queues = await getQueues(req.instance, req.cookies);
    return res.json({ success: true, queues });
  } catch (error) {
    console.error('[API] Get queues error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/queues/detail/:id
app.get('/api/queues/detail/:id', requireAuth, async (req, res) => {
  const queueId = req.params.id;
  try {
    console.log(`[API] Fetching details for queue ${queueId} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const queue = mockQueues.find(q => q.id === queueId.toString());
      if (!queue) {
        return res.status(404).json({ error: 'Fila não encontrada.' });
      }
      return res.json({ success: true, queue });
    }

    const queueDetails = await inspectQueueDetail(req.instance, req.cookies, queueId);
    return res.json({ success: true, queue: queueDetails });
  } catch (error) {
    console.error(`[API] Get queue detail error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/queues/create
app.post('/api/queues/create', requireAuth, async (req, res) => {
  const { id, name, agents, staticAgents, dynamicAgents, strategy, timeout, maxwait } = req.body;
  const targetStatic = staticAgents || agents || [];
  const targetDynamic = dynamicAgents || [];

  if (!id || !name) {
    return res.status(400).json({ error: 'Número e nome da fila são obrigatórios.' });
  }

  try {
    console.log(`[API] Creating queue ${id} on instance: ${req.instance}`);

    if (req.instance.toLowerCase() === 'mock') {
      if (mockQueues.some(q => q.id === id.toString())) {
        return res.status(400).json({ error: `A fila ${id} já existe.` });
      }
      const newQueue = { 
        id: id.toString(), 
        name, 
        agents: [...targetStatic, ...targetDynamic],
        staticAgents: targetStatic,
        dynamicAgents: targetDynamic,
        strategy: strategy || 'ringall',
        timeout: timeout || '0',
        maxwait: maxwait || ''
      };
      mockQueues.push(newQueue);
      return res.json({ success: true, message: 'Fila criada com sucesso (Mock).' });
    }

    await createQueue(req.instance, req.cookies, { 
      id, 
      name, 
      staticAgents: targetStatic, 
      dynamicAgents: targetDynamic, 
      strategy, 
      timeout, 
      maxwait 
    });
    return res.json({ success: true, message: 'Fila criada com sucesso.' });
  } catch (error) {
    console.error('[API] Create queue error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/queues/edit
app.post('/api/queues/edit', requireAuth, async (req, res) => {
  const { id, name, agents, staticAgents, dynamicAgents, strategy, timeout, maxwait } = req.body;
  const targetStatic = staticAgents || agents || [];
  const targetDynamic = dynamicAgents || [];

  if (!id || !name) {
    return res.status(400).json({ error: 'Número e nome da fila são obrigatórios para edição.' });
  }

  try {
    console.log(`[API] Editing queue ${id} on instance: ${req.instance}`);

    if (req.instance.toLowerCase() === 'mock') {
      const queue = mockQueues.find(q => q.id === id.toString());
      if (!queue) {
        return res.status(404).json({ error: 'Fila não encontrada.' });
      }
      queue.name = name;
      queue.agents = [...targetStatic, ...targetDynamic];
      queue.staticAgents = targetStatic;
      queue.dynamicAgents = targetDynamic;
      queue.strategy = strategy || 'ringall';
      queue.timeout = timeout || '0';
      queue.maxwait = maxwait || '';
      return res.json({ success: true, message: 'Fila editada com sucesso (Mock).' });
    }

    await editQueue(req.instance, req.cookies, { 
      id, 
      name, 
      staticAgents: targetStatic, 
      dynamicAgents: targetDynamic, 
      strategy, 
      timeout, 
      maxwait 
    });
    return res.json({ success: true, message: 'Fila editada com sucesso.' });
  } catch (error) {
    console.error('[API] Edit queue error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/queues/delete
app.post('/api/queues/delete', requireAuth, async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID da fila é obrigatório para exclusão.' });
  }

  try {
    console.log(`[API] Deleting queue ${id} on instance: ${req.instance}`);

    if (req.instance.toLowerCase() === 'mock') {
      const initialLength = mockQueues.length;
      mockQueues = mockQueues.filter(q => q.id !== id.toString());
      if (mockQueues.length === initialLength) {
        return res.status(404).json({ error: 'Fila não encontrada.' });
      }
      return res.json({ success: true, message: 'Fila excluída com sucesso (Mock).' });
    }

    await deleteQueue(req.instance, req.cookies, id);
    return res.json({ success: true, message: 'Fila excluída com sucesso.' });
  } catch (error) {
    console.error('[API] Delete queue error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});
// GET /api/custom-destinations
app.get('/api/custom-destinations', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Listing custom destinations for instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      return res.json({ success: true, customDestinations: [
        { id: 'customdests,custom-upchat,1', description: 'Enviar para Upchat', name: 'Enviar para Upchat (customdests,custom-upchat,1)' }
      ] });
    }
    const customDestinations = await getCustomDestinations(req.instance, req.cookies);
    return res.json({ success: true, customDestinations });
  } catch (error) {
    console.error('[API] Get custom destinations error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/debug-customdests-html
app.get('/api/debug-customdests-html', requireAuth, async (req, res) => {
  try {
    const success = await dumpCustomDestsHTML(req.instance, req.cookies);
    if (success) {
      return res.send("HTML dumped successfully to customdests_debug.html");
    } else {
      return res.status(500).send("Failed to dump HTML");
    }
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// GET /api/custom-destinations/detail/:id
app.get('/api/custom-destinations/detail/:id', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Inspecting custom destination: ${req.params.id} on instance: ${req.instance}`);
    const data = await inspectCustomDestination(req.instance, req.cookies, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[API] Inspect custom destination error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/custom-destinations
app.post('/api/custom-destinations', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Creating custom destination on instance: ${req.instance}`);
    const result = await createCustomDestination(req.instance, req.cookies, req.body);
    return res.json(result);
  } catch (error) {
    console.error('[API] Create custom destination error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/custom-destinations/:id
app.put('/api/custom-destinations/:id', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Editing custom destination: ${req.params.id} on instance: ${req.instance}`);
    const result = await editCustomDestination(req.instance, req.cookies, req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    console.error('[API] Edit custom destination error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/custom-destinations/:id
app.delete('/api/custom-destinations/:id', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Deleting custom destination: ${req.params.id} on instance: ${req.instance}`);
    const result = await deleteCustomDestination(req.instance, req.cookies, req.params.id);
    return res.json(result);
  } catch (error) {
    console.error('[API] Delete custom destination error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


// GET /api/trunks
app.get('/api/trunks', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Listing trunks for instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      return res.json({ success: true, trunks: mockTrunks });
    }
    const trunks = await getTrunks(req.instance, req.cookies);
    return res.json({ success: true, trunks });
  } catch (error) {
    console.error('[API] Get trunks error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/trunks/delete
app.post('/api/trunks/delete', requireAuth, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ID do tronco é obrigatório.' });

  try {
    console.log(`[API] Deleting trunk ${id} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      mockTrunks = mockTrunks.filter(t => t.id !== id);
      return res.json({ success: true, message: 'Tronco excluído com sucesso (Mock).' });
    }
    const result = await deleteTrunk(req.instance, req.cookies, id);
    return res.json(result);
  } catch (error) {
    console.error('[API] Delete trunk error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/trunks/detail/:id
app.get('/api/trunks/detail/:id', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Inspecting trunk ${req.params.id} on instance: ${req.instance}`);
    const details = await inspectTrunk(req.instance, req.cookies, req.params.id);
    return res.json({ success: true, trunk: details });
  } catch (error) {
    console.error('[API] Inspect trunk error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/trunks/create
app.post('/api/trunks/create', requireAuth, async (req, res) => {
  const { name, tech, callerid, username, secret, sip_server, sip_server_port } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do tronco é obrigatório.' });

  try {
    console.log(`[API] Creating trunk ${name} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const newTrunk = {
        id: `OUT_${mockTrunks.length + 1}`,
        name,
        tech: tech || 'pjsip',
        callerid: callerid || '',
        disabled: false
      };
      mockTrunks.push(newTrunk);
      return res.json({ success: true, message: 'Tronco criado com sucesso (Mock).' });
    }
    const result = await createTrunk(req.instance, req.cookies, req.body);
    return res.json(result);
  } catch (error) {
    console.error('[API] Create trunk error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/trunks/edit
app.post('/api/trunks/edit', requireAuth, async (req, res) => {
  const { id, name, callerid, username, secret, sip_server, sip_server_port } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'ID e Nome do tronco são obrigatórios.' });

  try {
    console.log(`[API] Editing trunk ${id} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const idx = mockTrunks.findIndex(t => t.id === id);
      if (idx !== -1) {
        mockTrunks[idx] = {
          ...mockTrunks[idx],
          name,
          callerid: callerid || ''
        };
      }
      return res.json({ success: true, message: 'Tronco editado com sucesso (Mock).' });
    }
    const result = await editTrunk(req.instance, req.cookies, id, req.body);
    return res.json(result);
  } catch (error) {
    console.error('[API] Edit trunk error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


// GET /api/dids
app.get('/api/dids', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Listing inbound routes (DIDs) for instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      return res.json({ success: true, dids: mockDids });
    }
    const dids = await getInboundRoutes(req.instance, req.cookies);
    return res.json({ success: true, dids });
  } catch (error) {
    console.error('[API] Get inbound routes error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/dids/create
app.post('/api/dids/create', requireAuth, async (req, res) => {
  const { did, description, destType, destValue } = req.body;
  if (!did || !description || !destType || !destValue) {
    return res.status(400).json({ error: 'Número do DID, descrição, tipo de destino e valor são obrigatórios.' });
  }

  try {
    console.log(`[API] Creating inbound route ${did} -> ${destType}: ${destValue} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      mockDids.push({
        id: did,
        did,
        description,
        destination: `${destType}: ${destValue}`
      });
      return res.json({ success: true, message: 'Rota de entrada criada com sucesso (Mock).' });
    }

    await createInboundRoute(req.instance, req.cookies, { did, description, destType, destValue });
    return res.json({ success: true, message: 'Rota de entrada criada com sucesso.' });
  } catch (error) {
    console.error('[API] Create inbound route error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/dids/edit/:id
app.post('/api/dids/edit/:id', requireAuth, async (req, res) => {
  const routeId = req.params.id;
  const { description, destType, destValue } = req.body;

  if (!description || !destType || !destValue) {
    return res.status(400).json({ error: 'Descrição, tipo de destino e valor são obrigatórios.' });
  }

  try {
    console.log(`[API] Editing inbound route ${routeId} -> ${destType}: ${destValue} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const idx = mockDids.findIndex(d => d.id === routeId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Rota de entrada não encontrada.' });
      }
      mockDids[idx] = {
        ...mockDids[idx],
        description,
        destination: `${destType}: ${destValue}`
      };
      return res.json({ success: true, message: 'Rota de entrada editada com sucesso (Mock).' });
    }

    await editInboundRoute(req.instance, req.cookies, routeId, { description, destType, destValue });
    return res.json({ success: true, message: 'Rota de entrada editada com sucesso.' });
  } catch (error) {
    console.error('[API] Edit inbound route error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/dids/delete/:id
app.delete('/api/dids/delete/:id', requireAuth, async (req, res) => {
  const routeId = req.params.id;
  try {
    console.log(`[API] Deleting inbound route ${routeId} on instance: ${req.instance}`);
    if (req.instance.toLowerCase() === 'mock') {
      const initialLength = mockDids.length;
      mockDids = mockDids.filter(d => d.id !== routeId);
      if (mockDids.length === initialLength) {
        return res.status(404).json({ error: 'Rota de entrada não encontrada.' });
      }
      return res.json({ success: true, message: 'Rota de entrada excluída com sucesso (Mock).' });
    }

    await deleteInboundRoute(req.instance, req.cookies, routeId);
    return res.json({ success: true, message: 'Rota de entrada excluída com sucesso.' });
  } catch (error) {
    console.error('[API] Delete inbound route error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

const pbxIPCache = {};

// GET /api/realtime/status
app.get('/api/realtime/status', requireAuth, async (req, res) => {
  try {
    const instance = req.instance;
    console.log(`[API] Fetching real-time monitor status for instance: ${instance}`);
    
    // Background fetch IP if not cached
    if (!pbxIPCache[instance]) {
      pbxIPCache[instance] = 'Resolvendo...';
      getPBXExternalIP(instance, req.cookies).then(ip => {
        pbxIPCache[instance] = ip || `${instance}.pbxfacil.com.br`;
      }).catch(err => {
        console.error('[Background IP Check] Failed:', err.message);
        pbxIPCache[instance] = `${instance}.pbxfacil.com.br`;
      });
    }

    const data = await getRealtimeStatus(instance, req.cookies, mockExtensions, mockQueues);
    return res.json({ 
      success: true, 
      ...data,
      pbxIP: pbxIPCache[instance] || 'Resolvendo...'
    });
  } catch (error) {
    console.error('[API] Fetch real-time status error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/extensions/detail/:id
app.get('/api/extensions/detail/:id', requireAuth, async (req, res) => {
  const extensionId = req.params.id;
  try {
    console.log(`[API] Fetching real-time details for extension ${extensionId}...`);
    if (req.instance.toLowerCase() === 'mock') {
      const meta = getExtensionMetadata(extensionId);
      const ext = mockExtensions.find(e => e.id === extensionId.toString()) || { extension: extensionId, name: 'Ramal Mock' };
      return res.json({
        success: true,
        extension: extensionId,
        name: ext.name,
        secret: '123456',
        type: meta.type,
        queues: meta.queues
      });
    }

    // Inspect extension form settings
    const fields = await inspectExtension(req.instance, req.cookies, extensionId);
    
    // Find name, secret, and transport
    const nameField = fields.find(f => f.name === 'name');
    const secretField = fields.find(f => f.name === 'devinfo_secret');
    const transportField = fields.find(f => f.name === 'devinfo_transport');

    const name = nameField ? nameField.value : '';
    const secret = secretField ? secretField.value : '';
    const transport = transportField ? transportField.value : '';
    
    // Infer type: Webphone if transport is 0.0.0.0-wss
    const type = transport === '0.0.0.0-wss' ? 'Webphone' : 'Softphone';

    // Fetch actual queues this extension belongs to
    console.log(`[API] Inspecting real-time queues for extension ${extensionId}...`);
    const queues = await inspectExtensionQueues(req.instance, req.cookies, extensionId.toString());

    // Update local metadata
    updateExtensionMetadata(extensionId.toString(), type, queues);

    return res.json({
      success: true,
      extension: extensionId,
      name,
      secret,
      type,
      queues
    });
  } catch (error) {
    console.error(`[API] Get extension detail error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/extensions/edit
app.post('/api/extensions/edit', requireAuth, async (req, res) => {
  const { extension, name, secret, type, queues } = req.body;
  const targetQueues = queues || [];

  if (!extension || !name || !secret || !type) {
    return res.status(400).json({ error: 'Número do ramal, nome, senha e tipo são obrigatórios.' });
  }

  try {
    console.log(`[API] Editing extension ${extension} on instance: ${req.instance} (${type})`);

    if (req.instance.toLowerCase() === 'mock') {
      const ext = mockExtensions.find(e => e.id === extension.toString());
      if (ext) {
        ext.name = name;
      }
      updateExtensionMetadata(extension.toString(), type, targetQueues);
      return res.json({ success: true, message: 'Ramal editado com sucesso (Mock).' });
    }

    // Edit settings in FreePBX
    await editExtension(req.instance, req.cookies, { extension, name, secret, type });

    // Update queue agent memberships in FreePBX
    console.log(`[API] Updating queue memberships for edited extension ${extension}...`);
    await updateExtensionQueues(req.instance, req.cookies, extension.toString(), targetQueues);

    // Save metadata locally
    updateExtensionMetadata(extension.toString(), type, targetQueues);

    return res.json({ success: true, message: 'Ramal editado com sucesso.' });
  } catch (error) {
    console.error('[API] Edit extension error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// --- Campaign/Dialer Endpoints ---

// POST /api/campaigns/upload
app.post('/api/campaigns/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }
  
  try {
    const config = req.body;
    
    // Resolve the IP dynamically (use user-provided if available)
    let instanceIP = config.instanceIP || pbxIPCache[req.instance];
    if (!instanceIP || instanceIP === 'Resolvendo...') {
      try {
        instanceIP = await getPBXExternalIP(req.instance, req.cookies);
        if (instanceIP) pbxIPCache[req.instance] = instanceIP;
      } catch (err) {
        console.error('[API] Failed to get external IP during upload:', err.message);
      }
    }
    
    config.instanceIP = instanceIP || `${req.instance}.pbxfacil.com.br`;
    config.instance = req.instance;
    config.cookies = req.cookies;
    
    const campaign = await createCampaign(req.file.path, config);
    return res.json({ success: true, campaign: { id: campaign.id, stats: campaign.stats, config: campaign.config, contacts: campaign.contacts } });
  } catch (err) {
    console.error('[API] Campaign upload error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/start
app.post('/api/campaigns/:id/start', requireAuth, (req, res) => {
  try {
    const campaign = startCampaign(req.params.id, req.cookies);
    return res.json({ success: true, status: campaign.status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
app.post('/api/campaigns/:id/pause', requireAuth, (req, res) => {
  try {
    const campaign = pauseCampaign(req.params.id);
    return res.json({ success: true, status: campaign.status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/status
app.get('/api/campaigns/:id/status', requireAuth, (req, res) => {
  try {
    const status = getCampaignStatus(req.params.id);
    return res.json({ success: true, data: status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/campaigns
app.get('/api/campaigns', requireAuth, (req, res) => {
  return res.json({ success: true, campaigns: getAllCampaigns(req.instance) });
});

// DELETE /api/campaigns/:id
app.delete('/api/campaigns/:id', requireAuth, (req, res) => {
  try {
    deleteCampaign(req.params.id);
    return res.json({ success: true, message: 'Campanha excluída com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/contacts (ERP/CRM Integration)
app.post('/api/campaigns/:id/contacts', requireAuth, (req, res) => {
  const { id } = req.params;
  const contactsInput = req.body.contacts || (req.body.phone ? [req.body] : null);
  
  if (!contactsInput || !Array.isArray(contactsInput)) {
    return res.status(400).json({ error: 'Formato inválido. Envie um objeto com "phone" e "name", ou uma lista "contacts".' });
  }
  
  try {
    const campaign = addContactsToCampaign(id, contactsInput);
    return res.json({ success: true, campaign: { id: campaign.id, stats: campaign.stats, config: campaign.config } });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/pbx/setup-ari
app.post('/api/pbx/setup-ari', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Automating ARI user creation on instance: ${req.instance}`);
    const result = await setupARIUser(req.instance, req.cookies);
    return res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('[API] Error in setup-ari:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pbx/setup-amd
app.post('/api/pbx/setup-amd', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Automating AMD dialplan setup on instance: ${req.instance}`);
    const result = await setupAMDDialplan(req.instance, req.cookies);
    return res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('[API] Error in setup-amd:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pbx/run-cli
app.post('/api/pbx/run-cli', requireAuth, async (req, res) => {
  try {
    const { command } = req.body;
    console.log(`[API] Running CLI command on instance: ${req.instance}: ${command}`);
    
    // We launch browser and create page using import of getBrowser and createNewPage helper
    const { getBrowser, createNewPage } = await import('./puppeteer-service.js');
    const browser = await getBrowser();
    let page;
    try {
      page = await createNewPage(browser, req.cookies);
      await page.goto(`https://${req.instance}.pbxfacil.com.br/admin/config.php?display=cli`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('input#command', { timeout: 10000 });
      
      await page.evaluate((c) => {
        document.querySelector('input#command').value = c;
      }, command);
      
      await page.click('button#run_command, button[type="submit"], input[type="submit"], button');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const output = await page.evaluate(() => {
        const out = document.querySelector('#cli_output, #output, pre, .cli-output');
        return out ? out.innerText : 'No output found';
      });
      
      return res.json({ success: true, output });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  } catch (error) {
    console.error('[API] Error in run-cli:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pbx/write-dialplan
app.post('/api/pbx/write-dialplan', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo é obrigatório.' });
    console.log(`[API] Restoring dialplan content on instance: ${req.instance}`);

    const { getBrowser, createNewPage, applyPBXConfiguration } = await import('./puppeteer-service.js');
    const browser = await getBrowser();
    let page;
    try {
      page = await createNewPage(browser, req.cookies);
      await page.goto(`https://${req.instance}.pbxfacil.com.br/admin/config.php?display=configedit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      await page.waitForSelector('#jstree-proton-1', { timeout: 15000 });
      
      const clicked = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const targetLink = links.find(a => a.textContent.includes('extensions_custom.conf') || a.href.includes('extensions_custom.conf'));
        if (targetLink) {
          targetLink.click();
          return true;
        }
        const li = document.querySelector('li[data-file="extensions_custom.conf"] a');
        if (li) {
          li.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        throw new Error('Não foi possível encontrar o arquivo extensions_custom.conf na árvore de arquivos.');
      }
      
      await page.waitForFunction(() => {
        const btn = document.querySelector('#save');
        return btn && !btn.disabled;
      }, { timeout: 15000 });
      
      await page.evaluate((text) => {
        const editorEl = document.querySelector('#editor');
        const cmEl = document.querySelector('.CodeMirror');
        let myCodeMirror = null;
        if (editorEl && editorEl.CodeMirror) {
          myCodeMirror = editorEl.CodeMirror;
        } else if (cmEl && cmEl.CodeMirror) {
          myCodeMirror = cmEl.CodeMirror;
        }

        if (myCodeMirror) {
          myCodeMirror.setValue(text);
          myCodeMirror.save();
        } else if (editorEl) {
          editorEl.value = text;
        }

        if (editorEl) {
          editorEl.dispatchEvent(new Event('input', { bubbles: true }));
          editorEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, content);
      
      await page.click('#save');
      await new Promise(r => setTimeout(r, 3000));
      await applyPBXConfiguration(page);
      
      return res.json({ success: true, message: 'Conteúdo restaurado e aplicado com sucesso no PABX!' });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  } catch (error) {
    console.error('[API] Error in write-dialplan:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pbx/restore-original-dialplan
app.post('/api/pbx/restore-original-dialplan', requireAuth, async (req, res) => {
  try {
    console.log(`[API] Restoring original dialplan on instance: ${req.instance}`);
    const result = await restoreOriginalDialplan(req.instance, req.cookies);
    return res.json(result);
  } catch (error) {
    console.error('[API] Error in restore-original-dialplan:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, () => {
  console.log(`[Server] PBX Fácil API listening on port ${PORT}`);
});
