import { ElectricityDataDevice } from './ElectricityDataDevice';

export abstract class GenericLightingDevice extends ElectricityDataDevice {
    abstract hasPower(): boolean;

    abstract getPower(): boolean | undefined;

    abstract setPower(value: boolean): Promise<void>;

    abstract updatePower(value: boolean): Promise<void>;
}
