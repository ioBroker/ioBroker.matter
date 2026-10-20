import { expect } from 'chai';
import { Bytes, FabricId, FabricIndex, NodeId, VendorId, fromJson } from '@matter/main';
import type { CertificateAuthority, Fabric } from '@matter/main/protocol';
import { encodePaseCommissionerConfig } from '../src/matter/paseCommissionerConfig';

const caConfig = {
    rootCertId: 1n,
    rootKeyIdentifier: Bytes.fromHex('0102'),
    rootCertBytes: Bytes.fromHex('a1b2c3'),
    nextCertificateId: 2n,
    rootKeyPair: { publicKey: Bytes.fromHex('04ff'), privateKey: Bytes.fromHex('aa') },
} as unknown as CertificateAuthority.Configuration;

const fabricData = {
    fabricIndex: FabricIndex(1),
    fabricId: FabricId(0x1234_5678_9abc_def0n),
    nodeId: NodeId(0xffff_ffff_ffff_0001n),
    rootNodeId: NodeId(1n),
    rootVendorId: VendorId(0xfff1),
    rootCert: Bytes.fromHex('a1b2c3'),
    identityProtectionKey: Bytes.fromHex('0f0e'),
    intermediateCACert: undefined,
    operationalCert: Bytes.fromHex('d4e5'),
    label: 'ioBroker',
    operationalIdentityProtectionKey: Bytes.fromHex('0d0c'),
    globalId: 0x0102_0304_0506_0708n,
} as unknown as Fabric.SyncConfig;

describe('encodePaseCommissionerConfig', () => {
    it('produces a payload that survives JSON serialization', () => {
        expect(() => JSON.stringify({ rootCertificateData: caConfig, fabricData })).to.throw(TypeError);

        const wire = encodePaseCommissionerConfig({ caConfig, fabricData });

        expect(() => JSON.stringify(wire)).not.to.throw();
        expect(wire.rootCertificateData).to.be.a('string');
        expect(wire.fabricData).to.be.a('string');
    });

    it('round-trips bigint and byte values through fromJson()', () => {
        const wire = JSON.parse(JSON.stringify(encodePaseCommissionerConfig({ caConfig, fabricData })));

        const ca = fromJson(wire.rootCertificateData) as Record<string, unknown>;
        expect(ca.rootCertId).to.equal(1n);
        expect(ca.nextCertificateId).to.equal(2n);
        expect(Bytes.toHex(ca.rootCertBytes as Bytes)).to.equal('a1b2c3');

        const fabric = fromJson(wire.fabricData) as Record<string, unknown>;
        expect(fabric.fabricId).to.equal(0x1234_5678_9abc_def0n);
        expect(fabric.nodeId).to.equal(0xffff_ffff_ffff_0001n);
        expect(fabric.globalId).to.equal(0x0102_0304_0506_0708n);
        expect(fabric.fabricIndex).to.equal(1);
        expect(Bytes.toHex(fabric.operationalCert as Bytes)).to.equal('d4e5');
        expect(fabric.label).to.equal('ioBroker');
    });
});
