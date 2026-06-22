import ChannelDetector from '@iobroker/type-detector';
import { WindowCovering } from '@matter/main/clusters';
import { WindowCoveringClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import { Blind } from '../../lib/devices/Blind';
import { BlindButtons } from '../../lib/devices/BlindButtons';
import type { MatterAdapter } from '../../main';

export class WindowCoveringToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Blind | BlindButtons;
    #maintenanceState: { operational: boolean; maintenance: boolean } = { operational: false, maintenance: false };

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
        );

        const wcFeatures = this.appEndpoint.behaviors.typeFor(WindowCoveringClient)?.features;
        if (wcFeatures?.positionAwareLift || wcFeatures?.positionAwareTilt) {
            this.#ioBrokerDevice = new Blind(
                { ...ChannelDetector.getPatterns().blinds, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableDeviceTypeStates(),
            );
        } else {
            this.#ioBrokerDevice = new BlindButtons(
                { ...ChannelDetector.getPatterns().blindButtons, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableDeviceTypeStates(),
            );
        }
    }

    async updateWorkingStateForLift(currentLiftValue: number | null): Promise<void> {
        const targetValue = this.appEndpoint.maybeStateOf(WindowCoveringClient)?.targetPositionLiftPercent100ths;
        if (
            typeof targetValue === 'number' &&
            typeof currentLiftValue !== 'number' &&
            targetValue !== currentLiftValue
        ) {
            await this.ioBrokerDevice.updateWorking(true);
        }
    }

    async updateWorkingStateForTilt(currentTiltValue: number | null): Promise<void> {
        const targetValue = this.appEndpoint.maybeStateOf(WindowCoveringClient)?.targetPositionTiltPercent100ths;
        if (
            typeof targetValue === 'number' &&
            typeof currentTiltValue == 'number' &&
            targetValue !== currentTiltValue
        ) {
            await this.ioBrokerDevice.updateWorking(true);
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const features = this.appEndpoint.behaviors.typeFor(WindowCoveringClient)?.features;

        this.enableDeviceTypeStateForAttribute(PropertyType.Maintenance, {
            endpointId: this.appEndpoint.number,
            clusterId: WindowCovering.id,
            attributeName: 'configStatus',
            convertValue: (value: WindowCovering.ConfigStatus) => {
                this.#maintenanceState.operational = !!value.operational;
                return this.#maintenanceState.maintenance || !this.#maintenanceState.operational;
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.number,
            clusterId: WindowCovering.id,
            attributeName: 'mode',
            matterValueChanged: (value: WindowCovering.Mode) => {
                this.#maintenanceState.maintenance = !!value.maintenanceMode;
                this.ioBrokerDevice
                    .updateMaintenance(this.#maintenanceState.maintenance || !this.#maintenanceState.operational)
                    .catch(e => this.ioBrokerDevice.adapter.log.error(`Failed to update maintenance state: ${e}`));
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Working, {
            endpointId: this.appEndpoint.number,
            clusterId: WindowCovering.id,
            attributeName: 'operationalStatus',
            convertValue: (value: WindowCovering.OperationalStatus) =>
                value.global !== WindowCovering.MovementStatus.Stopped,
        });
        // TODO introduce value.direction once in type definition
        /*this.enableDeviceTypeStateForAttribute(PropertyType.Direction, {
            endpointId: this.appEndpoint.number,
            clusterId: WindowCovering.id,
            attributeName: 'configStatus',
            convertValue: (value: TypeFromBitSchema<typeof WindowCovering.OperationalStatus>) => {
                return value.global !== WindowCovering.MovementStatus.Stopped;
            },
        });*/

        if (features?.lift) {
            this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
                endpointId: this.appEndpoint.number,
                clusterId: WindowCovering.id,
                attributeName: 'currentPositionLiftPercent100ths',
                convertValue: value => {
                    this.updateWorkingStateForLift(value).catch(e =>
                        this.ioBrokerDevice.adapter.log.error(`Failed to update working state: ${e}`),
                    );
                    return 100 - Math.round(value / 100);
                },
                changeHandler: async value => {
                    if (!features?.positionAwareLift) {
                        throw new Error('Position aware lift not supported. Can not set lift target percentage');
                    }
                    await this.appEndpoint.commandsOf(WindowCoveringClient)?.goToLiftPercentage({
                        liftPercent100thsValue: Math.round(100 - value) * 100,
                    });
                },
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.LevelActual, {
                endpointId: this.appEndpoint.number,
                clusterId: WindowCovering.id,
                attributeName: 'currentPositionLiftPercent100ths',
                convertValue: value => 100 - Math.round(value / 100),
            });

            this.enableDeviceTypeStateForAttribute(PropertyType.Stop, {
                changeHandler: async value => {
                    if (!value) {
                        return;
                    }
                    await this.appEndpoint.commandsOf(WindowCoveringClient)?.stopMotion();
                },
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Open, {
                changeHandler: async value => {
                    if (!value) {
                        return;
                    }
                    await this.appEndpoint.commandsOf(WindowCoveringClient)?.upOrOpen();
                },
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Close, {
                changeHandler: async value => {
                    if (!value) {
                        return;
                    }
                    await this.appEndpoint.commandsOf(WindowCoveringClient)?.downOrClose();
                },
            });
        }

        if (features?.tilt) {
            this.enableDeviceTypeStateForAttribute(PropertyType.TiltLevel, {
                endpointId: this.appEndpoint.number,
                clusterId: WindowCovering.id,
                attributeName: 'currentPositionTiltPercent100ths',
                convertValue: value => {
                    this.updateWorkingStateForTilt(value).catch(e =>
                        this.ioBrokerDevice.adapter.log.error(`Failed to update working state: ${e}`),
                    );
                    return 100 - Math.round(value / 100);
                },
                changeHandler: async value => {
                    if (!features?.positionAwareTilt) {
                        throw new Error('Position aware tilt not supported. Can not set tilt target percentage');
                    }
                    await this.appEndpoint.commandsOf(WindowCoveringClient)?.goToTiltPercentage({
                        tiltPercent100thsValue: Math.round(100 - value) * 100,
                    });
                },
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.TiltLevelActual, {
                endpointId: this.appEndpoint.number,
                clusterId: WindowCovering.id,
                attributeName: 'currentPositionTiltPercent100ths',
                convertValue: value => 100 - Math.round(value / 100),
            });
        }

        return super.enableDeviceTypeStates();
    }

    override async init(): Promise<void> {
        await super.init();

        const windowCovering = this.appEndpoint.maybeStateOf(WindowCoveringClient);
        if (windowCovering !== undefined) {
            this.#maintenanceState = {
                maintenance: !!(
                    windowCovering.mode ?? {
                        maintenanceMode: true,
                    }
                ).maintenanceMode,
                operational: !!(
                    windowCovering.configStatus ?? {
                        operational: true,
                    }
                ).operational,
            };
        }
    }

    get ioBrokerDevice(): Blind | BlindButtons {
        return this.#ioBrokerDevice;
    }
}
