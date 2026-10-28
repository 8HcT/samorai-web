/**
 * Arranca un PostgreSQL 17 real para toda la ejecución de tests, aplica las
 * migraciones de supabase/migrations sobre una base "plantilla" y publica
 * los datos de conexión. Cada archivo de test clona la plantilla
 * (CREATE DATABASE … TEMPLATE), así los tests no se pisan entre sí.
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

const TEMPLATE_DB = 'samorai_template';
const ROOT = path.resolve(import.meta.dirname, '..', '..');

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export default async function setup(project: TestProject) {
  const port = await freePort();
  const databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'samorai-pg-'));
  const server = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    // Igual que Supabase: UTF8 (en Windows initdb usaría WIN1252 por defecto).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });

  await server.initialise();
  await server.start();

  const connection = { host: '127.0.0.1', port, user: 'postgres', password: 'postgres' };

  const admin = new pg.Client({ ...connection, database: 'postgres' });
  await admin.connect();
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.end();

  const client = new pg.Client({ ...connection, database: TEMPLATE_DB });
  await client.connect();
  try {
    await client.query(await fs.readFile(path.join(ROOT, 'tests/setup/supabase-stubs.sql'), 'utf8'));
    const dir = path.join(ROOT, 'supabase/migrations');
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        throw new Error(`La migración ${file} falla: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }

  project.provide('pg', { ...connection, template: TEMPLATE_DB });

  return async () => {
    await server.stop();
    await fs.rm(databaseDir, { recursive: true, force: true }).catch(() => {});
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pg: { host: string; port: number; user: string; password: string; template: string };
  }
}
