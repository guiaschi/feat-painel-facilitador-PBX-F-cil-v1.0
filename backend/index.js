import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import { loginToPBX, getExtensions, createExtension, editExtension, deleteExtension, inspectExtension, getQueues, updateExtensionQueues, inspectExtensionQueues, syncAllExtensionsMetadata, createQueue, editQueue, deleteQueue, inspectQueueDetail, getRealtimeStatus, getPBXExternalIP, getInboundRoutes, createInboundRoute, editInboundRoute, deleteInboundRoute } from './puppeteer-service.js';
import { getExtensionMetadata, updateExtensionMetadata } from './metadata-service.js';

dotenv.config();

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

app.use(cors({
  origin: '*', // In production, narrow this to the frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Auth middleware to restore state from JWT token
const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
    }

    const token = authHeader.split(' ')[1];
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
  res.json({ status: 'OK', message: 'PBX Fácil smart proxy is running.' });
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

app.listen(PORT, () => {
  console.log(`[Server] PBX Fácil API listening on port ${PORT}`);

  // Autostart test using the user's provided credentials
  setTimeout(async () => {
    console.log('[AUTO-TEST] Starting autostart login test...');
    try {
      const result = await loginToPBX('smart', 'parceiro', 'L6asVa5$tVZTT87M');
      console.log('[AUTO-TEST] LOGIN SUCCESSFUL! User:', result.user);
      
      console.log('[AUTO-TEST] Retrieving extensions list...');
      const extensions = await getExtensions('smart', result.cookies);
      console.log('[AUTO-TEST] EXTENSIONS RETRIEVED SUCCESSFULLY! Count:', extensions.length);
      console.log(JSON.stringify(extensions.slice(0, 3), null, 2)); // log first 3

      // Trigger background extensions sync
      syncAllExtensionsMetadata('smart', result.cookies).catch(e => {
        console.error('[Background Sync] Failed during autostart trigger:', e.message);
      });
    } catch (e) {
      console.error('[AUTO-TEST] FAILED:', e);
    }
  }, 2000);
});
