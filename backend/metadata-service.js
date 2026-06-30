import fs from 'fs';
import path from 'path';

const metadataPath = 'c:/Users/GuiAschi/Desktop/Pabx2.0/backend/extension_metadata.json';

export function getMetadata() {
  try {
    if (fs.existsSync(metadataPath)) {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[Metadata] Error reading metadata file:', e.message);
  }
  return {};
}

export function saveMetadata(metadata) {
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Metadata] Error saving metadata file:', e.message);
  }
}

export function getExtensionMetadata(extensionNumber) {
  const metadata = getMetadata();
  return metadata[extensionNumber] || { type: 'Softphone', queues: [] };
}

export function updateExtensionMetadata(extensionNumber, type, queues = []) {
  const metadata = getMetadata();
  metadata[extensionNumber] = {
    type,
    queues
  };
  saveMetadata(metadata);
  console.log(`[Metadata] Updated extension ${extensionNumber}: Type=${type}, Queues=`, queues);
}
