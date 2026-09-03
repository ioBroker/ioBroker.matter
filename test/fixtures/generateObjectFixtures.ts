/**
 * Regenerates the ioBroker object fixtures from admin object exports.
 *
 * Usage:
 *   npm run test:fixtures -- ~/Downloads/alias.json ~/Downloads/0_userdata.json ~/Downloads/matter.0.bridges.json
 *
 * Exports carry per-object ACLs, timestamps, icons and fully expanded `common.enums` trees; none of that
 * reaches the detector (production passes `ignoreEnums`) and it inflates the export tenfold, so only the
 * fields the detector and the device layer read are kept. A bridge configuration also carries its Matter
 * setup passcode, which must never reach a committed fixture.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEPT_COMMON = [
    'name',
    'type',
    'role',
    'read',
    'write',
    'min',
    'max',
    'step',
    'unit',
    'def',
    'states',
    'alias',
] as const;

/** Exports are untyped JSON, so the generator works on the shape it reads rather than on `ioBroker.Object`. */
interface ExportedObject {
    _id: string;
    type: string;
    common: Record<string, unknown>;
    native: Record<string, unknown>;
}

type ObjectMap = Record<string, ExportedObject>;

const KEPT_TYPES = new Set(['state', 'channel', 'device', 'folder']);

function strip(object: ExportedObject): ExportedObject {
    const common: Record<string, unknown> = {};
    for (const key of KEPT_COMMON) {
        const value = object.common?.[key];
        if (value !== undefined) {
            common[key] = value;
        }
    }
    return { _id: object._id, type: object.type, common, native: {} };
}

function readExport(file: string): ObjectMap {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ObjectMap;
    if (Array.isArray(parsed)) {
        throw new Error(`${file} is a list export; export objects with ids ("as JSON") instead`);
    }
    return parsed;
}

function main(): void {
    const inputs = process.argv.slice(2);
    if (!inputs.length) {
        throw new Error('Pass the exported object json files, bridge exports included');
    }

    const objects: ObjectMap = {};
    const bridges: Record<string, ExportedObject> = {};

    for (const input of inputs) {
        for (const [id, object] of Object.entries(readExport(input))) {
            if (!object || typeof object !== 'object') {
                continue;
            }
            const withId = { ...object, _id: object._id ?? id };
            if (id.startsWith('matter.') && id.includes('.bridges.') && Array.isArray(withId.native?.list)) {
                // A bridge configuration carries its Matter setup passcode, so only the two fields the tests
                // read are kept - copying `native` wholesale would commit that credential.
                bridges[id] = {
                    _id: withId._id,
                    type: withId.type,
                    common: { name: withId.common?.name },
                    native: { list: withId.native.list },
                };
            } else if (KEPT_TYPES.has(withId.type)) {
                objects[id] = strip(withId);
            }
        }
    }

    const here = __dirname;
    const write = (name: string, data: unknown): void => {
        writeFileSync(join(here, name), `${JSON.stringify(data, null, 2)}\n`);
        console.log(`${name}: ${Object.keys(data as object).length} entries`);
    };
    write(
        'ioBrokerObjects.json',
        Object.fromEntries(
            Object.keys(objects)
                .sort()
                .map(id => [id, objects[id]]),
        ),
    );
    if (Object.keys(bridges).length) {
        write(
            'ioBrokerBridges.json',
            Object.fromEntries(
                Object.keys(bridges)
                    .sort()
                    .map(id => [id, bridges[id]]),
            ),
        );
    }
}

main();
