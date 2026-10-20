import { toJson } from '@matter/main';
import type { CertificateAuthority, Fabric } from '@matter/main/protocol';

/** Wire shape of the "controllerInitializePaseCommissioner" response, decodable with matter.js `fromJson()`. */
export interface PaseCommissionerConfigWire {
    rootCertificateData: string;
    fabricData: string;
}

/**
 * Encode the controller's PASE commissioner config for the ioBroker message bus. The config holds bigint
 * (rootCertId, fabricId, nodeId, ...) and Uint8Array values that plain JSON can not carry, so each part is
 * stringified with matter.js `toJson()`, which the mobile app reverses losslessly with `fromJson()`.
 */
export function encodePaseCommissionerConfig(config: {
    caConfig: CertificateAuthority.Configuration;
    fabricData: Fabric.SyncConfig;
}): PaseCommissionerConfigWire {
    return {
        rootCertificateData: toJson(config.caConfig),
        fabricData: toJson(config.fabricData),
    };
}
