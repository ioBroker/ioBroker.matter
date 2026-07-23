import { expect } from 'chai';
import { resolveThreadCredential, resolveWifiCredential } from '../src/matter/credentialResolver';
import type { MatterControllerConfig } from '../src/ioBrokerTypes';

const base: MatterControllerConfig = {
    wifiSSID: 'HomeWifi',
    wifiPassword: 'secret',
    threadNetworkName: 'HomeThread',
    threadOperationalDataSet: '0e08...',
    additionalWifiCredentials: [{ id: 'guest', ssid: 'GuestWifi', password: 'guestpw' }],
    additionalThreadCredentials: [{ id: 'lab', networkName: 'LabThread', operationalDataset: 'abcd' }],
};

describe('resolveWifiCredential', () => {
    it('returns the default scalar set when id is absent', () => {
        expect(resolveWifiCredential(base)).to.deep.equal({ ssid: 'HomeWifi', password: 'secret' });
    });

    it('returns the default scalar set for id "default"', () => {
        expect(resolveWifiCredential(base, 'default')).to.deep.equal({ ssid: 'HomeWifi', password: 'secret' });
    });

    it('returns a named additional set by id', () => {
        expect(resolveWifiCredential(base, 'guest')).to.deep.equal({ ssid: 'GuestWifi', password: 'guestpw' });
    });

    it('returns undefined for an unknown id', () => {
        expect(resolveWifiCredential(base, 'nope')).to.equal(undefined);
    });

    it('returns undefined when the default set is incomplete', () => {
        expect(resolveWifiCredential({ wifiSSID: 'x' })).to.equal(undefined);
    });

    it('returns undefined when a named set is incomplete', () => {
        const cfg: MatterControllerConfig = { additionalWifiCredentials: [{ id: 'g', ssid: 'g', password: '' }] };
        expect(resolveWifiCredential(cfg, 'g')).to.equal(undefined);
    });
});

describe('resolveThreadCredential', () => {
    it('returns the default scalar set when id is absent', () => {
        expect(resolveThreadCredential(base)).to.deep.equal({
            networkName: 'HomeThread',
            operationalDataset: '0e08...',
        });
    });

    it('returns the default scalar set for id "default"', () => {
        expect(resolveThreadCredential(base, 'default')).to.deep.equal({
            networkName: 'HomeThread',
            operationalDataset: '0e08...',
        });
    });

    it('returns a named additional set by id', () => {
        expect(resolveThreadCredential(base, 'lab')).to.deep.equal({
            networkName: 'LabThread',
            operationalDataset: 'abcd',
        });
    });

    it('returns undefined for an unknown id', () => {
        expect(resolveThreadCredential(base, 'nope')).to.equal(undefined);
    });

    it('preserves legacy default behavior: empty-string scalars still resolve', () => {
        const cfg: MatterControllerConfig = { threadNetworkName: '', threadOperationalDataSet: '' };
        expect(resolveThreadCredential(cfg)).to.deep.equal({ networkName: '', operationalDataset: '' });
    });

    it('returns undefined when a named set has no dataset', () => {
        const cfg: MatterControllerConfig = {
            additionalThreadCredentials: [{ id: 'l', networkName: 'L', operationalDataset: '' }],
        };
        expect(resolveThreadCredential(cfg, 'l')).to.equal(undefined);
    });
});
