import { expect } from 'chai';
import { dstWindows, offsetSecondsAt, resolveHostTimeZone, standardOffsetSeconds } from '../src/matter/timeSync/hostTimeZone';

const JAN_2026 = Date.UTC(2026, 0, 15);
const JUL_2026 = Date.UTC(2026, 6, 1);

describe('hostTimeZone', () => {
    describe('offsetSecondsAt', () => {
        it('returns the total offset including DST', () => {
            expect(offsetSecondsAt('Europe/Berlin', JAN_2026)).to.equal(3600); // CET
            expect(offsetSecondsAt('Europe/Berlin', JUL_2026)).to.equal(7200); // CEST
            expect(offsetSecondsAt('America/Phoenix', JUL_2026)).to.equal(-25200); // no DST
        });

        it('floors sub-second instants and handles a negative epoch', () => {
            // Non-second-aligned instant still yields the whole-second offset.
            expect(offsetSecondsAt('Europe/Berlin', JUL_2026 + 500)).to.equal(7200);
            // Negative epoch (1969-12-31 23:59:58.5 UTC), Berlin was on standard time (CET).
            expect(offsetSecondsAt('Europe/Berlin', -1500)).to.equal(3600);
        });
    });

    describe('standardOffsetSeconds', () => {
        it('returns the non-DST base offset in both hemispheres', () => {
            expect(standardOffsetSeconds('Europe/Berlin', JUL_2026)).to.equal(3600);
            expect(standardOffsetSeconds('Australia/Sydney', JAN_2026)).to.equal(36000); // AEST base
            expect(standardOffsetSeconds('America/Phoenix', JUL_2026)).to.equal(-25200);
        });

        it('returns the base offset when atMs is mid-DST', () => {
            expect(standardOffsetSeconds('Europe/Berlin', Date.UTC(2026, 3, 15))).to.equal(3600);
            expect(standardOffsetSeconds('America/New_York', Date.UTC(2026, 4, 1))).to.equal(-18000);
        });

        it('uses the current regime after a permanent standard-offset change', () => {
            // Europe/Istanbul abolished DST on 2016-09-07, moving permanently to +03:00.
            // Sampling Jan+Jul of 2016 straddles the switch and would wrongly return the
            // pre-switch +02:00 base; the offset after the switch is a permanent +03:00.
            expect(standardOffsetSeconds('Europe/Istanbul', Date.UTC(2016, 10, 1))).to.equal(10800);
        });
    });

    describe('dstWindows', () => {
        it('returns the upcoming DST windows for a northern-hemisphere zone', () => {
            const windows = dstWindows('Europe/Berlin', JAN_2026, 2);
            expect(windows.length).to.equal(2);
            expect(windows[0].offsetSeconds).to.equal(3600);
            // DST 2026 begins 2026-03-29 01:00 UTC, ends 2026-10-25 01:00 UTC
            expect(windows[0].validStartingMs).to.equal(Date.UTC(2026, 2, 29, 1, 0, 0));
            expect(windows[0].validUntilMs).to.equal(Date.UTC(2026, 9, 25, 1, 0, 0));
            // DST 2027 begins 2027-03-28 01:00 UTC, ends 2027-10-31 01:00 UTC
            expect(windows[1].validStartingMs).to.equal(Date.UTC(2027, 2, 28, 1, 0, 0));
            expect(windows[1].validUntilMs).to.equal(Date.UTC(2027, 9, 31, 1, 0, 0));
        });

        it('reports a permanent adoption of the higher offset as an open-ended window', () => {
            // Turkey stayed on EEST (+03) after 2016-03-27 instead of falling back that autumn,
            // so the segment starting there has no closing transition.
            const windows = dstWindows('Europe/Istanbul', Date.UTC(2016, 0, 15), 2);
            expect(windows.length).to.equal(1);
            expect(windows[0].offsetSeconds).to.equal(3600);
            expect(windows[0].validStartingMs).to.equal(Date.UTC(2016, 2, 27, 1, 0, 0));
            expect(windows[0].validUntilMs).to.equal(null);
        });

        it('returns the currently-active window when already in DST', () => {
            const windows = dstWindows('Europe/Berlin', JUL_2026, 2);
            expect(windows.length).to.be.greaterThan(0);
            expect(windows[0].validStartingMs).to.equal(Date.UTC(2026, 2, 29, 1, 0, 0));
            expect(windows[0].validUntilMs).to.equal(Date.UTC(2026, 9, 25, 1, 0, 0));
        });

        it('still covers a DST period that began more than 200 days before fromMs', () => {
            // US DST runs 238 days. Late in it, the opening transition is far behind fromMs —
            // if the backward scan misses it, no emitted window covers "now" and the node is
            // told it is on standard time while the wall clock is on DST.
            const lateInDst = Date.UTC(2026, 9, 1, 12);
            for (const zone of ['America/New_York', 'Europe/Berlin', 'Africa/Casablanca']) {
                const windows = dstWindows(zone, lateInDst, 2);
                const active = windows.find(
                    w => w.validStartingMs <= lateInDst && (w.validUntilMs === null || w.validUntilMs > lateInDst),
                );
                const pushedOffset = standardOffsetSeconds(zone, lateInDst) + (active?.offsetSeconds ?? 0);
                expect(pushedOffset, zone).to.equal(offsetSecondsAt(zone, lateInDst));
            }
        });

        it('returns an empty list for a zone without DST', () => {
            expect(dstWindows('America/Phoenix', JAN_2026, 2)).to.deep.equal([]);
        });

        it('respects the max cap', () => {
            expect(dstWindows('Europe/Berlin', JUL_2026, 1).length).to.equal(1);
            expect(dstWindows('Europe/Berlin', JAN_2026, 0)).to.deep.equal([]);
        });

        it('returns the currently-active window for a southern-hemisphere zone spanning New Year', () => {
            const windows = dstWindows('Australia/Sydney', JAN_2026, 2);
            expect(windows.length).to.be.greaterThan(0);
            expect(windows[0].offsetSeconds).to.equal(3600);
            expect(windows[0].validStartingMs).to.be.lessThan(JAN_2026);
            expect(windows[0].validUntilMs).to.be.greaterThan(JAN_2026);
        });
    });

    describe('resolveHostTimeZone', () => {
        it('returns a non-empty IANA zone string', () => {
            expect(resolveHostTimeZone().length).to.be.greaterThan(0);
        });
    });
});
