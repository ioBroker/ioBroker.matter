import ChannelDetector, {
    type DetectorState,
    type DetectOptions,
    type PatternControl,
    Types,
} from '@iobroker/type-detector';
import type { DetectedDevice } from './devices/GenericDevice';

/**
 * The part of the adapter API the detection needs. Declared structurally so `MatterAdapter` satisfies it
 * without a cast and tests can serve an exported object tree instead of a running js-controller.
 */
export interface DetectionObjectProvider {
    getForeignObjectAsync(id: string): ioBroker.GetObjectPromise;
    getObjectViewAsync(
        design: string,
        search: string,
        params: ioBroker.GetObjectViewParams | null,
    ): ioBroker.GetObjectViewPromise<ioBroker.Object>;
    log: {
        debug(message: string): void;
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
}

/** Name of the single state a device of that type falls back to when nothing could be detected. */
const DEVICE_DEFAULT_NAME: Partial<Record<Types, string>> = {
    [Types.airCondition]: 'SET',
    [Types.airPurifier]: 'SPEED',
    [Types.airQuality]: 'AQI',
    [Types.blindButtons]: 'STOP',
    [Types.blind]: 'SET',
    [Types.buttonSensor]: 'PRESS',
    [Types.button]: 'SET',
    [Types.camera]: 'URL',
    [Types.cie]: 'CIE',
    [Types.coAlarm]: 'ACTUAL',
    [Types.contact]: 'ACTUAL',
    [Types.ct]: 'TEMPERATURE',
    [Types.dimmer]: 'SET',
    [Types.door]: 'ACTUAL',
    [Types.electricity]: 'ELECTRIC_POWER',
    [Types.fan]: 'SPEED',
    [Types.fireAlarm]: 'ACTUAL',
    [Types.floodAlarm]: 'ACTUAL',
    [Types.flow]: 'FLOW',
    [Types.gate]: 'SET',
    [Types.hue]: 'HUE',
    [Types.humidity]: 'ACTUAL',
    [Types.illuminance]: 'ACTUAL',
    [Types.image]: 'URL',
    [Types.info]: 'ACTUAL',
    [Types.light]: 'SET',
    [Types.lock]: 'SET',
    [Types.media]: 'PLAY',
    [Types.motion]: 'ACTUAL',
    [Types.rgbSingle]: 'RGB',
    [Types.rgbwSingle]: 'RGBW',
    [Types.slider]: 'SET',
    [Types.percentage]: 'SET',
    [Types.pressure]: 'PRESSURE',
    [Types.pump]: 'POWER',
    [Types.socket]: 'SET',
    [Types.temperature]: 'ACTUAL',
    [Types.thermostat]: 'SET',
    [Types.vacuumCleaner]: 'POWER',
    [Types.volume]: 'SET',
    [Types.volumeGroup]: 'SET',
    [Types.warning]: 'INFO',
    [Types.weatherCurrent]: 'ACTUAL',
    [Types.weatherForecast]: 'STATE',
    [Types.window]: 'ACTUAL',
    [Types.windowTilt]: 'ACTUAL',
};

interface DeviceControl {
    states: { id?: string }[];
}

/**
 * Pick which detected device patterns are eligible for a configured object id.
 *
 * When the user selected a concrete state (`selectedId !== deviceId`), that exact state must be the
 * controlled one - otherwise a same-role sibling sharing the primary slot would be used instead
 * (ioBroker/ioBroker.matter#594, #730). Returns `null` when such a state is not part of any detected
 * device, signalling the caller to build a single-state device for exactly that state.
 *
 * When a whole device/channel was selected (`selectedId === deviceId`), the broad auto-detection
 * result is kept (patterns containing the id, or all detected patterns as fallback).
 */
export function selectControlsForState<T extends DeviceControl>(
    controls: T[],
    selectedId: string,
    deviceId: string,
): T[] | null {
    const containing = controls.filter(control => control.states.some(({ id }) => id === selectedId));

    if (selectedId === deviceId) {
        return containing.length ? containing : controls;
    }

    if (!containing.length) {
        return null;
    }

    // Prefer a pattern where the selected state is the main (first id-bearing) state so a same-role
    // sibling cannot take over; otherwise keep every pattern that maps the state (secondary slot of a
    // multi-state device, e.g. the on/off state of a color device).
    const asMainState = containing.filter(control => control.states.find(({ id }) => id)?.id === selectedId);
    return asMainState.length ? asMainState : containing;
}

/**
 * Walk up from a configured object id to the device, channel or folder that groups its states.
 *
 * @param provider object access
 * @param id the configured object id
 * @param searchDeviceComingFromLevel level the recursion started from; only set by the recursion itself
 */
export async function findDeviceFromId(
    provider: DetectionObjectProvider,
    id: string,
    searchDeviceComingFromLevel?: number,
): Promise<string | null> {
    const obj = await provider.getForeignObjectAsync(id);
    if (!obj || obj.type === 'meta') {
        // Object does not exist
        return null;
    }
    if (obj.type === 'device' || obj.type === 'channel') {
        // Because it seems we are also fine with just a channel or meta as root return also then
        // We found a device object, use this
        return id;
    }
    const parts = id.split('.');
    if (parts.length === 1) {
        return null; // should never happen, we ran onto instance level
    }
    if (parts.length === 2) {
        // Check if the device search originator comes from one level below, else we found nothing
        if (searchDeviceComingFromLevel !== undefined && searchDeviceComingFromLevel !== 3) {
            return null;
        }
        // we can not go higher because we found the namespace root, let's assume a "one device adapter"
        return id;
    }

    parts.pop();
    const upperLevelObjectId = parts.join('.');

    const foundDevice = await findDeviceFromId(
        provider,
        upperLevelObjectId,
        searchDeviceComingFromLevel ?? parts.length + 1,
    );
    if (foundDevice === null) {
        const upperObj = await provider.getForeignObjectAsync(upperLevelObjectId);
        if (upperObj && upperObj.type === 'folder') {
            return upperLevelObjectId;
        }

        if (obj.type === 'state') {
            return id;
        }
        // ok we did not find anything better, go back
        return null;
    }
    return foundDevice;
}

/**
 * Run the ioBroker type detector over the object tree around a configured id.
 *
 * @param provider object access
 * @param id the configured object id
 * @param preferredType the device type configured for it, if any
 */
export async function getIoBrokerDeviceStates(
    provider: DetectionObjectProvider,
    id: string,
    preferredType?: string,
): Promise<DetectedDevice | null> {
    const deviceId = await findDeviceFromId(provider, id);
    provider.log.debug(`Handle device for ${id}: ${deviceId}, preferred type: ${preferredType}`);
    if (!deviceId) {
        return null;
    }
    const obj = await provider.getForeignObjectAsync(deviceId);
    if (!obj) {
        return null;
    }
    const states = await provider.getObjectViewAsync('system', 'state', {
        startkey: `${deviceId}.`,
        endkey: `${deviceId}.\u9999`,
    });
    const objects: Record<string, ioBroker.Object> = { [obj._id]: obj };
    for (const state of states.rows) {
        if (state.value) {
            objects[state.id] = state.value;
            provider.log.debug(
                `    Found state ${state.id}: type=${state.value.common.type}, role=${state.value.common.role}, read=${state.value.common.read}, write=${state.value.common.write}, min=${state.value.common.min}, max=${state.value.common.max}, unit=${state.value.common.unit}`,
            );
        }
    }

    // `detect` caches its pattern list on the options object and marks every pattern it checked there, so an
    // attempt handed a used options object can only report nothing.
    const detectOptions = (allowedTypes?: Types[], detectAllPossibleDevices?: boolean): DetectOptions => ({
        objects,
        id: deviceId, // Channel, device or state, that must be detected
        _keysOptional: Object.keys(objects),
        _usedIdsOptional: new Array<string>(), // Do not allow to use the same ID in more than one device
        ignoreIndicators: ['UNREACH_STICKY'], // Ignore indicators by name
        excludedTypes: [Types.info],
        allowedTypes,
        detectAllPossibleDevices,
        ignoreCache: true,
        ignoreEnums: true,
    });

    let controls = new ChannelDetector().detect(detectOptions(preferredType ? [preferredType as Types] : undefined));
    if (!controls?.length) {
        controls = new ChannelDetector().detect(detectOptions(undefined, true));
    }
    if (controls?.length) {
        const controlsToCheck = selectControlsForState(controls, id, deviceId);
        if (!controlsToCheck) {
            provider.log.debug(
                `Selected state ${id} is not part of any detected device under ${deviceId}; use it as a single-state device.`,
            );
            return null;
        }
        provider.log.debug(
            `Found ${controlsToCheck.length} device types mapping ${id} in ${deviceId}: ${JSON.stringify(controlsToCheck)}`,
        );
        let controlsWithType = controlsToCheck;
        if (preferredType) {
            controlsWithType = controlsToCheck.filter((control: PatternControl) => control.type === preferredType);
            if (controlsWithType.length) {
                provider.log.debug(
                    `Found ${controlsWithType.length} device types for ${id} with preferred type ${preferredType}: ${JSON.stringify(
                        controlsWithType,
                    )}`,
                );
            } else {
                controlsWithType = controlsToCheck;
            }
        }
        provider.log.debug(
            `Found ${controlsWithType.length} device types for ${deviceId} : ${JSON.stringify(controlsWithType)}`,
        );
        const mainState = controlsWithType[0].states.find((state: DetectorState) => state.id);
        if (mainState?.id) {
            if (preferredType && controlsWithType[0].type !== preferredType) {
                provider.log.warn(
                    `Type detection mismatch for state ${mainState.id}: ${controlsWithType[0].type} !== ${preferredType}.`,
                );
            }
            controlsWithType[0].states = controlsWithType[0].states.filter((state: DetectorState) => state.id);

            return {
                ...controlsWithType[0],
                isIoBrokerDevice: true,
            };
        }
    } else {
        provider.log.info(`No IoBroker device type found for ${deviceId}`);
    }

    return null;
}

/**
 * Resolve a configured bridge or device entry into the device the adapter exposes for it: the detected
 * multi-state device when detection agrees with the configured type, else the configured state alone.
 *
 * @param provider object access
 * @param oid the configured object id
 * @param type the configured device type
 * @param auto whether the user asked for auto detection
 */
export async function determineIoBrokerDevice(
    provider: DetectionObjectProvider,
    oid: string,
    type: string,
    auto: boolean,
): Promise<DetectedDevice | null> {
    const obj = await provider.getForeignObjectAsync(oid);
    if (!obj) {
        return null; // The configured object does not exist
    }
    if (!auto && (obj.type === 'device' || obj.type === 'channel')) {
        // Fix for wrong UI currently that sets auto to false when channel or device is selected
        auto = true;
        provider.log.debug(`Enable auto detection for ${oid} with type ${type} because object is ${obj.type}`);
    }

    const detectedDevice = auto ? await getIoBrokerDeviceStates(provider, oid, type) : null;
    if (detectedDevice && detectedDevice.type === type) {
        return detectedDevice;
    }
    if (obj.type !== 'state') {
        // No usable detection and the configured object is not a state, so there is nothing to expose
        provider.log.error(
            `Could not auto-detect a "${type}" device for ${oid} and it is no state. Check configuration.`,
        );
        return null;
    }
    if (detectedDevice && detectedDevice.type !== type) {
        provider.log.error(
            `Type detection mismatch for state ${oid}: ${detectedDevice.type} !== ${type}. Initialize device with just this one state.`,
        );
    } else {
        provider.log.debug(`No auto detection for ${oid} with type ${type} ... fallback to single ${type} state`);
    }
    // ignore all detected states and use only the explicitly configured one
    return {
        type: type as Types,
        states: [
            {
                name: DEVICE_DEFAULT_NAME[type as Types] || 'SET',
                id: oid,
                // type: StateType.Number, // ignored
                write: true, // ignored
                defaultRole: 'button', // ignored
                required: true, // ignored
            },
        ],
        isIoBrokerDevice: true,
    };
}
