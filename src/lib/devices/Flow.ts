import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { FLOW_CONVERSION_MAP, FLOW_UNIT } from './unitConversions';

export class Flow extends GenericDevice {
    #getFlowState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'FLOW',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Flow,
                    unit: FLOW_UNIT,
                    unitConversionMap: FLOW_CONVERSION_MAP,
                    callback: state => (this.#getFlowState = state),
                },
            ]),
        );
    }

    getFlow(): number | undefined {
        if (!this.#getFlowState) {
            throw new Error('Flow state not found');
        }
        return this.#getFlowState.value;
    }

    updateFlow(value: number): Promise<void> {
        if (!this.#getFlowState) {
            throw new Error('Flow state not found');
        }
        return this.#getFlowState.updateValue(value);
    }
}
