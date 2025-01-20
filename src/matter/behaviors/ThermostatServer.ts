import { ThermostatServer } from '@matter/main/behaviors';
import { Thermostat } from '@matter/main/clusters';
import { StatusResponseError, StatusCode, ClusterType } from '@matter/main/types';
import type { ValueSupervisor } from '@matter/main';

const HeatingCoolingThermostat = ThermostatServer.with(
    Thermostat.Feature.Heating,
    Thermostat.Feature.Cooling,
    Thermostat.Feature.AutoMode,
);

export class ThermostatServerLogic extends HeatingCoolingThermostat {
    override async initialize(): Promise<void> {
        await super.initialize();

        this.reactTo(this.events.controlSequenceOfOperation$Changing, this.#controlSequenceOfOperationChanging);

        this.reactTo(this.events.occupiedCoolingSetpoint$Changing, this.#occupiedCoolingSetpointChanging);

        this.reactTo(this.events.occupiedHeatingSetpoint$Changing, this.#occupiedHeatingSetpointChanging);
    }

    #controlSequenceOfOperationChanging(
        _value: Thermostat.ControlSequenceOfOperation,
        oldValue: Thermostat.ControlSequenceOfOperation,
        context: ValueSupervisor.Session,
    ): void {
        if (context.offline) {
            // Writes should be silently ignored for backward compatibility reasons
            this.state.controlSequenceOfOperation = oldValue;
        }
    }

    #occupiedCoolingSetpointChanging(value: number): void {
        if (
            (this.state.minCoolSetpointLimit !== undefined && value < this.state.minCoolSetpointLimit) ||
            (this.state.maxCoolSetpointLimit !== undefined && value > this.state.maxCoolSetpointLimit)
        ) {
            throw new StatusResponseError('occupiedCoolingSetpoint out of range', StatusCode.ConstraintError);
        }

        if (
            this.state.occupiedHeatingSetpoint !== undefined &&
            this.state.minSetpointDeadBand !== undefined &&
            value < this.state.occupiedHeatingSetpoint + this.state.minSetpointDeadBand
        ) {
            this.state.occupiedHeatingSetpoint = value - this.state.minSetpointDeadBand;
        }
    }

    #occupiedHeatingSetpointChanging(value: number): void {
        if (
            (this.state.minHeatSetpointLimit !== undefined && value < this.state.minHeatSetpointLimit) ||
            (this.state.maxHeatSetpointLimit !== undefined && value > this.state.maxHeatSetpointLimit)
        ) {
            throw new StatusResponseError('occupiedHeatingSetpoint out of range', StatusCode.ConstraintError);
        }

        // If this attribute is set to a value that is greater than (OccupiedCoolingSetpoint - MinSetpointDeadBand),
        // the value of OccupiedCoolingSetpoint SHALL be adjusted to (OccupiedHeatingSetpoint + MinSetpointDeadBand).
        if (
            this.state.occupiedCoolingSetpoint !== undefined &&
            this.state.minSetpointDeadBand !== undefined &&
            value > this.state.occupiedCoolingSetpoint - this.state.minSetpointDeadBand
        ) {
            this.state.occupiedCoolingSetpoint = value + this.state.minSetpointDeadBand;
        }
    }

    override setpointRaiseLower({ mode, amount }: Thermostat.SetpointRaiseLowerRequest): void {
        if (
            (mode === Thermostat.SetpointRaiseLowerMode.Heat && !this.features.heating) ||
            (mode === Thermostat.SetpointRaiseLowerMode.Cool && !this.features.cooling)
        ) {
            throw new StatusResponseError('setpointRaiseLower called for wrong featureset', StatusCode.InvalidCommand);
        }

        const add = amount * 0.1;

        if (mode === Thermostat.SetpointRaiseLowerMode.Heat || mode === Thermostat.SetpointRaiseLowerMode.Both) {
            const newValue = this.state.occupiedHeatingSetpoint + add;
            this.state.occupiedHeatingSetpoint = this.#cropValue(
                newValue,
                this.state.minHeatSetpointLimit,
                this.state.maxHeatSetpointLimit,
            );
        }
        if (mode === Thermostat.SetpointRaiseLowerMode.Cool || mode === Thermostat.SetpointRaiseLowerMode.Both) {
            const newValue = this.state.occupiedCoolingSetpoint + add;
            this.state.occupiedCoolingSetpoint = this.#cropValue(
                newValue,
                this.state.minCoolSetpointLimit,
                this.state.maxCoolSetpointLimit,
            );
        }
    }

    #cropValue(value: number, min: number | undefined, max: number | undefined): number {
        return Math.max(min ?? value, Math.min(max ?? value, value));
    }
}

export class IoThermostatServer extends ThermostatServerLogic.for(ClusterType(Thermostat.Base)) {}
