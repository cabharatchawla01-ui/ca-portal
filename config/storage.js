const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = 'documents';

/**
 * Upload a file buffer to Supabase Storage
 * @param {Buffer} buffer
 * @param {string} storagePath  e.g. "firma-slug/clientId/filename.pdf"
 * @param {string} mimeType
 */
async function uploadFile(buffer, storagePath, mimeType) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return data.path;
}

/**
 * Generate a signed URL (expires in 1 hour)
 */
async function getSignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a file from storage
 */
async function deleteFile(storagePath) {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}

module.exports = { supabase, uploadFile, getSignedUrl, deleteFile, BUCKET };
