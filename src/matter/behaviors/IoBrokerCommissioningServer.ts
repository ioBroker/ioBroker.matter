import { CommissioningServer } from '@matter/main/node';

export class IoBrokerCommissioningServer extends CommissioningServer {
    override initiateCommissioning(): void {
        // Disable logging of the QR code
    }
}
