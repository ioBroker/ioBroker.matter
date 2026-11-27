import { type Behavior, Endpoint } from '@matter/main';
import { FanDevice } from '@matter/main/devices';
import { OnOffServer } from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Fan } from '../../lib/devices/Fan';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { IoFanControlServer } from '../behaviors/IoFanControlServer';
import { FanControlMapping, type FanControlInitialState, type IoBrokerFanStates } from './FanControlMapping';

const IoFanDevice = FanDevice.with(IoIdentifyServer, IoBrokerContext);
const IoFanDeviceWithOnOff = FanDevice.with(OnOffServer, IoIdentifyServer, IoBrokerContext);

/**
 * Builds the endpoint that carries the FanControl cluster. Device types that embed a fan supply their own so the
 * mapping logic can be shared without the base class knowing the concrete Matter device type.
 */
export type FanEndpointFactory = (fanControlServer: Behavior.Type, fanControlInit: FanControlInitialState) => Endpoint;

/** Mapping Logic to map an ioBroker Fan device to a Matter FanDevice. */
export class FanToMatter<T extends Fan = Fan> extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: T;
    readonly #matterEndpoint: Endpoint;
    readonly #fanControlServer;
    readonly #fanControl: FanControlMapping;
    readonly #hasOnOff: boolean;

    constructor(ioBrokerDevice: T, name: string, uuid: string, createEndpoint?: FanEndpointFactory) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        this.#hasOnOff = ioBrokerDevice.hasPower();

        const fanStates: IoBrokerFanStates = {
            power: this.#hasOnOff
                ? { get: () => ioBrokerDevice.getPower(), set: on => ioBrokerDevice.setPower(on) }
                : undefined,
            speed: ioBrokerDevice.hasSpeed()
                ? {
                      modes: ioBrokerDevice.getSpeedModes(),
                      get: () => ioBrokerDevice.getSpeed(),
                      set: speed => ioBrokerDevice.setSpeed(speed),
                  }
                : undefined,
            speedLevel: ioBrokerDevice.hasSpeedLevel()
                ? {
                      get: () => ioBrokerDevice.getSpeedLevel(),
                      set: percent => ioBrokerDevice.setSpeedLevel(percent),
                  }
                : undefined,
            swing: ioBrokerDevice.hasSwing()
                ? {
                      modes: ioBrokerDevice.getSwingModes(),
                      get: () => ioBrokerDevice.getSwing(),
                      set: swing => ioBrokerDevice.setSwing(swing),
                  }
                : undefined,
            airflowDirection: ioBrokerDevice.hasAirflowDirection()
                ? {
                      get: () => ioBrokerDevice.getAirflowDirection(),
                      set: direction => ioBrokerDevice.setAirflowDirection(direction),
                  }
                : undefined,
        };
        this.#fanControlServer = IoFanControlServer.with(...FanControlMapping.featuresFor(fanStates));
        this.#fanControl = new FanControlMapping(
            fanStates,
            {
                fanMode: () => this.#matterEndpoint.stateOf(this.#fanControlServer).fanMode,
                percentSetting: () => this.#matterEndpoint.stateOf(this.#fanControlServer).percentSetting,
                set: values => this.#matterEndpoint.setStateOf(this.#fanControlServer, values),
                setOnOff: this.#hasOnOff
                    ? on => this.#matterEndpoint.setStateOf(OnOffServer, { onOff: on })
                    : undefined,
            },
            {
                debug: message => ioBrokerDevice.adapter.log.debug(`${uuid}: ${message}`),
                info: message => ioBrokerDevice.adapter.log.info(`${uuid}: ${message}`),
            },
        );
        const fanControlInit = this.#fanControl.initialState;

        this.#matterEndpoint = createEndpoint
            ? createEndpoint(this.#fanControlServer, fanControlInit)
            : new Endpoint(
                  this.#hasOnOff
                      ? IoFanDeviceWithOnOff.with(this.#fanControlServer)
                      : IoFanDevice.with(this.#fanControlServer),
                  {
                      id: `${uuid}-Fan`,
                      ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                      fanControl: fanControlInit,
                  },
              );

        this.addElectricityDataClusters(this.#matterEndpoint, ioBrokerDevice);
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): T {
        return this.#ioBrokerDevice;
    }

    protected get endpoint(): Endpoint {
        return this.#matterEndpoint;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.#fanControl.initialize();
        this.#registerMatterHandlers();
        this.#registerIoBrokerHandlers();
    }

    #registerMatterHandlers(): void {
        const fanEvents = this.#matterEndpoint.eventsOf(this.#fanControlServer);

        this.matterEvents.on(fanEvents.fanMode$Changed, async (_value, _oldValue, context) => {
            if (!hasLocalActor(context)) {
                await this.#fanControl.matterSpeedChanged();
            }
        });
        this.matterEvents.on(fanEvents.percentSetting$Changed, async (_value, _oldValue, context) => {
            if (!hasLocalActor(context)) {
                await this.#fanControl.matterSpeedChanged();
            }
        });

        if (fanEvents.rockSetting$Changed !== undefined) {
            this.matterEvents.on(fanEvents.rockSetting$Changed, async (value, _oldValue, context) => {
                if (!hasLocalActor(context)) {
                    await this.#fanControl.matterRockSettingChanged(value);
                }
            });
        }

        if (fanEvents.airflowDirection$Changed !== undefined) {
            this.matterEvents.on(fanEvents.airflowDirection$Changed, async (value, _oldValue, context) => {
                if (!hasLocalActor(context)) {
                    await this.#fanControl.matterAirflowDirectionChanged(value);
                }
            });
        }

        if (this.#hasOnOff) {
            const onOffEvents = this.#matterEndpoint.eventsOf(OnOffServer);
            if (onOffEvents?.onOff$Changed !== undefined) {
                this.matterEvents.on(onOffEvents.onOff$Changed, async (value, _oldValue, context) => {
                    if (!hasLocalActor(context)) {
                        await this.#fanControl.matterOnOffChanged(!!value);
                    }
                });
            }
        }
    }

    #registerIoBrokerHandlers(): void {
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                case PropertyType.Speed:
                case PropertyType.SpeedLevel:
                case PropertyType.Swing:
                case PropertyType.AirflowDirection:
                    await this.#fanControl.ioBrokerChanged();
                    break;
            }
        });
    }
}
