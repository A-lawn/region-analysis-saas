import { mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, existsSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import db from '../db';
import { config } from '../config';
import logger from '../utils/logger';
import pgPromise from 'pg-promise';

const pgp = pgPromise();

export async function ensureBackupDir(tenantId: string = 'default'): Promise<string> {
  const dir = join(config.backup.dir, tenantId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info({ dir }, 'Backup directory created');
  }
  return dir;
}

export async function backupProject(projectId: string, tenantId: string = 'default'): Promise<string> {
  const backupDir = await ensureBackupDir(tenantId);

  const project = await db.oneOrNone(
    'SELECT * FROM analysis_projects WHERE id = $[id]',
    { id: projectId }
  );
  if (!project) throw new Error('Project not found');

  const [points, results, candidates] = await Promise.all([
    db.manyOrNone('SELECT id, name, address, lng, lat, source, metadata, h3_index FROM spatial_points WHERE project_id = $[id]', { id: projectId }),
    db.manyOrNone('SELECT id, analysis_type, params, result, created_at FROM analysis_results WHERE project_id = $[id]', { id: projectId }),
    db.manyOrNone('SELECT id, name, lng, lat, score, dimensions FROM site_candidates WHERE project_id = $[id]', { id: projectId }),
  ]);

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `${projectId}_${timestamp}.json`;
  const filePath = join(backupDir, filename);

  const backupData = {
    meta: {
      version: 1,
      source_crs: project.source_crs,
      stored_in: 'wgs84',
      deleted_at: new Date().toISOString(),
      point_count: project.point_count,
      project_name: project.name,
      original_id: project.id,
    },
    project: {
      id: project.id,
      tenant_id: project.tenant_id,
      name: project.name,
      source_crs: project.source_crs,
      point_count: project.point_count,
      status: project.status,
      created_at: project.created_at,
      updated_at: project.updated_at,
    },
    points: points || [],
    results: results || [],
    candidates: candidates || [],
  };

  writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  logger.info({ projectId, filePath }, 'Project backup created');

  return filePath;
}

export async function restoreProject(backupFilePath: string): Promise<{ projectId: string; name: string }> {
  if (!existsSync(backupFilePath)) {
    throw new Error('Backup file not found: ' + backupFilePath);
  }

  const raw = readFileSync(backupFilePath, 'utf-8');
  const data = JSON.parse(raw);

  const newId = randomUUID();
  const newName = data.meta.project_name + ' (已恢复)';

  await db.tx(async (t: any) => {
    await t.none(
      `INSERT INTO analysis_projects (id, tenant_id, name, source_crs, point_count, status, created_at, updated_at)
       VALUES ($[id], $[tenantId], $[name], $[sourceCrs], $[pointCount], 'ready', NOW(), NOW())`,
      {
        id: newId,
        tenantId: data.project.tenant_id || 'default',
        name: newName,
        sourceCrs: data.meta.source_crs,
        pointCount: data.meta.point_count,
      }
    );

    if (data.points && data.points.length > 0) {
      const cs = new pgp.helpers.ColumnSet(
        ['project_id', 'name', 'address', 'lng', 'lat', 'source', 'metadata', 'h3_index'],
        { table: 'spatial_points' }
      );
      const rows = data.points.map((p: any) => ({
        project_id: newId,
        name: p.name,
        address: p.address,
        lng: p.lng,
        lat: p.lat,
        source: p.source || 'owner',
        metadata: p.metadata || {},
        h3_index: p.h3_index,
      }));
      const query = pgp.helpers.insert(rows, cs);
      await t.none(query);
      await t.none(
        'UPDATE spatial_points SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE project_id = $[pid] AND geom IS NULL',
        { pid: newId }
      );
    }

    if (data.results && data.results.length > 0) {
      for (const r of data.results) {
        await t.none(
          `INSERT INTO analysis_results (project_id, analysis_type, params, result, created_at)
           VALUES ($[pid], $[type], $[params], $[result], $[createdAt])`,
          {
            pid: newId,
            type: r.analysis_type,
            params: r.params || {},
            result: r.result || {},
            createdAt: r.created_at || new Date().toISOString(),
          }
        );
      }
    }

    if (data.candidates && data.candidates.length > 0) {
      for (const c of data.candidates) {
        await t.none(
          `INSERT INTO site_candidates (project_id, name, lng, lat, score, dimensions)
           VALUES ($[pid], $[name], $[lng], $[lat], $[score], $[dimensions])`,
          {
            pid: newId,
            name: c.name,
            lng: c.lng,
            lat: c.lat,
            score: c.score || 0,
            dimensions: c.dimensions || {},
          }
        );
      }
      await t.none(
        'UPDATE site_candidates SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE project_id = $[pid] AND geom IS NULL',
        { pid: newId }
      );
    }

    await t.none(
      'UPDATE analysis_projects SET bounds = (SELECT ST_Envelope(ST_Collect(geom)) FROM spatial_points WHERE project_id = $[pid]) WHERE id = $[pid]',
      { pid: newId }
    );
  });

  logger.info({ oldId: data.meta.original_id, newId, filePath: backupFilePath }, 'Project restored from backup');
  return { projectId: newId, name: newName };
}

export async function cleanExpiredBackups(retentionDays: number): Promise<number> {
  const now = Date.now();
  const cutoff = now - retentionDays * 24 * 3600 * 1000;
  let deletedCount = 0;

  if (!existsSync(config.backup.dir)) return 0;

  const tenantDirs = readdirSync(config.backup.dir);
  for (const tenantDir of tenantDirs) {
    const tenantPath = join(config.backup.dir, tenantDir);
    if (!statSync(tenantPath).isDirectory()) continue;

    const files = readdirSync(tenantPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(tenantPath, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(filePath);
          deletedCount++;
          logger.info({ filePath, age: Math.round((now - stat.mtimeMs) / 86400000) + 'd' }, 'Expired backup deleted');
        }
      } catch (e) {
        logger.warn({ filePath, err: (e as Error).message }, 'Failed to clean backup file');
      }
    }

    try {
      const remaining = readdirSync(tenantPath);
      if (remaining.length === 0) {
        rmdirSync(tenantPath);
      }
    } catch {}
  }

  if (deletedCount > 0) {
    logger.info({ deletedCount, retentionDays }, 'Expired backup cleanup complete');
  }
  return deletedCount;
}

export interface BackupInfo {
  projectName: string;
  projectId: string;
  deletedAt: string;
  pointCount: number;
  filePath: string;
  expiresAt: string;
  daysRemaining: number;
  sourceCrs: string;
}

export async function listBackups(tenantId: string = 'default'): Promise<BackupInfo[]> {
  const tenantDir = join(config.backup.dir, tenantId);
  const backups: BackupInfo[] = [];

  if (!existsSync(tenantDir)) return backups;

  const files = readdirSync(tenantDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(tenantDir, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const stat = statSync(filePath);
      const deletedAt = new Date(data.meta.deleted_at);
      const expiresAt = new Date(deletedAt.getTime() + config.backup.retentionDays * 24 * 3600 * 1000);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)));

      backups.push({
        projectName: data.meta.project_name,
        projectId: data.meta.original_id,
        deletedAt: data.meta.deleted_at,
        pointCount: data.meta.point_count,
        filePath: filePath,
        expiresAt: expiresAt.toISOString(),
        daysRemaining,
        sourceCrs: data.meta.source_crs,
      });
    } catch (e) {
      logger.warn({ file, err: (e as Error).message }, 'Failed to read backup file');
    }
  }

  backups.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  return backups;
}

export async function removeBackupFile(filePath: string): Promise<boolean> {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.info({ filePath }, 'Backup file removed');
      const parentDir = dirname(filePath);
      try {
        const remaining = readdirSync(parentDir);
        if (remaining.length === 0) {
          rmdirSync(parentDir);
        }
      } catch {}
      return true;
    }
    return false;
  } catch (e) {
    logger.error({ filePath, err: (e as Error).message }, 'Failed to remove backup file');
    return false;
  }
}
