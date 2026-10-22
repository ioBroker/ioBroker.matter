import { expect } from 'chai';
import { ClusterId } from '@matter/main';
import { BasicInformation, BridgedDeviceBasicInformation, Descriptor, OnOff } from '@matter/main/clusters';
import { changesNodeStructure, StructureRebuildTimer, type RebuildTimerHost } from '../src/matter/structureRebuild';

class FakeTimers implements RebuildTimerHost<number> {
    #now = 0;
    #nextHandle = 1;
    readonly #timers = new Map<number, { due: number; callback: () => void }>();

    now(): number {
        return this.#now;
    }

    setTimeout(callback: () => void, ms: number): number {
        const handle = this.#nextHandle++;
        this.#timers.set(handle, { due: this.#now + ms, callback });
        return handle;
    }

    clearTimeout(handle: number): void {
        this.#timers.delete(handle);
    }

    get active(): number {
        return this.#timers.size;
    }

    advance(ms: number): void {
        const until = this.#now + ms;
        for (;;) {
            let next: [number, { due: number; callback: () => void }] | undefined;
            for (const entry of this.#timers) {
                if (entry[1].due <= until && (next === undefined || entry[1].due < next[1].due)) {
                    next = entry;
                }
            }
            if (next === undefined) {
                break;
            }
            this.#timers.delete(next[0]);
            this.#now = next[1].due;
            next[1].callback();
        }
        this.#now = until;
    }
}

const timing = { settleMs: 2_000, maxDeferralMs: 10_000 };

function setup(): { timers: FakeTimers; runs: number[]; rebuild: StructureRebuildTimer<number> } {
    const timers = new FakeTimers();
    const runs = new Array<number>();
    const rebuild = new StructureRebuildTimer(timers, () => runs.push(timers.now()), timing);
    return { timers, runs, rebuild };
}

describe('StructureRebuildTimer', () => {
    it('settles for 2 s and defers at most 10 s when no timing is passed', () => {
        const timers = new FakeTimers();
        const runs = new Array<number>();
        const settled = new StructureRebuildTimer(timers, () => runs.push(timers.now()));
        settled.changed();
        timers.advance(1_999);
        expect(runs).to.deep.equal([]);
        timers.advance(1);
        expect(runs).to.deep.equal([2_000]);

        const capped = new StructureRebuildTimer(timers, () => runs.push(timers.now()));
        capped.changed();
        for (let elapsed = 0; elapsed < 12_000; elapsed += 1_000) {
            timers.advance(1_000);
            capped.reportCompleted();
        }
        expect(runs).to.deep.equal([2_000, 12_000]);
    });

    it('rebuilds once, the settle time after the first change, without any report', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        expect(rebuild.pending).to.equal(true);
        timers.advance(1_999);
        expect(runs).to.deep.equal([]);
        timers.advance(1);
        expect(runs).to.deep.equal([2_000]);
        expect(rebuild.pending).to.equal(false);
    });

    it('joins further changes into the pending rebuild', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        timers.advance(1_500);
        rebuild.changed();
        timers.advance(10_000);
        expect(runs).to.deep.equal([2_000]);
    });

    it('waits the settle time after each completed report batch', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        timers.advance(1_500);
        rebuild.reportCompleted();
        timers.advance(1_500);
        rebuild.reportCompleted();
        timers.advance(1_999);
        expect(runs).to.deep.equal([]);
        timers.advance(1);
        expect(runs).to.deep.equal([5_000]);
        expect(timers.active).to.equal(0);
    });

    it('rebuilds at the cap after the first change even while reports keep coming', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        for (let elapsed = 0; elapsed < 12_000; elapsed += 1_000) {
            timers.advance(1_000);
            rebuild.reportCompleted();
        }
        expect(runs).to.deep.equal([10_000]);
    });

    it('does not let a report shortly before the cap move the rebuild past it', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        for (let elapsed = 0; elapsed < 9_500; elapsed += 1_900) {
            timers.advance(1_900);
            rebuild.reportCompleted();
        }
        timers.advance(5_000);
        expect(runs).to.deep.equal([10_000]);
    });

    it('ignores a report while nothing is pending', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.reportCompleted();
        expect(rebuild.pending).to.equal(false);
        expect(timers.active).to.equal(0);
        timers.advance(20_000);
        expect(runs).to.deep.equal([]);
    });

    it('starts a new window for a change after a rebuild', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        timers.advance(2_000);
        rebuild.reportCompleted();
        timers.advance(1_000);
        rebuild.changed();
        timers.advance(2_000);
        expect(runs).to.deep.equal([2_000, 5_000]);
    });

    it('drops the pending rebuild on cancel and accepts a new change afterwards', () => {
        const { timers, runs, rebuild } = setup();
        rebuild.changed();
        timers.advance(1_000);
        rebuild.cancel();
        expect(rebuild.pending).to.equal(false);
        expect(timers.active).to.equal(0);
        rebuild.reportCompleted();
        timers.advance(20_000);
        expect(runs).to.deep.equal([]);

        rebuild.changed();
        timers.advance(2_000);
        expect(runs).to.deep.equal([23_000]);
    });

    it('leaves nothing pending when the host refuses a timer', () => {
        const runs = new Array<number>();
        const rebuild = new StructureRebuildTimer<number>(
            { now: () => 0, setTimeout: () => undefined, clearTimeout: () => undefined },
            () => runs.push(0),
            timing,
        );
        rebuild.changed();
        expect(rebuild.pending).to.equal(false);
    });

    it('leaves nothing pending when the host refuses the timer of an extension', () => {
        const timers = new FakeTimers();
        let refuse = false;
        const rebuild = new StructureRebuildTimer<number>(
            {
                now: () => timers.now(),
                setTimeout: (callback, ms) => (refuse ? undefined : timers.setTimeout(callback, ms)),
                clearTimeout: handle => timers.clearTimeout(handle),
            },
            () => undefined,
            timing,
        );
        rebuild.changed();
        refuse = true;
        rebuild.reportCompleted();
        expect(rebuild.pending).to.equal(false);
        expect(timers.active).to.equal(0);
    });
});

describe('changesNodeStructure', () => {
    it('is true for a changed Descriptor deviceTypeList', () => {
        expect(changesNodeStructure(Descriptor.id, ['deviceTypeList'])).to.equal(true);
        expect(changesNodeStructure(Descriptor.id, ['tagList', 'deviceTypeList'])).to.equal(true);
    });

    it('is true for a Descriptor update that names no properties', () => {
        expect(changesNodeStructure(Descriptor.id, undefined)).to.equal(true);
    });

    it('is false for the Descriptor lists the endpoint lifecycle already reports or the mapping does not read', () => {
        expect(changesNodeStructure(Descriptor.id, ['partsList', 'serverList', 'clientList', 'tagList'])).to.equal(
            false,
        );
    });

    it('is false for other clusters, also with a property of the same name', () => {
        expect(changesNodeStructure(BasicInformation.id, ['vendorName', 'nodeLabel'])).to.equal(false);
        expect(changesNodeStructure(BridgedDeviceBasicInformation.id, ['nodeLabel'])).to.equal(false);
        expect(changesNodeStructure(OnOff.id, ['deviceTypeList'])).to.equal(false);
        expect(changesNodeStructure(ClusterId(0xfff1fc00), undefined)).to.equal(false);
    });
});
