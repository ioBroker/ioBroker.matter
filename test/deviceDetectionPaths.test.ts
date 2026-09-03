import { expect } from 'chai';
import { Types } from '@iobroker/type-detector';
import { determineIoBrokerDevice, findDeviceFromId, getIoBrokerDeviceStates } from '../src/lib/deviceDetection';
import { MockObjectAdapter, type ObjectMap } from './helpers/mockObjectAdapter';

/**
 * Covers what the detection layer does when the configuration and the objects disagree. The exported object
 * fixtures only ever describe correctly configured devices, so every fallback and error path here needs an
 * object tree built for it.
 */

function channel(id: string, role?: string): ioBroker.Object {
    return { _id: id, type: 'channel', common: { name: id.split('.').pop()!, role }, native: {} } as ioBroker.Object;
}

function folder(id: string): ioBroker.Object {
    return { _id: id, type: 'folder', common: { name: id.split('.').pop()! }, native: {} } as ioBroker.Object;
}

function state(id: string, common: Partial<ioBroker.StateCommon>): ioBroker.Object {
    return {
        _id: id,
        type: 'state',
        common: { name: id.split('.').pop()!, type: 'boolean', read: true, write: true, ...common },
        native: {},
    } as ioBroker.Object;
}

function treeOf(...objects: ioBroker.Object[]): MockObjectAdapter {
    const map: ObjectMap = {};
    for (const object of objects) {
        map[object._id] = object;
    }
    return new MockObjectAdapter(map);
}

/** A channel the detector recognizes as a light, and as a window through its read-only state. */
function lightTree(): MockObjectAdapter {
    return treeOf(
        channel('x.0.dev', 'light'),
        state('x.0.dev.SET', { role: 'switch.light' }),
        state('x.0.dev.ACTUAL', { role: 'sensor.light', write: false }),
    );
}

describe('deviceDetection paths', () => {
    describe('findDeviceFromId', () => {
        it('returns nothing for an object that does not exist', async () => {
            expect(await findDeviceFromId(treeOf(), 'x.0.gone')).to.equal(null);
        });

        it('returns nothing for a meta object', async () => {
            const meta = { _id: 'x.0', type: 'meta', common: { name: 'x' }, native: {} } as ioBroker.Object;
            expect(await findDeviceFromId(treeOf(meta), 'x.0')).to.equal(null);
        });

        it('returns a channel or device as itself', async () => {
            const tree = treeOf(channel('x.0.dev'));
            expect(await findDeviceFromId(tree, 'x.0.dev')).to.equal('x.0.dev');
        });

        it('groups a state under the folder above it', async () => {
            const tree = treeOf(folder('x.0.room'), state('x.0.room.SET', { role: 'switch' }));
            expect(await findDeviceFromId(tree, 'x.0.room.SET')).to.equal('x.0.room');
        });

        it('treats the namespace root as the device of a one-device adapter', async () => {
            const tree = treeOf(folder('x.0'), state('x.0.SET', { role: 'switch' }));
            expect(await findDeviceFromId(tree, 'x.0.SET')).to.equal('x.0');
        });

        it('falls back to the state itself when nothing above it exists', async () => {
            // Walking up stops at the namespace root, which rejects a search that did not start one level
            // below it, so the state is all there is.
            const tree = treeOf(state('x.0.a.b.SET', { role: 'switch' }));
            expect(await findDeviceFromId(tree, 'x.0.a.b.SET')).to.equal('x.0.a.b.SET');
        });

        it('returns nothing when the id is not a state and has nothing above it', async () => {
            const tree = treeOf(folder('x.0.a.b'));
            expect(await findDeviceFromId(tree, 'x.0.a.b')).to.equal(null);
        });
    });

    describe('getIoBrokerDeviceStates', () => {
        it('detects the preferred type and keeps its whole state set', async () => {
            const detected = await getIoBrokerDeviceStates(lightTree(), 'x.0.dev', 'light');
            expect(detected?.type).to.equal(Types.light);
            expect(detected?.states.map(({ name }) => name)).to.deep.equal(['SET', 'ON_ACTUAL']);
        });

        it('reports nothing when the objects describe no device at all', async () => {
            const tree = treeOf(channel('x.0.dev'), state('x.0.dev.RAW', { role: 'state', type: 'string' }));
            expect(await getIoBrokerDeviceStates(tree, 'x.0.dev')).to.equal(null);
            expect(tree.warnings).to.deep.equal([]);
        });

        it('reports nothing when the configured state belongs to no detected device', async () => {
            // The detector builds its light around SET; ORPHAN is a sibling nothing maps (#594, #730).
            const tree = treeOf(
                channel('x.0.dev', 'light'),
                state('x.0.dev.SET', { role: 'switch.light' }),
                state('x.0.dev.ORPHAN', { role: 'state', type: 'string' }),
            );
            expect(await getIoBrokerDeviceStates(tree, 'x.0.dev.ORPHAN', 'light')).to.equal(null);
        });

        it('picks the pattern the configured state is the main state of', async () => {
            const detected = await getIoBrokerDeviceStates(lightTree(), 'x.0.dev.ACTUAL');
            expect(detected?.type).to.equal(Types.window);
            expect(detected?.states.map(({ id }) => id)).to.deep.equal(['x.0.dev.ACTUAL']);
        });
    });

    describe('determineIoBrokerDevice', () => {
        it('reports nothing when the configured object does not exist', async () => {
            expect(await determineIoBrokerDevice(treeOf(), 'x.0.gone', 'light', true)).to.equal(null);
        });

        it('detects a channel even when the configuration disabled auto detection', async () => {
            // The admin UI writes auto=false when a channel is picked, which would otherwise expose the
            // channel object itself as a single state.
            const detected = await determineIoBrokerDevice(lightTree(), 'x.0.dev', 'light', false);
            expect(detected?.type).to.equal(Types.light);
            expect(detected?.states.length).to.equal(2);
        });

        it('refuses a channel whose objects do not describe the configured type', async () => {
            const tree = lightTree();
            expect(await determineIoBrokerDevice(tree, 'x.0.dev', 'thermostat', true)).to.equal(null);
            expect(tree.errors.join()).to.contain('Could not auto-detect a "thermostat" device');
        });

        it('exposes a configured state alone when no device of that type is detected', async () => {
            const tree = lightTree();
            const detected = await determineIoBrokerDevice(tree, 'x.0.dev.SET', 'thermostat', true);
            expect(detected?.type).to.equal(Types.thermostat);
            // A thermostat is configured through its setpoint, so the single state has to be named SET.
            expect(detected?.states).to.deep.equal([
                { name: 'SET', id: 'x.0.dev.SET', write: true, defaultRole: 'button', required: true },
            ]);
        });

        it('names the single state after the type it is configured as', async () => {
            // A wrong name leaves the device class without the state it requires, so it is unusable.
            const expected: Record<string, string> = {
                illuminance: 'ACTUAL',
                cie: 'CIE',
                rgbSingle: 'RGB',
                rgbwSingle: 'RGBW',
                thermostat: 'SET',
            };
            for (const [type, name] of Object.entries(expected)) {
                const tree = treeOf(channel('x.0.dev'), state('x.0.dev.VALUE', { role: 'value.temperature' }));
                const detected = await determineIoBrokerDevice(tree, 'x.0.dev.VALUE', type, false);
                expect(detected?.states[0].name, `single state name for ${type}`).to.equal(name);
            }
        });

        it('keeps a state configured with auto detection off as that single state', async () => {
            const tree = lightTree();
            const detected = await determineIoBrokerDevice(tree, 'x.0.dev.SET', 'socket', false);
            expect(detected?.type).to.equal(Types.socket);
            expect(detected?.states.map(({ id }) => id)).to.deep.equal(['x.0.dev.SET']);
        });
    });

    describe('the unrestricted detection retry', () => {
        /**
         * `ChannelDetector.detect` caches its pattern list on the options object and records every pattern it
         * checked there, so a retry handed the same object gets a list frozen under the first call's
         * `allowedTypes` with every entry already marked as checked, and reports nothing whatever the objects
         * say. Each attempt therefore has to build its own options.
         */
        it('reports the device the objects describe when the configured type matches nothing', async () => {
            const detected = await getIoBrokerDeviceStates(lightTree(), 'x.0.dev', 'dimmer');
            expect(detected?.type).to.equal(Types.light);
        });

        it('leaves a device configured with the wrong type as its own single state, and says so', async () => {
            const tree = lightTree();
            const detected = await determineIoBrokerDevice(tree, 'x.0.dev.SET', 'dimmer', true);
            expect(detected?.states.map(({ id }) => id)).to.deep.equal(['x.0.dev.SET']);
            expect(tree.errors.join()).to.contain('Type detection mismatch');
        });

        it('warns when the detected type is not the configured one', async () => {
            const tree = lightTree();
            await getIoBrokerDeviceStates(tree, 'x.0.dev', 'dimmer');
            expect(tree.warnings.join()).to.contain('Type detection mismatch');
        });
    });
});
