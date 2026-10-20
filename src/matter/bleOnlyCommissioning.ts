import { causedBy } from '@matter/main';
import { PairRetransmissionLimitReachedError } from '@matter/main/protocol';

/**
 * Turn the failure of commissioning a device whose QR code offers BLE only, on a host without BLE, into an error
 * that says why. Returns undefined when the failure is not "device not reachable", so the original error is kept.
 *
 * Such a QR code does not mean the device is off the network: the ioBroker Visu app hands it over after the phone
 * already put the device on the network over BLE. So the IP network is searched anyway, and only a device that
 * never answers there gets this explanation.
 */
export function explainBleOnlyCommissioningFailure(error: unknown): Error | undefined {
    if (!causedBy(error, PairRetransmissionLimitReachedError)) {
        return undefined;
    }
    return new Error(
        'The device was not found on the IP network. Its QR code offers only BLE and this host has no BLE. Add the device to a phone ecosystem first (e.g. Apple Home or Google Home) and pair it here with a new pairing code from there, or enable BLE on the host.',
        { cause: error },
    );
}
