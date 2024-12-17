import type { EndpointNumber } from '@matter/main';
import { PowerSourceServer } from '@matter/main/behaviors/power-source';
import { PowerSource } from '@matter/main/clusters';

const BatteryPowerSource = PowerSourceServer.withFeatures(PowerSource.Feature.Battery);

export class BatteryPowerSourceServer extends BatteryPowerSource {
    override async initialize(): Promise<void> {
        this.reactTo(this.endpoint.lifecycle.partsReady, this.#setEndpointNumbers);
        return super.initialize();
    }

    #setEndpointNumbers(): void {
        const endpointNumbers = new Array<EndpointNumber>();
        this.endpoint.visit(({ number }) => {
            endpointNumbers.push(number);
        });
        this.state.endpointList = endpointNumbers;
        console.log(`Endpoint numbers set for PowerSource on : ${this.endpoint.id}`, endpointNumbers);
    }
}
