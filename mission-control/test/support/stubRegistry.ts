import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import avro from 'avsc';
import { json, stubHttp, type StubServer } from './stubHttp';

const AVRO_DIR = resolve(__dirname, '../../../oms-contracts/src/main/avro');

/**
 * Builds the self-contained schema the Schema Registry holds for a record (named types inlined),
 * from the contract files in oms-contracts — the only copy of the schemas (P-01).
 */
export function inlinedSchema(recordName: string): string {
  const registry: Record<string, avro.Type> = {};
  const files = readdirSync(AVRO_DIR).filter((f) => f.endsWith('.avsc'));
  const schemas = files.map((f) => JSON.parse(readFileSync(resolve(AVRO_DIR, f), 'utf8')));
  for (const s of schemas.filter((s) => s.type === 'enum')) avro.Type.forSchema(s, { registry });
  const target = schemas.find((s) => s.name === recordName);
  if (!target) throw new Error(`no schema ${recordName} in ${AVRO_DIR}`);
  return JSON.stringify(avro.Type.forSchema(target, { registry }).schema());
}

/** A record of the named schema with every field not given set to a type-valid placeholder (null where nullable). */
export function fullRecord(recordName: string, values: Record<string, unknown>): Record<string, unknown> {
  const fields = (JSON.parse(inlinedSchema(recordName)) as { fields: { name: string; type: unknown }[] }).fields;
  return Object.fromEntries(fields.map((f) => [f.name, f.name in values ? values[f.name] : placeholder(f.type)]));
}

function placeholder(type: unknown): unknown {
  if (Array.isArray(type)) return type.includes('null') ? null : placeholder(type[0]);
  const t = typeof type === 'string' ? { type } : (type as { type: string; symbols?: string[] });
  switch (t.type) {
    case 'string':
      return '';
    case 'int':
    case 'long':
    case 'float':
    case 'double':
      return 0;
    case 'boolean':
      return false;
    case 'bytes':
      return Buffer.alloc(0);
    case 'enum':
      return t.symbols![0];
    default:
      return null;
  }
}

export interface StubRegistry extends StubServer {
  ids: Record<string, number>;
}

/** A Schema Registry that serves OrderMessage (id 1) and OrderExecution (id 2) by id. */
export async function stubRegistry(): Promise<StubRegistry> {
  const byId: Record<number, string> = { 1: inlinedSchema('OrderMessage'), 2: inlinedSchema('OrderExecution') };
  const server = await stubHttp((req, res) => {
    const m = req.url.match(/^\/schemas\/ids\/(\d+)/);
    if (m && byId[Number(m[1])]) return json(res, 200, { schema: byId[Number(m[1])] });
    if (req.url === '/subjects') return json(res, 200, ['oms_orders-value', 'oms_order_executions-value']);
    json(res, 404, { error_code: 40403, message: 'Schema not found' });
  });
  return { ...server, ids: { OrderMessage: 1, OrderExecution: 2 } };
}
