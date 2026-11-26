import { Bytes } from '@matter/main';

/**
 * Byte limits of the Matter strings the adapter fills from ioBroker names. Matter strings are UTF-8 octets without
 * truncated code points (Matter Core specification § 7.19.2.40 "Character String Type"), and their length counts
 * octets, not characters (Appendix A.11.2).
 */
const NAME_BYTES = 32;
const PRODUCT_LABEL_BYTES = 64;

/** Labels of the Basic Information and Bridged Device Basic Information clusters for an ioBroker name. */
export interface BasicInformationLabels {
    nodeLabel: string;
    productName: string;
    productLabel: string;
}

/**
 * The NodeLabel, ProductName and ProductLabel for an ioBroker name, each cut to its byte limit on a code point
 * boundary.
 *
 * @see Matter Core specification § 11.1.5 "Attributes" (Basic Information cluster)
 */
export function basicInformationLabels(name: string): BasicInformationLabels {
    const shortName = Bytes.truncateUtf8(name, NAME_BYTES);
    return {
        nodeLabel: shortName,
        productName: shortName,
        productLabel: Bytes.truncateUtf8(name, PRODUCT_LABEL_BYTES),
    };
}

/**
 * A name cut to 32 bytes on a code point boundary, the limit of the device name a node announces for commissioning
 * and of a fabric label.
 *
 * @see Matter Core specification § 4.3.1.9 "TXT key for device name (DN)"
 * @see Matter Core specification § 11.18.4.5 "FabricDescriptorStruct Type"
 */
export function matterName(name: string): string {
    return Bytes.truncateUtf8(name, NAME_BYTES);
}
