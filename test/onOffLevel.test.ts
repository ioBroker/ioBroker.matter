import { expect } from 'chai';
import { LightingLevel, PumpLevel, type LevelScale } from '../src/matter/ConversionUtils';
import type { Endpoint } from '@matter/main';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import {
    OnOffLevelCommands,
    onOffLevelTargetOf,
    type OnOffLevelTarget,
} from '../src/matter/to-iobroker/OnOffLevelCommands';
import {
    OnOffLevelMapping,
    type IoBrokerOnOffLevelStates,
    type MatterOnOffLevelState,
} from '../src/matter/to-matter/OnOffLevelMapping';

/** A remote Matter device that records the commands it receives and applies them to its reported state. */
class FakeDevice implements OnOffLevelTarget {
    readonly commands = new Array<string>();
    onOff: boolean;
    level: number | null;
    readonly onOffCoupling: boolean;

    constructor(onOff: boolean, level: number | null, onOffCoupling = true) {
        this.onOff = onOff;
        this.level = level;
        this.onOffCoupling = onOffCoupling;
    }

    hasOnOffCoupling(): boolean {
        return this.onOffCoupling;
    }

    isOn(): boolean {
        return this.onOff;
    }
    currentLevel(): number | null {
        return this.level;
    }
    async on(): Promise<void> {
        this.commands.push('on');
        this.onOff = true;
    }
    async off(): Promise<void> {
        this.commands.push('off');
        this.onOff = false;
    }
    async moveToLevel(level: number, transitionTime: number | null): Promise<void> {
        this.commands.push(`moveToLevel ${level} ${transitionTime}`);
        this.level = level;
    }
    async moveToLevelWithOnOff(level: number, transitionTime: number | null): Promise<void> {
        this.commands.push(`moveToLevelWithOnOff ${level} ${transitionTime}`);
        this.level = level;
        this.onOff = true;
    }
}

function commandsFor(
    device: FakeDevice,
    scale: LevelScale = LightingLevel,
    range = { min: 1, max: 254 },
): { commands: OnOffLevelCommands; updates: number[] } {
    const updates = new Array<number>();
    const commands = new OnOffLevelCommands(
        device,
        scale,
        async percent => {
            updates.push(percent);
        },
        range,
    );
    return { commands, updates };
}

describe('OnOffLevelCommands (controller: ioBroker states to Matter commands)', () => {
    it('sends On for power true and Off for power false, without a level command', async () => {
        const device = new FakeDevice(false, 127);
        const { commands, updates } = commandsFor(device);
        await commands.setPower(true);
        await commands.setPower(false);
        expect(device.commands).to.deep.equal(['on', 'off']);
        expect(updates).to.deep.equal([]);
    });

    it('turns the device off for level 0, keeps the device level and writes it back to the level state', async () => {
        const device = new FakeDevice(true, 127);
        const { commands, updates } = commandsFor(device);
        await commands.setLevel(0, 500);
        expect(device.commands).to.deep.equal(['off']);
        expect(device.level).to.equal(127);
        expect(updates).to.deep.equal([50]);
    });

    it('does not write the level state back for level 0 while the device level is unknown', async () => {
        const device = new FakeDevice(true, null);
        const { commands, updates } = commandsFor(device);
        await commands.setLevel(0);
        expect(device.commands).to.deep.equal(['off']);
        expect(updates).to.deep.equal([]);
    });

    it('moves to the level with the transition time while the device is on', async () => {
        const device = new FakeDevice(true, 127);
        const { commands, updates } = commandsFor(device);
        await commands.setLevel(100, 1500);
        expect(device.commands).to.deep.equal(['moveToLevel 254 15']);
        expect(updates).to.deep.equal([]);
    });

    it('sends MoveToLevelWithOnOff without a transition while the device is off', async () => {
        const device = new FakeDevice(false, 127);
        const { commands } = commandsFor(device);
        await commands.setLevel(100, 1500);
        expect(device.commands).to.deep.equal(['moveToLevelWithOnOff 254 null']);
    });

    it('sends On and MoveToLevel for the minimum level while the device is off, as WithOnOff would turn it off', async () => {
        const device = new FakeDevice(false, 127);
        const { commands } = commandsFor(device, LightingLevel, { min: 20, max: 254 });
        await commands.setLevel(1, 1500);
        expect(device.commands).to.deep.equal(['on', 'moveToLevel 20 null']);
    });

    it('sends On before MoveToLevel while the device is off and its LevelControl has no OnOff feature', async () => {
        const pump = new FakeDevice(false, 100, false);
        const { commands } = commandsFor(pump, PumpLevel, { min: 0, max: 200 });
        await commands.setLevel(75.5, 1500);
        expect(pump.commands).to.deep.equal(['on', 'moveToLevel 151 null']);
    });

    it('clamps the level to the range of the device', async () => {
        const device = new FakeDevice(true, 127);
        const { commands } = commandsFor(device, LightingLevel, { min: 20, max: 200 });
        await commands.setLevel(1);
        await commands.setLevel(100);
        expect(device.commands).to.deep.equal(['moveToLevel 20 null', 'moveToLevel 200 null']);
    });

    it('speaker: volume 0 mutes (Off) instead of sending level 0, volume > 0 while muted unmutes', async () => {
        const speaker = new FakeDevice(true, 127, false);
        const { commands } = commandsFor(speaker, LightingLevel, { min: 0, max: 254 });
        await commands.setLevel(0);
        expect(speaker.commands).to.deep.equal(['off']);
        expect(speaker.onOff).to.equal(false);
        await commands.setLevel(50);
        expect(speaker.commands).to.deep.equal(['off', 'on', 'moveToLevel 127 null']);
    });

    it('pump: level 0 stops the pump with Off and keeps its setpoint level', async () => {
        const pump = new FakeDevice(true, 100, false);
        const { commands, updates } = commandsFor(pump, PumpLevel, { min: 1, max: 200 });
        await commands.setLevel(0);
        expect(pump.commands).to.deep.equal(['off']);
        expect(updates).to.deep.equal([50]);
        await commands.setLevel(75.5);
        expect(pump.commands).to.deep.equal(['off', 'on', 'moveToLevel 151 null']);
    });
});

describe('onOffLevelTargetOf (controller: commands to the remote endpoint)', () => {
    function fakeEndpoint(onOffFeature: boolean | undefined): { endpoint: Endpoint; calls: unknown[] } {
        const calls = new Array<unknown>();
        const commands = (name: string) => (request?: unknown) => {
            calls.push(request === undefined ? name : [name, request]);
            return Promise.resolve();
        };
        const fake = {
            maybeStateOf: (type: unknown) => (type === LevelControlClient ? { currentLevel: 42 } : undefined),
            commandsOf: (type: unknown) =>
                type === OnOffClient
                    ? { on: commands('on'), off: commands('off') }
                    : {
                          moveToLevel: commands('moveToLevel'),
                          moveToLevelWithOnOff: commands('moveToLevelWithOnOff'),
                      },
            behaviors: {
                typeFor: () => (onOffFeature === undefined ? undefined : { features: { onOff: onOffFeature } }),
            },
        };
        return { endpoint: fake as unknown as Endpoint, calls };
    }

    it('sends On, Off and both level commands with the options the device needs', async () => {
        const { endpoint, calls } = fakeEndpoint(true);
        const target = onOffLevelTargetOf(endpoint, () => true);
        expect(target.isOn()).to.equal(true);
        expect(target.currentLevel()).to.equal(42);
        await target.on();
        await target.off();
        await target.moveToLevel(100, 5);
        await target.moveToLevelWithOnOff(120, null);
        expect(calls).to.deep.equal([
            'on',
            'off',
            [
                'moveToLevel',
                {
                    level: 100,
                    transitionTime: 5,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                },
            ],
            ['moveToLevelWithOnOff', { level: 120, transitionTime: null, optionsMask: {}, optionsOverride: {} }],
        ]);
    });

    it('reports the OnOff coupling from the LevelControl OnOff feature', () => {
        expect(onOffLevelTargetOf(fakeEndpoint(true).endpoint, () => false).hasOnOffCoupling()).to.equal(true);
        expect(onOffLevelTargetOf(fakeEndpoint(false).endpoint, () => false).hasOnOffCoupling()).to.equal(false);
        expect(onOffLevelTargetOf(fakeEndpoint(undefined).endpoint, () => false).hasOnOffCoupling()).to.equal(false);
    });
});

/** The Matter endpoint state of a bridged device. */
class FakeEndpoint implements MatterOnOffLevelState {
    onOff?: boolean;
    level: number | null;

    constructor(level: number | null = null) {
        this.level = level;
    }

    async setOnOff(value: () => boolean): Promise<void> {
        this.onOff = value();
    }
    currentLevel(): number | null {
        return this.level;
    }
    async setCurrentLevel(level: number): Promise<void> {
        this.level = level;
    }
}

interface FakeIoBroker {
    power?: boolean;
    level?: number;
    /** Returned by the level getter instead of `level` when set, e.g. null as js-controller reports it. */
    levelOverride?: unknown;
    failNextWrite?: boolean;
    writes: string[];
}

function mappingFor(
    states: { power?: boolean; powerWritable?: boolean; level?: number; hasLevel?: boolean },
    endpoint = new FakeEndpoint(),
    scale: LevelScale = LightingLevel,
): { mapping: OnOffLevelMapping; ioBroker: FakeIoBroker; endpoint: FakeEndpoint } {
    const ioBroker: FakeIoBroker = { power: states.power, level: states.level, writes: new Array<string>() };
    const ioBrokerStates: IoBrokerOnOffLevelStates = {
        power:
            states.power === undefined
                ? undefined
                : {
                      get: () => !!ioBroker.power,
                      set:
                          states.powerWritable === false
                              ? undefined
                              : async on => {
                                    ioBroker.writes.push(`power ${on}`);
                                    ioBroker.power = on;
                                },
                  },
        level:
            states.hasLevel === false
                ? undefined
                : {
                      get: () => ('levelOverride' in ioBroker ? ioBroker.levelOverride : ioBroker.level),
                      set: async percent => {
                          if (ioBroker.failNextWrite) {
                              ioBroker.failNextWrite = false;
                              throw new Error('write failed');
                          }
                          ioBroker.writes.push(`level ${percent}`);
                          ioBroker.level = percent;
                      },
                  },
    };
    return { mapping: new OnOffLevelMapping(ioBrokerStates, endpoint, scale), ioBroker, endpoint };
}

describe('OnOffLevelMapping (bridge: ioBroker states to Matter OnOff and CurrentLevel)', () => {
    describe('ioBroker changes', () => {
        it('derives OnOff from power and level at start', async () => {
            const cases: Array<[power: boolean | undefined, level: number | undefined, onOff: boolean]> = [
                [true, 50, true],
                [false, 50, false],
                [true, 0, false],
                [undefined, 50, true],
                [undefined, 0, false],
            ];
            for (const [power, level, onOff] of cases) {
                const { mapping, endpoint } = mappingFor({ power, level });
                await mapping.initialize();
                expect(endpoint.onOff, `power ${power}, level ${level}`).to.equal(onOff);
            }
        });

        it('turns OnOff off for level 0 although power is true, and on again for level > 0', async () => {
            const { mapping, endpoint } = mappingFor({ power: true, level: 50 });
            await mapping.initialize();
            await mapping.ioBrokerLevelChanged(0);
            expect(endpoint.onOff).to.equal(false);
            expect(endpoint.level).to.equal(127);
            await mapping.ioBrokerLevelChanged(100);
            expect(endpoint.onOff).to.equal(true);
            expect(endpoint.level).to.equal(254);
        });

        it('keeps OnOff off for power false although the level is above 0', async () => {
            const { mapping, endpoint } = mappingFor({ power: true, level: 50 });
            await mapping.initialize();
            await mapping.ioBrokerPowerChanged(false);
            expect(endpoint.onOff).to.equal(false);
            await mapping.ioBrokerLevelChanged(80);
            expect(endpoint.onOff).to.equal(false);
            await mapping.ioBrokerPowerChanged(true);
            expect(endpoint.onOff).to.equal(true);
        });

        it('device without level: OnOff follows power only and CurrentLevel is never written', async () => {
            const endpoint = new FakeEndpoint(42);
            const { mapping } = mappingFor({ power: false, hasLevel: false }, endpoint);
            await mapping.initialize();
            expect(endpoint.onOff).to.equal(false);
            await mapping.ioBrokerPowerChanged(true);
            expect(endpoint.onOff).to.equal(true);
            expect(endpoint.level).to.equal(42);
        });

        it('keeps a stored CurrentLevel at start with level 0 and uses 100 % when there is none', async () => {
            const stored = new FakeEndpoint(80);
            await mappingFor({ level: 0 }, stored).mapping.initialize();
            expect(stored.level).to.equal(80);

            const empty = new FakeEndpoint(null);
            await mappingFor({ level: 0 }, empty).mapping.initialize();
            expect(empty.level).to.equal(LightingLevel.MAX);
        });

        it('counts a level change to null or a non-number as no value: OnOff follows power, CurrentLevel unchanged', async () => {
            const endpoint = new FakeEndpoint(80);
            const { mapping } = mappingFor({ power: true, level: 0 }, endpoint);
            await mapping.initialize();
            expect(endpoint.onOff).to.equal(false);
            for (const value of [null, undefined, 'abc', Number.NaN]) {
                await mapping.ioBrokerLevelChanged(value);
                expect(endpoint.onOff, String(value)).to.equal(true);
                expect(endpoint.level, String(value)).to.equal(80);
                await mapping.ioBrokerLevelChanged(0);
            }
        });

        it('a device without level state keeps a missing CurrentLevel at start', async () => {
            const endpoint = new FakeEndpoint(null);
            await mappingFor({ power: true, hasLevel: false }, endpoint).mapping.initialize();
            expect(endpoint.level).to.equal(null);
        });

        it('a level state with null at start is treated as no value', async () => {
            const endpoint = new FakeEndpoint(80);
            const { mapping, ioBroker } = mappingFor({ power: true, level: 50 }, endpoint);
            ioBroker.levelOverride = null;
            await mapping.initialize();
            expect(endpoint.onOff).to.equal(true);
            expect(endpoint.level).to.equal(80);
        });

        it('a level state without a value neither turns the device off nor sets CurrentLevel', async () => {
            const endpoint = new FakeEndpoint(80);
            const { mapping } = mappingFor({ power: true, level: undefined }, endpoint);
            await mapping.initialize();
            expect(endpoint.onOff).to.equal(true);
            expect(endpoint.level).to.equal(80);
        });
    });

    describe('Matter commands', () => {
        it('On sets power and restores level 0 from CurrentLevel', async () => {
            const { mapping, ioBroker } = mappingFor({ power: false, level: 50 });
            await mapping.initialize();
            await mapping.ioBrokerLevelChanged(0);
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['power true', 'level 50']);
        });

        it('On keeps level 0 of a light or speaker whose CurrentLevel is 0 and restores 100 % when it is unknown', async () => {
            const zero = mappingFor({ level: 0 }, new FakeEndpoint(0));
            await zero.mapping.initialize();
            await zero.mapping.matterOnOffChanged(true);
            expect(zero.ioBroker.writes).to.deep.equal([]);

            const unknown = mappingFor({ level: 0 }, new FakeEndpoint(null));
            await unknown.mapping.initialize();
            unknown.endpoint.level = null;
            await unknown.mapping.matterOnOffChanged(true);
            expect(unknown.ioBroker.writes).to.deep.equal(['level 100']);
        });

        it('On at level 0 with power already true writes only the level', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, level: 0 }, new FakeEndpoint(127));
            await mapping.initialize();
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['level 50']);
        });

        it('writes the same level again after a failed write of it', async () => {
            const { mapping, ioBroker } = mappingFor({ level: 50 });
            await mapping.initialize();
            ioBroker.failNextWrite = true;
            await mapping.matterLevelControlled(200).catch(() => undefined);
            await mapping.matterLevelControlled(200);
            expect(ioBroker.writes).to.deep.equal(['level 79']);
        });

        it('a rejected ioBroker write fails its own change only; the next write still runs', async () => {
            const { mapping, ioBroker } = mappingFor({ level: 50 });
            await mapping.initialize();
            ioBroker.failNextWrite = true;
            let error: unknown;
            await mapping.matterLevelControlled(100).catch(e => (error = e));
            expect(error).to.be.instanceOf(Error);
            await mapping.matterLevelControlled(200);
            expect(ioBroker.writes).to.deep.equal(['level 79']);
        });

        it('pump: On restores 100 % when CurrentLevel is the stopped level 0 (Device Library Table 4)', async () => {
            const endpoint = new FakeEndpoint(0);
            const { mapping, ioBroker } = mappingFor({ power: false, level: 0 }, endpoint, PumpLevel);
            await mapping.initialize();
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['power true', 'level 100']);
        });

        it('On with a level above 0 sets only power', async () => {
            const { mapping, ioBroker } = mappingFor({ power: false, level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['power true']);
        });

        it('Off sets power and keeps the level', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(false);
            expect(ioBroker.writes).to.deep.equal(['power false']);
        });

        it('device without power: Off sets level 0 and On restores it', async () => {
            const { mapping, ioBroker, endpoint } = mappingFor({ level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(false);
            expect(ioBroker.writes).to.deep.equal(['level 0']);
            expect(endpoint.level).to.equal(127);
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['level 0', 'level 50']);
        });

        it('read-only power: Off sets level 0 because power cannot be written', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, powerWritable: false, level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(false);
            expect(ioBroker.writes).to.deep.equal(['level 0']);
        });

        it('speaker: the caller passes "not muted" as power, so On unmutes and Off mutes', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(false);
            await mapping.matterOnOffChanged(true);
            expect(ioBroker.writes).to.deep.equal(['power false', 'power true']);
        });

        it('a level command writes the level and leaves OnOff alone while the derived value does not change', async () => {
            const { mapping, ioBroker, endpoint } = mappingFor({ power: false, level: 50 });
            await mapping.initialize();
            endpoint.onOff = undefined;
            await mapping.matterLevelControlled(254);
            expect(ioBroker.writes).to.deep.equal(['level 100']);
            expect(endpoint.onOff).to.equal(undefined);
        });

        it('a level command to 0 turns OnOff off and a level above 0 turns it on again', async () => {
            const { mapping, ioBroker, endpoint } = mappingFor({ power: true, level: 50 }, undefined, PumpLevel);
            await mapping.initialize();
            await mapping.matterLevelControlled(0);
            expect(ioBroker.writes).to.deep.equal(['level 0']);
            expect(endpoint.onOff).to.equal(false);
            await mapping.matterLevelControlled(101);
            expect(endpoint.onOff).to.equal(true);
        });

        it('writes power once for the level and On of a WithOnOff command, in either order', async () => {
            for (const levelFirst of [true, false]) {
                const { mapping, ioBroker } = mappingFor({ power: false, level: 50 });
                await mapping.initialize();
                const level = (): Promise<void> => mapping.matterLevelControlled(200);
                const on = (): Promise<void> => mapping.matterOnOffChanged(true);
                await Promise.all(levelFirst ? [level(), on()] : [on(), level()]);
                expect(ioBroker.writes, `level first: ${levelFirst}`).to.deep.equal(
                    levelFirst ? ['level 79', 'power true'] : ['power true', 'level 79'],
                );
            }
        });

        it('writes ioBroker in the order the changes arrive, also when a level write waits for the transition time', async () => {
            const { mapping, ioBroker } = mappingFor({ level: 50 });
            await mapping.initialize();
            const transitionWritten = (): Promise<void> =>
                new Promise(resolve =>
                    setTimeout(() => {
                        ioBroker.writes.push('transition');
                        resolve();
                    }, 5),
                );
            // A level event whose write waits for the transition time, then a Matter Off
            await Promise.all([
                mapping.matterLevelControlled(LightingLevel.MIN, transitionWritten),
                mapping.matterOnOffChanged(false),
            ]);
            expect(ioBroker.writes).to.deep.equal(['transition', 'level 1', 'level 0']);
        });

        it('ignores an OnOff change to the value it derives', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, level: 50 });
            await mapping.initialize();
            await mapping.matterOnOffChanged(true);
            await mapping.ioBrokerLevelChanged(0);
            await mapping.matterOnOffChanged(false);
            expect(ioBroker.writes).to.deep.equal([]);
        });

        it('device without level ignores level commands', async () => {
            const { mapping, ioBroker } = mappingFor({ power: true, hasLevel: false });
            await mapping.initialize();
            await mapping.matterLevelControlled(100);
            expect(ioBroker.writes).to.deep.equal([]);
        });
    });
});
