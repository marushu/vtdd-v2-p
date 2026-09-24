import { open, rename, unlink, lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function readPrivateJson(path) {
  if (!isAbsolute(path || '')) throw Error('absolute_private_path_required');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 16384) throw Error('private_json_required');
  return JSON.parse(await readFile(path,'utf8'));
}
export async function atomicPrivateJson(path, value) {
  if (!isAbsolute(path || '')) throw Error('absolute_private_path_required');
  const existing = await lstat(path).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || (existing.mode & 0o077))) throw Error('private_output_required');
  const temporary = path+'.'+randomUUID()+'.tmp';
  const file = await open(temporary,'wx',0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); await file.close(); await rename(temporary,path); }
  finally { await file.close().catch(()=>{}); await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;}); }
}
