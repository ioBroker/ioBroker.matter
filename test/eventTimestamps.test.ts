import { expect } from 'chai';
import { Timestamp } from '@matter/main';
import { EventNumber, Priority } from '@matter/main/types';
import type { ChangeNotificationService } from '@matter/main/node';
import { decodedEventOf } from '../src/matter/GeneralMatterNode';

function occurrence(
    timestampKind: ChangeNotificationService.TimestampKind,
    timestamp: number,
    resolvedTimestamp?: number,
): ChangeNotificationService.OccurrenceProperties {
    return {
        number: EventNumber(7),
        priority: Priority.Info,
        timestampKind,
        timestamp: Timestamp(timestamp),
        resolvedTimestamp,
        payload: { value: 1 },
    };
}

describe('decodedEventOf', () => {
    it('reports a resolved epoch delta as the absolute epoch timestamp', () => {
        const decoded = decodedEventOf(occurrence('epoch-delta', 250, 1_700_000_000_250));
        expect(decoded).to.deep.equal({
            eventNumber: EventNumber(7),
            priority: Priority.Info,
            epochTimestamp: 1_700_000_000_250,
            data: { value: 1 },
        });
    });

    it('reports a resolved system delta as the absolute system timestamp', () => {
        const decoded = decodedEventOf(occurrence('system-delta', 40, 90_040));
        expect(decoded.systemTimestamp).to.equal(90_040);
        expect(decoded).to.not.have.property('deltaSystemTimestamp');
    });

    it('characterization: keeps the delta the peer sent when matter.js could not resolve it', () => {
        const system = decodedEventOf(occurrence('system-delta', 40));
        expect(system.deltaSystemTimestamp).to.equal(40);
        expect(system).to.not.have.property('systemTimestamp');

        const epoch = decodedEventOf(occurrence('epoch-delta', 250));
        expect(epoch.deltaEpochTimestamp).to.equal(250);
        expect(epoch).to.not.have.property('epochTimestamp');
    });

    it('reports an absolute epoch timestamp, which matter.js also resolves, as the epoch timestamp', () => {
        const decoded = decodedEventOf(occurrence('epoch', 1_700_000_000_000, 1_700_000_000_000));
        expect(decoded.epochTimestamp).to.equal(1_700_000_000_000);
        expect(decoded).to.not.have.property('systemTimestamp');
    });

    it('reports an absolute system timestamp, which matter.js also resolves, as the system timestamp', () => {
        const decoded = decodedEventOf(occurrence('system', 90_000, 90_000));
        expect(decoded.systemTimestamp).to.equal(90_000);
        expect(decoded).to.not.have.property('epochTimestamp');
    });
});
